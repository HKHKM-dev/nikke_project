// Stage 19-B: 観測値をモデルと比べ、残差の一覧（plan/residuals.md）を作り直す。
// Stage 20-B: 結論の一覧（plan/claims.md）も records/claims/ から作り直す（前の中身は読まない）。
// Stage 20-D: 検証記録の一覧（plan/verifications.md）も records/verifications/ から作り直す（前の中身は読まない）。
// スキル定義の根拠（plan/skills-guide.md 3 節）: 定義の claims を結論と突き合わせ、対応状況の一覧（plan/skills.md）と、画面が読む
// 対応状況の索引（packages/core/data/skills/support.json。skills/support.ts）も作り直す。
// 残っている仕事の一覧（plan/backlog.md）も、課題のファイル（records/backlog/）と雛形から作り直す（plan/design-backlog-files.md）。
// 使い方: npm run records:check（ルート。整形まで行う）
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseBacklogTemplate, renderBacklog, validateBacklog } from '../src/records/backlog.ts';
import {
  claimsByObservation,
  gatedObservations,
  gradeAboveCandidate,
  gradeCandidate,
  renderClaims,
  validateClaims,
  type ClaimGrade,
} from '../src/records/claims.ts';
import { openStaleness, openVerificationIds, verificationExtraLines } from '../src/records/extras.ts';
import { danglingMarks } from '../src/records/marks.ts';
import { relevanceCounts, relevanceOf, renderMinimal } from '../src/records/relevance.ts';
import {
  comparePredictions,
  predictionRids,
  renderPredictionTable,
  validatePredictions,
} from '../src/records/predictions.ts';
import { RESULTS_MARKERS } from '../src/records/drafts.ts';
import { invalidReasonsOf, renderResiduals, validateObservations } from '../src/records/observations.ts';
import { replaceGeneratedSection } from '../src/records/recordings.ts';
import { definitionPlacesByClaim, renderSkills, validateSkillClaims } from '../src/records/skills.ts';
import { renderSkillSupportIndex } from '../src/skills/support.ts';
import {
  renderVerifications,
  unlistedConfirmedClaims,
  validateVerifications,
  verificationsByClaim,
} from '../src/records/verifications.ts';
import {
  BACKLOG_PATH,
  BACKLOG_TEMPLATE_PATH,
  CLAIMS_PATH,
  ROOT,
  MINIMAL_PATH,
  RESIDUALS_PATH,
  SKILLS_DOC_PATH,
  SKILL_SUPPORT_PATH,
  VERIFICATIONS_PATH,
  loadBacklog,
  loadClaims,
  loadSensitivity,
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
  skillSupportIndexOfData,
  verificationPath,
} from './records-data.ts';
import { renumberMarksFromGit } from './records-marks.ts';
import { runObservationsCached } from './residual-cache.ts';

const file = loadRecordingsFile();
const recordings = recordingMap(file);
const predictions = loadPredictions();
const data = loadRecordsData(
  file,
  predictions.flatMap((p) => predictionRids(p)),
);
// 印の notes の添字を、このブランチでの定義の変更に合わせて付け替える（plan/design-workflow-simplification-5.md 1 節の (a)）
const renumbered = renumberMarksFromGit();
for (const line of renumbered.changes) console.log(`印を付け替えた: ${line}`);
const observations = loadObservations();
const claims = loadClaims();
const verifications = loadVerifications();
const skills = loadSkillDefinitions();
// 最小構成の検査の文脈（行き先の無い印の検査と、警告の判定）
const relevanceCtx = { recordings, ...data, claims };
const backlog = loadBacklog();
const backlogTemplate = readFileSync(BACKLOG_TEMPLATE_PATH, 'utf8');
// Stage 20-E: 失効した観測値は照合と結論の根拠から外す
const invalidReasons = invalidReasonsOf(observations);
const errors = [
  ...misplacedObservations(),
  ...validateObservations(observations, recordings, data.enemies),
  ...misplacedClaims(),
  ...validateClaims(claims, new Set(observations.map((o) => o.id)), new Set(invalidReasons.keys())),
  ...validateVerifications(verifications, { claims, recordingIds: new Set(recordings.keys()), observations }),
  ...unlistedConfirmedClaims(claims, verifications, observations),
  ...validateSkillClaims(skills, claims),
  ...renumbered.problems,
  // 行き先の無い印（同 (b)）
  ...danglingMarks(claims, observations, relevanceCtx).map(
    ({ claim, element }) =>
      `${claim}: 印の要素 ${element} が根拠の観測値の録画の編成に無い（定義が変わった？ 印を今の要素に直すか外す）`,
  ),
  ...misplacedPredictions(),
  ...validatePredictions(predictions, {
    verificationIds: new Set(verifications.map((v) => v.id)),
    knownRids: knownRids(),
    observations,
    recordingIds: new Set(recordings.keys()),
  }),
  ...validateBacklog(parseBacklogTemplate(backlogTemplate), backlog, {
    ids: new Set([
      ...claims.map((c) => c.id),
      ...verifications.map((v) => v.id),
      ...recordings.keys(),
      ...observations.map((o) => o.id),
    ]),
    exists: (path) => existsSync(`${ROOT}plan/${path}`),
  }),
];
if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}
const residuals = runObservationsCached(observations, recordings, data);
const doc = readFileSync(RESIDUALS_PATH, 'utf8');
writeFileSync(
  RESIDUALS_PATH,
  replaceGeneratedSection(
    doc,
    'residuals',
    renderResiduals(
      residuals,
      observations,
      claimsByObservation(claims),
      new Map(verifications.map((v) => [v.id, v.topic])),
    ),
  ),
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
// 最小構成の検査（plan/design-minimal-relevance.md。確定の結論 × 根拠の観測値の組に、効きうる未確定の要素）
const relevance = relevanceOf(claims, observations, relevanceCtx, loadSensitivity());
writeFileSync(MINIMAL_PATH, renderMinimal(relevance, claims));
writeFileSync(
  CLAIMS_PATH,
  renderClaims(
    claims,
    verificationsByClaim(verifications),
    invalidReasons,
    definitionPlacesByClaim(skills),
    gradeCandidates,
    relevanceCounts(relevance),
  ),
);
// 予測の後のモデルの変更（plan/design-prediction-staleness.md）: 開いている検証の予測だけ、いまのモデルで出し直して保存した値と比べる
const staleness = openStaleness(predictions, openVerificationIds(verifications), data);
// 予測との突き合わせ（3.5 節）。検証記録 × 録画の最小構成の警告は、plan/minimal.md の組の判定に置き換えた（design-minimal-relevance.md 5 節）
for (const p of predictions) {
  const comparison = comparePredictions(p, observations, staleness.get(p.verification));
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
  renderVerifications(verifications, observations, verificationExtraLines(observations, predictions, staleness)),
);
writeFileSync(SKILLS_DOC_PATH, renderSkills(skills, claims));
writeFileSync(BACKLOG_PATH, renderBacklog(backlogTemplate, backlog));
writeFileSync(SKILL_SUPPORT_PATH, renderSkillSupportIndex(skillSupportIndexOfData()));
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
  `等級の候補（機械）を出せた結論 ${gradeCandidates.size} 件のうち、書いた等級のほうが上のもの: ${above.length} 件（うち理由（gradeReason）の無いもの ${above.filter((c) => c.gradeReason === undefined).length} 件。claims.md に出す。plan/design-records-automation.md 3.5 節）`,
);
for (const p of predictions) {
  const cmp = comparePredictions(p, observations);
  const fits = [...cmp.score.entries()].filter(([, s]) => s.total > 0).map(([h, s]) => `${h} ${s.ok}/${s.total}`);
  const s = staleness.get(p.verification);
  const note =
    s === undefined
      ? ''
      : s.kind === 'error'
        ? '（モデルが変わった。いまのモデルでは出し直せない）'
        : `（モデルが変わった。出し直すと仮説 × 指標 ${s.targets.length} つの値が変わる）`;
  console.log(
    `予測 ${p.verification}: ${p.predicted === null ? 'まだ出していない' : fits.join('・') || '観測値なし'}${note}`,
  );
}
{
  const counts = [...relevanceCounts(relevance).values()];
  const warned = counts.filter((c) => c.warned > 0).length;
  console.log(
    `最小構成: 確定の結論 ${counts.length}・組 ${counts.reduce((n, c) => n + c.pairs, 0)}。警告のある組 ${counts.reduce((n, c) => n + c.warned, 0)}（結論 ${warned}）`,
  );
}
