// PR の前に main を取り込み、生成物を作り直して CI と同じ確認を回す（plan/design-workflow-simplification-4.md 2 節。AGENTS.md「コミット手順」）。
// 生成物は PR に入れない（main の版に戻して push する。マージの後に GitHub の CI が main で作り直して commit する。plan/design-pr-conflicts.md 3.1 節）。
//   npm run pr:prep [-- --push] [--no-ci] [--allow-progress]
// 1. 作業中の変更が無いことと、main の上でないことを確かめ、git fetch origin。
// 2. ブランチで足した検証記録・結論・録画の ID が main と重なっていたら、リベースの前に止めて records:renumber のコマンドを出す。
//    課題のファイルで足した 2 節の番号（records/backlog/2-NN.json）が main と重なっていたら、止めて空いた番号を出す。
//    8 節・8.2 節の課題のファイル（records/backlog/）・段の一覧の経過・設計書の「状態」の行に進み具合を書き写していたら、止めて行を
//    出す（--allow-progress で通す。plan/design-workflow-simplification-6.md 2 節・plan/design-backlog-files.md 2.8 節）。
//    plan/backlog.md（生成物）を手で直していたら、止めて行を出す（直しは生成物を main の版に戻すと消えるので。同 2.11 節）。
// 3. git rebase origin/main。衝突したファイルが全部生成物（records-data.ts の GENERATED_PATHS）なら main の版を取って続ける。
//    生成物でないファイルが 1 つでもあれば、そこで止めてファイルを出す（人が直して git add し、もう一度 npm run pr:prep を回すと続きから）。
// 4. 生成物を 1 回だけ作り直す（records:minimal。感度は変わった組だけ計算し直し、records:check も回る）。作り直しで生成物でない
//    ファイル（開いている検証記録の予測との比べの表・整形）が変わったら、「records:check の書き換え」の commit を足す。
// 5. CI と同じ確認（--no-ci で省く）。書式（prettier）と lint（eslint）は、ブランチで変えたファイルだけを見る（全部は GitHub の CI が
//    見る。設定を変えたブランチは全部。plan/design-workflow-simplification-8.md 1 節）。npm run ci のほかの段（型・テスト・ビルド）は
//    全部。確認は作り直した生成物の上で回す（GitHub の CI も作り直してから回す）。
// 6. 生成物を main の版に戻し、ブランチが変えていたら「生成物を main の版に戻す」の commit を足す（スカッシュマージなので、途中の
//    コミットの生成物は合っていなくてよい）。作業ツリーの生成物も main の版になるので、手元で npm test を回すなら作り直す。
//    --push なら git push --force-with-lease -u origin HEAD。
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import {
  BACKLOG_PATH,
  GENERATED_PATHS,
  ROOT,
  idsInBranches,
  renderBacklogOfData,
} from '../../packages/core/scripts/records-data.ts';
import { backlogNameOfPath, backlogNumber, type BacklogFile } from '../../packages/core/src/records/backlog.ts';
import {
  addedLines,
  backlogProgressCopy,
  branchChangedChecks,
  handEditedLines,
  checkSteps,
  collisions,
  nulPaths,
  pathListArgs,
  PROGRESS_PATHS,
  progressCopies,
  rebaseOutcome,
  short,
  splitGenerated,
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
const NO_EDITOR = { GIT_EDITOR: 'true' };

const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);

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
    'records/backlog',
  ]);
  const found = collisions(added, mainFiles, idsInBranches().ids);
  if (found.length > 0) {
    console.error('ブランチで足した番号が main と重なっている。振り直して commit してから、もう一度回す:');
    for (const c of found)
      console.error(
        backlogNumber(c.id) === undefined
          ? `  npm run records:renumber -- ${c.id} ${c.suggestion ?? '<空いている録画の番号>'}`
          : // 課題の番号は文の中の目印が無いので道具では振り直さない（plan/design-backlog-files.md 2.2 節）
            `  git mv records/backlog/${c.id}.json records/backlog/${c.suggestion}.json（自分のブランチの中の参照の「${c.id}」も直す）`,
      );
    process.exit(1);
  }

  const backlogPath = BACKLOG_PATH.slice(ROOT.length);
  const editedLines = addedLines(git(['diff', '-U0', 'origin/main...HEAD', '--', backlogPath])).get(backlogPath);
  if (editedLines !== undefined && editedLines.size > 0) {
    // 作業中の変更が無いことは確かめたので、作業ツリーのファイルがブランチの版
    const text = readFileSync(BACKLOG_PATH, 'utf8').split('\n');
    const edited = handEditedLines(
      [...editedLines].map((n) => text[n - 1] ?? ''),
      renderBacklogOfData(),
    );
    if (edited.length > 0) {
      console.error(
        `${backlogPath} は生成物で、手で直しても PR に入らない。次の行を課題のファイル（records/backlog/）に移し、git checkout origin/main -- ${backlogPath} で戻して commit してから、もう一度回す（作り直しを commit した後に課題のファイルを直しただけなら、戻して commit するだけでよい）:`,
      );
      for (const l of edited) console.error(`  ${short(l)}`);
      process.exit(1);
    }
  }

  if (!values['allow-progress']) {
    const diff = git(['diff', '-U0', 'origin/main...HEAD', '--', ...PROGRESS_PATHS]);
    // 作業中の変更が無いことは確かめたので、作業ツリーのファイルがブランチの版
    const copies = [...addedLines(diff)].flatMap(([path, added]) =>
      added.size === 0 ? [] : progressCopies(path, readFileSync(join(ROOT, path), 'utf8'), added),
    );
    for (const path of gitPaths([
      'diff',
      '--name-only',
      '--diff-filter=AMR',
      'origin/main...HEAD',
      '--',
      'records/backlog',
    ])) {
      if (backlogNameOfPath(path) === undefined) continue;
      const branchFile = JSON.parse(readFileSync(join(ROOT, path), 'utf8')) as BacklogFile;
      const mainFile = mainFiles.includes(path)
        ? (JSON.parse(gitRaw(['show', `origin/main:${path}`])) as BacklogFile)
        : undefined;
      const copy = backlogProgressCopy(path, branchFile, mainFile);
      if (copy !== undefined) copies.push(copy);
    }
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
  const { generated, other } = splitGenerated(conflicted, GENERATED_PATHS);
  if (other.length > 0) {
    console.error('生成物でないファイルが衝突した。直して git add し、もう一度 npm run pr:prep を回す:');
    for (const p of other) console.error(`  ${p}`);
    process.exit(1);
  }
  if (generated.length > 0) {
    console.log(`生成物の衝突は main の版を取る（終わりに作り直す）: ${generated.join('・')}`);
    git(['checkout', '--ours', '--', ...generated]);
    git(['add', '--', ...generated]);
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

console.log('生成物を作り直す（npm run records:minimal）');
npm('records:minimal');
const rewritten = splitGenerated(gitPaths(['diff', '--name-only']), GENERATED_PATHS).other;
if (rewritten.length > 0) {
  git(['add', '--', ...rewritten]);
  git(['commit', '--quiet', '-m', 'records:check の書き換え']);
  console.log(`records:check が書き換えた生成物でないファイルを commit した: ${rewritten.join('・')}`);
}

if (!values['no-ci']) {
  const checks = branchChangedChecks('origin/main', gitRaw, (p) => existsSync(join(ROOT, p)));
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
    for (const script of checkSteps(manifest.scripts['ci'])) npm(script);
  }
}

git(['checkout', 'origin/main', '--', ...GENERATED_PATHS]);
if (tryGit(['diff', '--cached', '--quiet']) !== 0) {
  git(['commit', '--quiet', '-m', '生成物を main の版に戻す']);
  console.log('生成物を main の版に戻した（マージの後に CI が main で作り直す）');
}
console.log('作業ツリーの生成物は main の版。手元で npm test を回すなら npm run records:minimal で作り直す');

if (values.push) {
  if (tryGit(['push', '--force-with-lease', '-u', 'origin', 'HEAD']) !== 0) fail('push が落ちた');
} else console.log('通った。push は git push --force-with-lease -u origin HEAD（か npm run pr:prep -- --push）');
