// GitHub の CI（.github/workflows/ci.yml）で、作り直した生成物を扱う（plan/design-pr-conflicts.md 3.1 節）。PR は生成物を入れないので、
// CI は確認の前に npm run records:minimal で作り直し、その後にこれを回す。
//   node tools/git/ci-generated.ts            作り直しで生成物でないファイルが変わったら落とす（PR。records:check の書き換えを
//                                             ブランチが入れていない。npm run pr:prep が入れる）。main への push では知らせるだけ
//   node tools/git/ci-generated.ts --commit   main への push で、確認が通った後: 生成物の差分を commit し、origin/main がまだこの
//                                             commit なら push する（進んでいれば、後の commit の CI が全部を作り直すので何もしない）
// push には環境変数 GH_TOKEN（GITHUB_TOKEN）を使う。main は PR 必須なので、ruleset の bypass に GitHub Actions が要る。
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { GENERATED_PATHS, ROOT } from '../../packages/core/scripts/records-data.ts';
import { nulPaths, splitGenerated } from './pr-prep-lib.ts';

const { values } = parseArgs({ options: { commit: { type: 'boolean', default: false } } });

function git(args: readonly string[]): string {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
}

const changed = splitGenerated(nulPaths(git(['diff', '-z', '--name-only', 'HEAD'])), GENERATED_PATHS);
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
const token = process.env['GH_TOKEN'];
const repo = process.env['GITHUB_REPOSITORY'];
if (!sha || !token || !repo) throw new Error('GITHUB_SHA・GH_TOKEN・GITHUB_REPOSITORY が要る');
const remote = `https://x-access-token:${token}@github.com/${repo}.git`;
const head = git(['ls-remote', remote, 'refs/heads/main']).split('\t')[0];
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
git(['push', '--quiet', remote, 'HEAD:refs/heads/main']);
console.log(`生成物を作り直して main に push した: ${changed.generated.join('・')}`);
