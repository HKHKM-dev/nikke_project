// PR の前に main を取り込み、生成物を作り直して CI と同じ確認を回す（plan/design-workflow-simplification-4.md 2 節。AGENTS.md「コミット手順」）。
//   npm run pr:prep [-- --push] [--no-ci] [--allow-progress]
// 1. 作業中の変更が無いことと、main の上でないことを確かめ、git fetch origin。
// 2. ブランチで足した検証記録・結論・録画の ID が main と重なっていたら、リベースの前に止めて records:renumber のコマンドを出す。
//    backlog.md 8 節・段の一覧の経過・設計書の「状態」の行に進み具合を書き写していたら、止めて行を出す（--allow-progress で通す。
//    plan/design-workflow-simplification-6.md 2 節）。
// 3. git rebase origin/main。衝突したファイルが全部生成物（records-data.ts の GENERATED_PATHS）なら main の版を取って続ける。
//    生成物でないファイルが 1 つでもあれば、そこで止めてファイルを出す（人が直して git add し、もう一度 npm run pr:prep を回すと続きから）。
// 4. 生成物を 1 回だけ作り直す（ブランチが感度を変えていたか、それが衝突したときは records:minimal、ほかは records:check）。差分が
//    あれば「生成物を作り直す」の commit を足す（スカッシュマージなので、途中のコミットの生成物は合っていなくてよい）。
// 5. CI と同じ確認（--no-ci で省く）。書式（prettier）と lint（eslint）は、ブランチで変えたファイルだけを見る（全部は GitHub の CI が
//    見る。設定を変えたブランチは全部。plan/design-workflow-simplification-8.md 1 節）。npm run ci のほかの段（型・テスト・ビルド）は
//    全部。--push なら、通ったら git push --force-with-lease -u origin HEAD。
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { GENERATED_PATHS, ROOT, SENSITIVITY_PATH, idsInBranches } from '../../packages/core/scripts/records-data.ts';
import {
  addedLines,
  changedChecks,
  checkSteps,
  collisions,
  nulPaths,
  pathListArgs,
  PROGRESS_PATHS,
  progressCopies,
  rebaseOutcome,
  regenerateScript,
  splitConflicts,
} from './pr-prep-lib.ts';

const { values } = parseArgs({
  options: {
    push: { type: 'boolean', default: false },
    'no-ci': { type: 'boolean', default: false },
    'allow-progress': { type: 'boolean', default: false },
  },
});

/** 成功したら標準出力。失敗したら投げる */
function gitRaw(args: readonly string[]): string {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/** 成功したら標準出力（前後の空白を除く）。失敗したら投げる */
function git(args: readonly string[]): string {
  return gitRaw(args).trim();
}

/** パスの一覧（-z で読む。ASCII でないパスも、そのままの形で） */
function gitPaths(args: readonly string[]): string[] {
  return nulPaths(gitRaw(pathListArgs(args)));
}

/** 失敗しても投げない git（終了コードを返す） */
function tryGit(args: readonly string[], env?: NodeJS.ProcessEnv): number {
  return spawnSync('git', args, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...env } }).status ?? 1;
}

function npm(script: string): void {
  const r = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', script], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (r.status !== 0) fail(`npm run ${script} が落ちた`);
}

/** node_modules の道具を、package.json の bin から node で回す（npx を通さない。Windows でも同じ。eslint は bin を exports に出していない） */
function bin(pkg: string, args: readonly string[]): void {
  const manifest = createRequire(import.meta.url).resolve(`${pkg}/package.json`);
  const field = (JSON.parse(readFileSync(manifest, 'utf8')) as { bin: string | Record<string, string> }).bin;
  const entry = join(dirname(manifest), typeof field === 'string' ? field : field[pkg]!);
  const r = spawnSync(process.execPath, [entry, ...args], { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) fail(`${pkg} が落ちた`);
}

function fail(message: string): never {
  console.error(`pr:prep: ${message}`);
  process.exit(1);
}

const gitDir = git(['rev-parse', '--absolute-git-dir']);
const rebasing = () => existsSync(`${gitDir}/rebase-merge`) || existsSync(`${gitDir}/rebase-apply`);
const sensitivity = SENSITIVITY_PATH.slice(ROOT.length);
const NO_EDITOR = { GIT_EDITOR: 'true' };

const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
const conflictedSoFar: string[] = [];

if (!rebasing()) {
  if (branch === 'main' || branch === 'HEAD') fail('トピックブランチで回す（main の上か、ブランチが無い）');
  if (git(['status', '--porcelain', '--untracked-files=no']) !== '') fail('作業中の変更がある。commit してから回す');
  if (tryGit(['fetch', '--quiet', 'origin']) !== 0) fail('git fetch origin が落ちた');

  const added = gitPaths(['diff', '--name-only', '--diff-filter=AR', 'origin/main...HEAD', '--', 'records']);
  const mainFiles = gitPaths([
    'ls-tree',
    '-r',
    '--name-only',
    'origin/main',
    '--',
    'records/verifications',
    'records/claims',
    'records/recordings',
  ]);
  const found = collisions(added, mainFiles, idsInBranches().ids);
  if (found.length > 0) {
    console.error('ブランチで足した番号が main と重なっている。振り直して commit してから、もう一度回す:');
    for (const c of found)
      console.error(`  npm run records:renumber -- ${c.id} ${c.suggestion ?? '<空いている録画の番号>'}`);
    process.exit(1);
  }

  if (!values['allow-progress']) {
    const diff = git(['diff', '-U0', 'origin/main...HEAD', '--', ...PROGRESS_PATHS]);
    // 作業中の変更が無いことは確かめたので、作業ツリーのファイルがブランチの版
    const copies = [...addedLines(diff)].flatMap(([path, added]) =>
      added.size === 0 ? [] : progressCopies(path, readFileSync(join(ROOT, path), 'utf8'), added),
    );
    if (copies.length > 0) {
      console.error(
        '進み具合を書き写した行がある（AGENTS.md「文書の書き方」の進み具合の行）。直して commit してから、もう一度回す（段の出来事などで要る行なら --allow-progress）:',
      );
      for (const c of copies) console.error(`  ${c}`);
      process.exit(1);
    }
  }

  const behind = git(['rev-list', '--count', 'HEAD..origin/main']);
  if (behind !== '0') {
    console.log(`origin/main が ${behind} 件進んでいる。リベースする`);
    const outcome = rebaseOutcome(tryGit(['rebase', 'origin/main'], NO_EDITOR), rebasing());
    if (outcome === 'clean') console.log('衝突なしで取り込んだ');
    else if (outcome === 'notStarted')
      fail(
        'git rebase origin/main が始まらなかった（追跡していないファイルが main のファイルと重なったなど。上の git の出力を見る）',
      );
  } else console.log('origin/main は取り込み済み');
}

// リベースの途中（衝突で止まったか、前の回で人が直している途中）なら、生成物の衝突を解いて続ける
while (rebasing()) {
  const conflicted = gitPaths(['diff', '--name-only', '--diff-filter=U']);
  const { generated, other } = splitConflicts(conflicted, GENERATED_PATHS);
  if (other.length > 0) {
    console.error('生成物でないファイルが衝突した。直して git add し、もう一度 npm run pr:prep を回す:');
    for (const p of other) console.error(`  ${p}`);
    process.exit(1);
  }
  if (generated.length > 0) {
    console.log(`生成物の衝突は main の版を取る（終わりに作り直す）: ${generated.join('・')}`);
    git(['checkout', '--ours', '--', ...generated]);
    git(['add', '--', ...generated]);
    conflictedSoFar.push(...generated);
  }
  if (tryGit(['rebase', '--continue'], NO_EDITOR) !== 0 && rebasing()) {
    // 次のコミットが衝突したなら、次の回で解く
    if (git(['diff', '--name-only', '--diff-filter=U']) !== '') continue;
    // 生成物だけのコミットは、main の版を取ると空になる。そのコミットは飛ばす
    if (tryGit(['diff', '--cached', '--quiet']) !== 0)
      fail('git rebase --continue が衝突のほかの理由で落ちた（リベースの途中のまま）');
    if (
      tryGit(['rebase', '--skip'], NO_EDITOR) !== 0 &&
      rebasing() &&
      git(['diff', '--name-only', '--diff-filter=U']) === ''
    )
      fail('git rebase --skip が落ちた（リベースの途中のまま）');
  }
}

const branchChanged = gitPaths(['diff', '--name-only', 'origin/main...HEAD']);
const script = regenerateScript(branchChanged, conflictedSoFar, sensitivity);
console.log(`生成物を作り直す（npm run ${script}）`);
npm(script);
if (git(['status', '--porcelain', '--untracked-files=no']) !== '') {
  git(['add', '-u']);
  git(['commit', '--quiet', '-m', '生成物を作り直す']);
  console.log('生成物を作り直した差分を commit した');
}

if (!values['no-ci']) {
  const checks = changedChecks(gitPaths(['diff', '--name-only', 'origin/main...HEAD']), (p) =>
    existsSync(join(ROOT, p)),
  );
  if (checks.full) {
    console.log(`書式と lint も全部のファイルで見る（${checks.reason}）`);
    npm('ci');
  } else {
    console.log(
      `書式と lint は、ブランチで変えたファイル ${checks.format.length} 件だけを見る（全部は GitHub の CI が見る）`,
    );
    if (checks.format.length > 0) bin('prettier', ['--check', '--ignore-unknown', ...checks.format]);
    if (checks.lint.length > 0) bin('eslint', ['--no-warn-ignored', ...checks.lint]);
    const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    for (const script of checkSteps(manifest.scripts['ci']!)) npm(script);
  }
}

if (values.push) {
  if (tryGit(['push', '--force-with-lease', '-u', 'origin', 'HEAD']) !== 0) fail('push が落ちた');
} else console.log('通った。push は git push --force-with-lease -u origin HEAD（か npm run pr:prep -- --push）');
