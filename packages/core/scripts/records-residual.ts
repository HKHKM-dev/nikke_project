// 観測値の残差を引く（plan/residuals.md には見る行しか載せない。plan/design-workflow-simplification-3.md 2 節）。
// 使い方: npm run records:residual -- <観測値 ID|録画 id|V-NNNN>[,...] [...]（選び方は records-data.ts の pickObservations）
// 引いた観測値のうち比べるものはモデルと比べて residuals.md と同じ列で、比べないものは値を出す。
import { claimsByObservation } from '../src/records/claims.ts';
import { renderOtherRows, renderResidualRows } from '../src/records/observations/render.ts';
import {
  loadClaims,
  loadObservations,
  loadRecordsData,
  loadRecordingsFile,
  pickObservations,
  recordingMap,
  splitIds,
} from './records-data.ts';
import { runObservationsCached } from './residual-cache.ts';

const keys = process.argv.slice(2).flatMap(splitIds);
if (keys.length === 0) {
  console.error('使い方: npm run records:residual -- <観測値 ID|録画 id|V-NNNN>[,...]');
  process.exit(1);
}
const { picked, missing } = pickObservations(loadObservations(), keys);
if (missing.length > 0) console.error(`当たる観測値が無い: ${missing.join('、')}`);
const file = loadRecordingsFile();
const residuals = runObservationsCached(picked, recordingMap(file), loadRecordsData(file));
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
if (missing.length > 0) process.exit(1);
