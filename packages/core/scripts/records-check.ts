// Stage 19-B: 観測値をモデルと比べ、残差の一覧（plan/residuals.md）を作り直す。
// Stage 20-B: 結論の一覧（plan/claims.md）も records/claims/ から作り直す（前の中身は読まない）。
// Stage 20-D: 検証記録の一覧（plan/verifications.md）も records/verifications/ から作り直す（前の中身は読まない）。
// スキル定義の根拠（plan/skills-guide.md 3 節）: 定義の claims を結論と突き合わせ、対応状況の一覧（plan/skills.md）も作り直す。
// 使い方: npm run records:check（ルート。整形まで行う）
import './below-normal.ts';
import { readFileSync, writeFileSync } from 'node:fs';
import {
  claimsByObservation,
  gatedObservations,
  gradeAboveCandidate,
  gradeCandidate,
  renderClaims,
  validateClaims,
  type ClaimGrade,
} from '../src/records/claims.ts';
import { verificationExtraLines } from '../src/records/extras.ts';
import { minimalWarnings } from '../src/records/minimal.ts';
import { comparePredictions, renderPredictionTable, validatePredictions } from '../src/records/predictions.ts';
import { RESULTS_MARKERS } from '../src/records/drafts.ts';
import {
  invalidReasonsOf,
  renderResiduals,
  runObservations,
  validateObservations,
} from '../src/records/observations.ts';
import { replaceGeneratedSection } from '../src/records/recordings.ts';
import { definitionPlacesByClaim, renderSkills, validateSkillClaims } from '../src/records/skills.ts';
import { renderVerifications, validateVerifications, verificationsByClaim } from '../src/records/verifications.ts';
import {
  CLAIMS_PATH,
  RESIDUALS_PATH,
  SKILLS_DOC_PATH,
  VERIFICATIONS_PATH,
  loadClaims,
  knownRids,
  loadObservations,
  loadPredictions,
  loadRecordingsFile,
  loadRecordsData,
  loadSkillDefinitions,
  loadVerifications,
  misplacedClaims,
  misplacedObservations,
  misplacedPredictions,
  recordingMap,
  rereadOnlyClaimsOf,
  verificationPath,
} from './records-data.ts';

const file = loadRecordingsFile();
const recordings = recordingMap(file);
const predictions = loadPredictions();
const data = loadRecordsData(
  file,
  predictions.flatMap((p) => p.team.map((m) => m.rid)),
);
const observations = loadObservations();
const claims = loadClaims();
const verifications = loadVerifications();
const skills = loadSkillDefinitions();
// Stage 20-E: 失効した観測値は照合と結論の根拠から外す
const invalidReasons = invalidReasonsOf(observations);
const errors = [
  ...misplacedObservations(),
  ...validateObservations(observations, recordings, data.enemies),
  ...misplacedClaims(),
  ...validateClaims(claims, new Set(observations.map((o) => o.id)), new Set(invalidReasons.keys())),
  ...validateVerifications(verifications, { claims, recordingIds: new Set(recordings.keys()), observations }),
  ...validateSkillClaims(skills, claims),
  ...misplacedPredictions(),
  ...validatePredictions(predictions, {
    verificationIds: new Set(verifications.map((v) => v.id)),
    knownRids: knownRids(),
    observations,
  }),
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
// 等級の候補（plan/design-records-automation.md 3.5 節）。書いた等級と違えば claims.md に出す。落とさない
const residualOf = new Map(
  residuals.map((r) => [
    r.observation.id,
    { status: r.status, diff: r.diff, value: r.observation.value, metric: r.observation.compare?.metric },
  ]),
);
const gradeCandidates = new Map<string, ClaimGrade>();
for (const c of claims) {
  const g = gradeCandidate(c, residualOf, new Set(invalidReasons.keys()));
  if (g !== undefined) gradeCandidates.set(c.id, g);
}
writeFileSync(
  CLAIMS_PATH,
  renderClaims(
    claims,
    verificationsByClaim(verifications),
    invalidReasons,
    definitionPlacesByClaim(skills),
    gradeCandidates,
    rereadOnlyClaimsOf(claims, observations, predictions, verifications, recordings),
  ),
);
// 予測との突き合わせ（3.5 節）と最小構成の警告（3.5 節）
const warnings = minimalWarnings(verifications, {
  recordings,
  characters: data.characters,
  skills: data.skills,
  enemies: data.enemies,
  claims,
});
for (const p of predictions) {
  const comparison = comparePredictions(p, observations);
  // 検証記録の「結果」に生成ブロックの印があれば、予測との比べの表を書き込む（3.6 節。閉じた記録には印が無い）
  const v = verifications.find((x) => x.id === p.verification);
  if (v !== undefined) {
    const path = verificationPath(v);
    const doc = readFileSync(path, 'utf8');
    if (doc.includes(RESULTS_MARKERS[0]) && doc.includes(RESULTS_MARKERS[1])) {
      writeFileSync(path, replaceGeneratedSection(doc, 'predictions', renderPredictionTable(comparison)));
    }
  }
}
writeFileSync(
  VERIFICATIONS_PATH,
  renderVerifications(verifications, observations, verificationExtraLines(observations, predictions, warnings)),
);
writeFileSync(SKILLS_DOC_PATH, renderSkills(skills, claims));
const gated = gatedObservations(claims, new Set(invalidReasons.keys()));
for (const r of residuals.filter((x) => x.status !== 'ok' && x.status !== 'invalid')) {
  const mark = gated.has(r.observation.id) ? '（確定の結論の根拠。npm test が落ちる）' : '';
  console.log(`${r.observation.id}: ${r.status}${r.message ? ` (${r.message})` : ''}${mark}`);
}
console.log(`${residuals.length} 件を比べた（許容内 ${residuals.filter((r) => r.status === 'ok').length}）`);
const above = claims.filter((c) => {
  const g = gradeCandidates.get(c.id);
  return c.grade !== undefined && c.state !== '棄却' && g !== undefined && gradeAboveCandidate(c.grade, g);
});
console.log(
  `等級の候補（機械）を出せた結論 ${gradeCandidates.size} 件のうち、書いた等級のほうが上のもの: ${above.length} 件（claims.md に出す。plan/design-records-automation.md 3.5 節）`,
);
console.log(
  `最小構成の警告: ${warnings.length} 件（検証記録 ${new Set(warnings.map((w) => w.verification)).size} 件。verifications.md に出す。落とさない）`,
);
for (const p of predictions) {
  const cmp = comparePredictions(p, observations);
  const fits = [...cmp.score.entries()].filter(([, s]) => s.total > 0).map(([h, s]) => `${h} ${s.ok}/${s.total}`);
  console.log(`予測 ${p.verification}: ${p.predicted === null ? 'まだ出していない' : fits.join('・') || '観測値なし'}`);
}
