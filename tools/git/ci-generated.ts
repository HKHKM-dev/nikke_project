// GitHub の CI（.github/workflows/ci.yml）で、作り直した生成物を扱う（plan/design-pr-conflicts.md 3.1 節）。PR は生成物を入れないので、
// CI は確認の前に npm run records:minimal で作り直し、その後にこれを回す。
//   node tools/git/ci-generated.ts            作り直しで生成物でないファイルが変わったら落とす（PR。records:check の書き換えを
//                                             ブランチが入れていない。npm run pr:prep が入れる）。main への push では知らせるだけ
//   node tools/git/ci-generated.ts --commit   main への push で、確認が通った後: 差分が無くてもデプロイキーで origin を読み書き
//                                             できるか（ls-remote と push --dry-run）を確かめ、生成物の差分を commit し、origin/main がまだこの commit なら push する（進んで
//                                             いれば、後の commit の CI が全部を作り直すので何もしない）。決まりごとは ci-generated-lib.ts
// push には、書き込みのできるデプロイキーの秘密鍵（環境変数 DEPLOY_KEY。secret の GENERATED_DEPLOY_KEY）を使う。main は PR 必須で、
// GITHUB_TOKEN（github-actions[bot]）は ruleset の bypass に足せないので、デプロイキーを bypass に足してある。
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { GENERATED_PATHS, ROOT } from '../../packages/core/scripts/records-data.ts';
import { commitGenerated, type GitRun } from './ci-generated-lib.ts';
import { nulPaths, pathListArgs, splitGenerated } from './pr-prep-lib.ts';

const { values } = parseArgs({ options: { commit: { type: 'boolean', default: false } } });

/** git を呼ぶ（0 以外で終わっても投げない。標準エラーは結果に入れる） */
function git(args: readonly string[], env?: Readonly<Record<string, string>>): GitRun {
  const r = spawnSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
  });
  return { status: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? r.error?.message ?? '' };
}

/** 鍵をファイルに置き、git の ssh に渡す環境変数を返す */
function sshEnv(key: string): Record<string, string> {
  const keyPath = join(process.env['RUNNER_TEMP'] ?? tmpdir(), 'generated-deploy-key');
  writeFileSync(keyPath, key.endsWith('\n') ? key : `${key}\n`, { mode: 0o600 });
  return { GIT_SSH_COMMAND: `ssh -i ${keyPath} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new` };
}

const diff = git(pathListArgs(['diff', '--name-only', 'HEAD']));
if (diff.status !== 0) throw new Error(`git diff が ${diff.status} で終わった: ${diff.stderr}`);
const changed = splitGenerated(nulPaths(diff.stdout), GENERATED_PATHS);
const onMain = process.env['GITHUB_EVENT_NAME'] === 'push';

if (!values.commit) {
  console.log(`作り直しで変わった生成物: ${changed.generated.join('・') || 'なし'}`);
  if (changed.other.length > 0) {
    const message = `records:check が生成物でないファイルを書き換えた（npm run pr:prep で commit する）: ${changed.other.join('・')}`;
    console.log(`::${onMain ? 'warning' : 'error'}::${message}`);
    if (!onMain) process.exit(1);
  }
  process.exit(0);
}

if (!onMain) throw new Error('--commit は main への push の CI でだけ回す');
try {
  console.log(
    commitGenerated({
      generated: changed.generated,
      sha: process.env['GITHUB_SHA'],
      repo: process.env['GITHUB_REPOSITORY'],
      key: process.env['DEPLOY_KEY'],
      sshEnv,
      git,
    }),
  );
} catch (e) {
  // GitHub の注釈は 1 行なので、改行は %0A にする
  const message = (e as Error).message.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  console.log(`::error::${message}`);
  process.exit(1);
}
