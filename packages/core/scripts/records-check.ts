// Stage 19-B: 観測値をモデルと比べ、残差の一覧（plan/residuals.md）を作り直す。
// 使い方: npm run records:check（ルート。整形まで行う）
import { readFileSync, writeFileSync } from 'node:fs';
import { claimsByObservation, gatedObservations, validateClaims } from '../src/records/claims.ts';
import { renderResiduals, runObservations, validateObservations } from '../src/records/observations.ts';
import { replaceGeneratedSection } from '../src/records/recordings.ts';
import {
  RESIDUALS_PATH,
  loadClaims,
  loadObservations,
  loadRecordingsFile,
  loadRecordsData,
  misplacedObservations,
  recordingMap,
} from './records-data.ts';

const file = loadRecordingsFile();
const recordings = recordingMap(file);
const data = loadRecordsData(file);
const observations = loadObservations();
const claims = loadClaims();
const errors = [
  ...misplacedObservations(),
  ...validateObservations(observations, recordings, data.enemies),
  ...validateClaims(claims, new Set(observations.map((o) => o.id))),
];
if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}
const residuals = runObservations(observations, recordings, data);
const doc = readFileSync(RESIDUALS_PATH, 'utf8');
writeFileSync(
  RESIDUALS_PATH,
  replaceGeneratedSection(doc, 'residuals', renderResiduals(residuals, observations, claimsByObservation(claims))),
);
const gated = gatedObservations(claims);
for (const r of residuals.filter((x) => x.status !== 'ok')) {
  const mark = gated.has(r.observation.id) ? '（確定の結論の根拠。npm test が落ちる）' : '';
  console.log(`${r.observation.id}: ${r.status}${r.message ? ` (${r.message})` : ''}${mark}`);
}
console.log(`${residuals.length} 件を比べた（許容内 ${residuals.filter((r) => r.status === 'ok').length}）`);
