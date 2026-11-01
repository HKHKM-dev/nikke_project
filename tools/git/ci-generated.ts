// GitHub の CI（.github/workflows/ci.yml）で、作り直した生成物を扱う（plan/design-pr-conflicts.md 3.1 節）。PR は生成物を入れないので、
// CI は確認の前に npm run records:minimal で作り直し、その後にこれを回す。
//   node tools/git/ci-generated.ts            作り直しで生成物でないファイルが変わったら落とす（PR。records:check の書き換えを
//                                             ブランチが入れていない。npm run pr:prep が入れる）。main への push では知らせるだけ
//   node tools/git/ci-generated.ts --commit   main への push で、確認が通った後: 生成物の差分を commit し、origin/main がまだこの
//                                             commit なら push する（進んでいれば、後の commit の CI が全部を作り直すので何もしない）
// push には、書き込みのできるデプロイキーの秘密鍵（環境変数 DEPLOY_KEY。secret の GENERATED_DEPLOY_KEY）を使う。main は PR 必須で、
// GITHUB_TOKEN（github-actions[bot]）は ruleset の bypass に足せないので、デプロイキーを bypass に足してある。
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { GENERATED_PATHS, ROOT } from '../../packages/core/scripts/records-data.ts';
import { nulPaths, pathListArgs, splitGenerated } from './pr-prep-lib.ts';

const { values } = parseArgs({ options: { commit: { type: 'boolean', default: false } } });

function git(args: readonly string[], env?: NodeJS.ProcessEnv): string {
  return execFileSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    env: { ...process.env, ...env },
  });
}

const changed = splitGenerated(nulPaths(git(pathListArgs(['diff', '--name-only', 'HEAD']))), GENERATED_PATHS);
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
if (changed.generated.length === 0) {
  console.log('生成物は合っている');
  process.exit(0);
}
const sha = process.env['GITHUB_SHA'];
const key = process.env['DEPLOY_KEY'];
const repo = process.env['GITHUB_REPOSITORY'];
if (!sha || !repo) throw new Error('GITHUB_SHA・GITHUB_REPOSITORY が要る');
if (!key) throw new Error('secret の GENERATED_DEPLOY_KEY（書き込みのできるデプロイキーの秘密鍵）が要る');
const keyPath = join(process.env['RUNNER_TEMP'] ?? tmpdir(), 'generated-deploy-key');
writeFileSync(keyPath, key.endsWith('\n') ? key : `${key}\n`, { mode: 0o600 });
const ssh = { GIT_SSH_COMMAND: `ssh -i ${keyPath} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new` };
const remote = `git@github.com:${repo}.git`;
const head = git(['ls-remote', remote, 'refs/heads/main'], ssh).split('\t')[0];
if (head !== sha) {
  console.log(
    `origin/main が進んでいる（${head?.slice(0, 8)}）。その commit の CI が作り直すので、ここでは commit しない`,
  );
  process.exit(0);
}
git([
  '-c',
  'user.name=github-actions[bot]',
  '-c',
  'user.email=41898283+github-actions[bot]@users.noreply.github.com',
  'commit',
  '--quiet',
  '-m',
  '生成物を作り直す（CI）',
  '--',
  ...changed.generated,
]);
git(['push', '--quiet', remote, 'HEAD:refs/heads/main'], ssh);
console.log(`生成物を作り直して main に push した: ${changed.generated.join('・')}`);
