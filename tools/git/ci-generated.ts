// GitHub の CI（.github/workflows/ci.yml）で、作り直した生成物を扱う（plan/design-pr-conflicts.md 3.1 節）。PR は生成物を入れないので、
// CI は確認の前に npm run records:minimal で作り直し、その後にこれを回す。
//   node tools/git/ci-generated.ts            作り直しで生成物でないファイルが変わったら落とす（PR。records:check の書き換えを
//                                             ブランチが入れていない。npm run pr:prep が入れる）。main への push では知らせるだけ
//   node tools/git/ci-generated.ts --export <dir>
//                                             main への push で、確認が通った後: 生成物を全部 <dir> に写す（artifact で鍵のジョブに渡す）
//   node tools/git/ci-generated.ts --commit <dir>
//                                             鍵のジョブ（main の版を取り出しただけで、npm ci もしない）で: <dir> の生成物を作業ツリーに
//                                             戻し、差分が無くてもデプロイキーで origin を読み書きできるか（ls-remote と push --dry-run）を
//                                             確かめ、生成物の差分を commit し、origin/main がまだこの commit なら push する（進んでいれば、
//                                             後の commit の CI が全部を作り直すので何もしない）。決まりごとは ci-generated-lib.ts
// push には、書き込みのできるデプロイキーの秘密鍵（環境変数 DEPLOY_KEY。environment の main-push の secret の GENERATED_DEPLOY_KEY）を
// 使う。main は PR 必須で、GITHUB_TOKEN（github-actions[bot]）は ruleset の bypass に足せないので、デプロイキーを bypass に足してある。
// 鍵を使うジョブを確認のジョブと分けるのは、確認で回すコード（依存のパッケージを含む）に鍵を見せないため（plan/design-deploy-key-scope.md 2 節）。
import { spawnSync } from 'node:child_process';
import { GENERATED_PATHS, ROOT } from '../../packages/core/scripts/records-data.ts';
import { commitGenerated, exportGenerated, type GitRun, restoreGenerated } from './ci-generated-lib.ts';
import { sshEnv } from './deploy-key.ts';
import { nulPaths, pathListArgs, splitGenerated } from './pr-prep-lib.ts';
import { cliArgs } from '../../packages/core/scripts/cli.ts';

const { values } = cliArgs(import.meta.url, {
  options: { commit: { type: 'string' }, export: { type: 'string' } },
});

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

/** 作業ツリーの HEAD からの差分を、生成物とほかに分ける */
function changedFiles(): { generated: string[]; other: string[] } {
  const diff = git(pathListArgs(['diff', '--name-only', 'HEAD']));
  if (diff.status !== 0) throw new Error(`git diff が ${diff.status} で終わった: ${diff.stderr}`);
  return splitGenerated(nulPaths(diff.stdout), GENERATED_PATHS);
}
const onMain = process.env['GITHUB_EVENT_NAME'] === 'push';

if (values.export !== undefined) {
  exportGenerated(ROOT, values.export, GENERATED_PATHS);
  console.log(`鍵のジョブに渡す生成物のうち、作り直しで変わったもの: ${changedFiles().generated.join('・') || 'なし'}`);
  process.exit(0);
}

if (values.commit === undefined) {
  const changed = changedFiles();
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
  restoreGenerated(values.commit, ROOT, GENERATED_PATHS);
  console.log(
    commitGenerated({
      generated: changedFiles().generated,
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
