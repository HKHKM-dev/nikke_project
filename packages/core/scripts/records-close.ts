// 検証記録を閉じる（plan/design-records-automation.md 3.7 節）。
//   npm run records:close -- V-NNNN [--mark] [--no-ci]
// 完了にできるかを検査する（結論がこの記録の観測値を根拠にしている・等級が機械の候補より上でない（上なら gradeReason に理由）・
// 確定の反復実測の結論に decidedOn がある・最小構成の警告・「次に撮るもの」「分かったこと」が空でない）。撮る前の予測と読みの順は
// 見ない（plan/design-investigation-review.md 1 節）。通れば --mark で状態を完了に書き換え、records:check と CI と同じ確認を回し
// （--no-ci で省く）、PR の題名の案を出す。roadmap.md の更新と PR は人（エージェント）が行う。
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { gradeCandidate, type ClaimGrade } from '../src/records/claims.ts';
import { closeChecks, markState, prTitle } from '../src/records/close.ts';
import { relevanceOf } from '../src/records/relevance.ts';
import { withFreshSensitivity } from '../src/records/sensitivity.ts';
import { invalidReasonsOf, runObservations } from '../src/records/observations.ts';
import {
  ROOT,
  loadClaims,
  loadObservations,
  loadPredictions,
  loadRecordingsFile,
  loadRecordsData,
  loadSensitivity,
  loadVerifications,
  recordingMap,
  verificationPath,
} from './records-data.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { mark: { type: 'boolean', default: false }, 'no-ci': { type: 'boolean', default: false } },
});
const id = positionals[0];
if (!id || !/^V-\d{4,}$/.test(id)) {
  console.error('usage: npm run records:close -- V-NNNN [--mark] [--no-ci]');
  process.exit(1);
}
const verifications = loadVerifications();
const verification = verifications.find((v) => v.id === id);
if (verification === undefined) {
  console.error(`検証記録 ${id} が無い`);
  process.exit(1);
}
const file = loadRecordingsFile();
const recordings = recordingMap(file);
const predictions = loadPredictions();
const data = loadRecordsData(
  file,
  predictions.flatMap((p) => p.team.map((m) => m.rid)),
);
const observations = loadObservations();
const claims = loadClaims();
const own = observations.filter((o) => o.source === id);
const ownClaims = claims.filter((c) => verification.claims.includes(c.id));
// 等級の候補は、その結論の根拠の観測値をモデルと比べて出す
const basisObs = observations.filter((o) => ownClaims.some((c) => c.observations.includes(o.id)));
const residuals = runObservations(basisObs, recordings, data);
const residualOf = new Map(
  residuals.map((r) => [
    r.observation.id,
    { status: r.status, diff: r.diff, value: r.observation.value, metric: r.observation.compare?.metric },
  ]),
);
const invalid = new Set(invalidReasonsOf(observations).keys());
const gradeCandidates = new Map<string, ClaimGrade>();
for (const c of ownClaims) {
  const g = gradeCandidate(c, residualOf, invalid);
  if (g !== undefined) gradeCandidates.set(c.id, g);
}
// 最小構成の検査（plan/design-minimal-relevance.md 5 節）: この記録の結論の組。根拠の観測値の感度はその場で計算して重ねる
const relevanceCtx = {
  recordings,
  characters: data.characters,
  skills: data.skills,
  enemies: data.enemies,
  claims,
  data,
};
const sensitivity = withFreshSensitivity(basisObs, relevanceCtx, loadSensitivity());
const minimal = new Map(
  relevanceOf(ownClaims, observations, relevanceCtx, sensitivity).map((r) => [r.claim, r.warnings]),
);
const result = closeChecks({
  verification,
  claims,
  observations: own,
  gradeCandidates,
  minimal,
});
for (const w of result.warnings) console.log(`注意: ${w}`);
if (result.errors.length > 0) {
  for (const e of result.errors) console.error(`誤り: ${e}`);
  process.exit(1);
}
console.log(`${id}: 閉じる前の検査を通った（結論 ${verification.claims.join('・')}）`);
if (values.mark && verification.state !== '完了') {
  const path = verificationPath(verification);
  writeFileSync(path, markState(readFileSync(path, 'utf8'), '完了'));
  console.log(`${path} の状態を 完了 にした`);
}
const run = (cmd: string): void => {
  console.log(`$ ${cmd}`);
  const r = spawnSync(cmd, { cwd: ROOT, stdio: 'inherit', shell: true });
  if (r.status !== 0) {
    console.error(`${cmd} が失敗した`);
    process.exit(1);
  }
};
run('npm run records:check');
if (!values['no-ci']) {
  for (const cmd of ['npm run format:check', 'npm run lint', 'npm run typecheck', 'npm test', 'npm run build'])
    run(cmd);
}
console.log(`PR の題名の案: ${prTitle(verification)}`);
console.log('残り: plan/roadmap.md を更新し、AGENTS.md「コミット手順」で PR を出す');
