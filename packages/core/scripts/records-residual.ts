// 観測値の残差を引く（plan/residuals.md には見る行しか載せない。plan/design-workflow-simplification-3.md 2 節）。
// 使い方: npm run records:residual -- <観測値 ID|録画 id|V-NNNN>[,...] [...] [--base <ref> [--exact]]
//         npm run records:residual -- --all [--base <ref> [--exact]]
// 引いた観測値（--all で全部）のうち比べるものはモデルと比べて residuals.md と同じ列で、比べないものは値を出す。
// --base <ref>（origin/main など）は、その版を一時の worktree に取り出し、その版のコードとデータで同じ観測値を回して、予測か判定が
// 変わった行だけを出す（コード・データを変えた PR の前後比べ。plan/design-workflow-simplification-15.md 5 節）。基の版の records-data.ts・
// residual-cache.ts を同じプロセスで読むので、その 2 つの入口の形が今と同じ版とだけ比べられる。依存（node_modules）と予測値の覚えの
// 置き場所（node_modules/.cache/residuals/）は今の作業ツリーのものを使うので、基の版の予測値も覚えに残る。
// --exact は予測を丸めずに比べ、丸めの下の変わりも出す（振る舞いを変えない作り替えの確かめ。plan/design-workflow-simplification-17.md 7 節）。
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { claimsByObservation } from '../src/records/claims.ts';
import { renderOtherRows, renderResidualChanges, renderResidualRows } from '../src/records/observations/render.ts';
import { ROOT, loadClaims, splitIds } from './records-data.ts';
import type * as RecordsData from './records-data.ts';
import type * as ResidualCache from './residual-cache.ts';
import { cliArgs } from './cli.ts';

const { values, positionals } = cliArgs(import.meta.url, {
  allowPositionals: true,
  options: {
    all: { type: 'boolean', default: false },
    base: { type: 'string' },
    exact: { type: 'boolean', default: false },
  },
});
const keys = positionals.flatMap(splitIds);
if (keys.length === 0 && !values.all) {
  console.error(
    '使い方: npm run records:residual -- <観測値 ID|録画 id|V-NNNN>[,...] [--base <ref> [--exact]] か -- --all [--base <ref> [--exact]]',
  );
  process.exit(1);
}

/** root（作業ツリー）の版のコードとデータで、観測値を選んでモデルと比べる */
async function residualsOf(root: string) {
  const load = (path: string) => import(pathToFileURL(join(root, 'packages/core/scripts', path)).href);
  const data = (await load('records-data.ts')) as typeof RecordsData;
  const cache = (await load('residual-cache.ts')) as typeof ResidualCache;
  const observations = data.loadObservations();
  const { picked, missing } = values.all
    ? { picked: observations, missing: [] }
    : data.pickObservations(observations, keys);
  const file = data.loadRecordingsFile();
  const residuals = cache.runObservationsCached(picked, data.recordingMap(file), data.loadRecordsData(file));
  return { picked, missing, residuals };
}

const git = (args: readonly string[]) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
// 基の版が無ければ、今の版を回す前に止める
if (values.base !== undefined && git(['rev-parse', '--verify', '--quiet', `${values.base}^{commit}`]).status !== 0) {
  console.error(`基の版 ${values.base} が無い`);
  process.exit(1);
}
const { picked, missing, residuals } = await residualsOf(ROOT);
if (missing.length > 0) console.error(`当たる観測値が無い: ${missing.join('、')}`);

if (values.base !== undefined) {
  const dir = mkdtempSync(join(tmpdir(), 'records-residual-'));
  const added = git(['worktree', 'add', '--detach', '--quiet', dir, values.base]);
  if (added.status !== 0) {
    console.error(`${values.base} を取り出せなかった: ${added.stderr.trim()}`);
    process.exit(1);
  }
  const link = join(dir, 'node_modules');
  try {
    symlinkSync(join(ROOT, 'node_modules'), link, 'junction');
    const base = await residualsOf(dir);
    console.log(`${values.base} と比べた:`);
    console.log(renderResidualChanges(base.residuals, residuals, { exact: values.exact }).join('\n'));
  } catch (e) {
    console.error(
      `${values.base} の版を回せなかった（records-data.ts・residual-cache.ts の入口の形が今と違う版とは比べられない）: ${(e as Error).message}`,
    );
    process.exitCode = 1;
  } finally {
    // リンクを先に外す（worktree を消すときに、リンクの先の node_modules に触れないように）
    try {
      unlinkSync(link);
    } catch {
      // リンクを作る前に落ちた
    }
    git(['worktree', 'remove', '--force', dir]);
    rmSync(dir, { recursive: true, force: true });
  }
} else {
  const claimsOf = claimsByObservation(loadClaims());
  const others = picked.filter((o) => o.use !== 'compare');
  if (residuals.length > 0)
    console.log([`比べた観測値 ${residuals.length} 件`, '', ...renderResidualRows(residuals, claimsOf)].join('\n'));
  if (others.length > 0) {
    console.log(
      [
        ...(residuals.length > 0 ? [''] : []),
        `モデルと比べない観測値 ${others.length} 件`,
        '',
        ...renderOtherRows(others, claimsOf),
      ].join('\n'),
    );
  }
}
if (missing.length > 0) process.exit(1);
