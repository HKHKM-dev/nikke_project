// Stage 19-B: 観測値をモデルと比べ、残差の一覧（plan/residuals.md）を作り直す。
// Stage 20-B: 結論の一覧（plan/claims.md）も records/claims/ から作り直す（前の中身は読まない）。
// Stage 20-D: 検証記録の一覧（plan/verifications.md）も records/verifications/ から作り直す（前の中身は読まない）。
// 使い方: npm run records:check（ルート。整形まで行う）
import { readFileSync, writeFileSync } from 'node:fs';
import { claimsByObservation, gatedObservations, renderClaims, validateClaims } from '../src/records/claims.ts';
import { renderResiduals, runObservations, validateObservations } from '../src/records/observations.ts';
import { replaceGeneratedSection } from '../src/records/recordings.ts';
import { renderVerifications, validateVerifications, verificationsByClaim } from '../src/records/verifications.ts';
import {
  CLAIMS_PATH,
  RESIDUALS_PATH,
  VERIFICATIONS_PATH,
  loadClaims,
  loadObservations,
  loadRecordingsFile,
  loadRecordsData,
  loadVerifications,
  misplacedClaims,
  misplacedObservations,
  recordingMap,
} from './records-data.ts';

const file = loadRecordingsFile();
const recordings = recordingMap(file);
const data = loadRecordsData(file);
const observations = loadObservations();
const claims = loadClaims();
const verifications = loadVerifications();
const errors = [
  ...misplacedObservations(),
  ...validateObservations(observations, recordings, data.enemies),
  ...misplacedClaims(),
  ...validateClaims(claims, new Set(observations.map((o) => o.id))),
  ...validateVerifications(verifications, { claims, recordingIds: new Set(recordings.keys()), observations }),
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
writeFileSync(CLAIMS_PATH, renderClaims(claims, verificationsByClaim(verifications)));
writeFileSync(VERIFICATIONS_PATH, renderVerifications(verifications, observations));
const gated = gatedObservations(claims);
for (const r of residuals.filter((x) => x.status !== 'ok')) {
  const mark = gated.has(r.observation.id) ? '（確定の結論の根拠。npm test が落ちる）' : '';
  console.log(`${r.observation.id}: ${r.status}${r.message ? ` (${r.message})` : ''}${mark}`);
}
console.log(`${residuals.length} 件を比べた（許容内 ${residuals.filter((r) => r.status === 'ok').length}）`);
