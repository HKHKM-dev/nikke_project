// 観測値の残差を引く（plan/residuals.md には見る行しか載せない。plan/design-workflow-simplification-3.md 2 節）。
// 使い方: npm run records:residual -- <観測値 ID|録画 id|V-NNNN>[,...] [...] [--base <ref>]
//         npm run records:residual -- --all [--base <ref>]
// 引いた観測値（--all で全部）のうち比べるものはモデルと比べて residuals.md と同じ列で、比べないものは値を出す。
// --base <ref>（origin/main など）は、その版を一時の worktree に取り出して同じ観測値を回し、予測か判定が変わった行だけを出す
// （コード・データを変えた PR の前後比べ。plan/design-workflow-simplification-15.md 5 節）。基の版の予測値も覚え（residual-cache.ts）に残る。
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { claimsByObservation } from '../src/records/claims.ts';
import type { Residual } from '../src/records/observations/run.ts';
import type { Observation } from '../src/records/observations/types.ts';
import { renderOtherRows, renderResidualChanges, renderResidualRows } from '../src/records/observations/render.ts';
import { ROOT, splitIds } from './records-data.ts';
import * as head from './records-data.ts';
import * as headCache from './residual-cache.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { all: { type: 'boolean', default: false }, base: { type: 'string' } },
});
const keys = positionals.flatMap(splitIds);
if (keys.length === 0 && !values.all) {
  console.error(
    '使い方: npm run records:residual -- <観測値 ID|録画 id|V-NNNN>[,...] [--base <ref>] か -- --all [--base <ref>]',
  );
  process.exit(1);
}

type Data = typeof head;
type Cache = typeof headCache;
/** その版の観測値を選んでモデルと比べる */
function residualsOf(data: Data, cache: Cache): { picked: Observation[]; missing: string[]; residuals: Residual[] } {
  const observations = data.loadObservations();
  const { picked, missing } = values.all
    ? { picked: observations, missing: [] }
    : data.pickObservations(observations, keys);
  const file = data.loadRecordingsFile();
  return {
    picked,
    missing,
    residuals: cache.runObservationsCached(picked, data.recordingMap(file), data.loadRecordsData(file)),
  };
}

const { picked, missing, residuals } = residualsOf(head, headCache);
if (missing.length > 0) console.error(`当たる観測値が無い: ${missing.join('、')}`);

if (values.base !== undefined) {
  const dir = mkdtempSync(join(tmpdir(), 'records-residual-'));
  const git = (args: readonly string[]) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  const added = git(['worktree', 'add', '--detach', '--quiet', dir, values.base]);
  if (added.status !== 0) {
    console.error(`${values.base} を取り出せなかった: ${added.stderr.trim()}`);
    process.exit(1);
  }
  const link = join(dir, 'node_modules');
  try {
    // 依存と予測値の覚え（node_modules/.cache/residuals/）は今の作業ツリーのものを使う
    symlinkSync(join(ROOT, 'node_modules'), link, 'junction');
    const base = residualsOf(
      (await import(pathToFileURL(join(dir, 'packages/core/scripts/records-data.ts')).href)) as Data,
      (await import(pathToFileURL(join(dir, 'packages/core/scripts/residual-cache.ts')).href)) as Cache,
    );
    console.log(`${values.base} と比べた:`);
    console.log(renderResidualChanges(base.residuals, residuals).join('\n'));
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
  const claimsOf = claimsByObservation(head.loadClaims());
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
