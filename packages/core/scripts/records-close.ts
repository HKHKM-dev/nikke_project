// 検証記録を閉じる（plan/design-records-automation.md 3.7 節）。
//   npm run records:close -- V-NNNN [--mark] [--ci] [--keep-generated]
// 完了にできるかを検査する（結論がこの記録の観測値を根拠にしている・等級が機械の候補より上でない（上なら gradeReason に理由）・
// 確定の反復実測の結論に decidedOn がある・最小構成の警告・指標なし・許容外・合う仮説が 2 つ以上は人の判断（judgment）で上書き・
// 確定の結論の根拠の観測値のうち compare の無いものに scope がある・「次に撮るもの」「分かったこと」が空でない）。撮る前の予測と読みの順は
// 見ない（plan/design-investigation-review.md 1 節）。通れば --mark で状態を完了に書き換え、records:minimal（感度を計算し直し、records:check も回る）と
// PR の題名の案と本文の骨組み（plan/design-workflow-simplification-5.md 2 節）を出し、作り直した生成物を HEAD の版へ戻す（--keep-generated で残す）。CI と同じ確認（npm run ci）は --ci のときだけ回す（ふつうは PR の前の npm run pr:prep が回す。
// plan/design-workflow-simplification-4.md 2 節。--no-ci は前の既定の名残で、何もしない）。課題のファイル（records/backlog/）の更新と PR は人（エージェント）が行う。
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { claimTieErrors, gradeCandidate, type ClaimFile, type ClaimGrade } from '../src/records/claims.ts';
import { closeChecks, markState, prBody, prTitle, promoteTogether, residualCounts } from '../src/records/close.ts';
import { claimDraft } from '../src/records/drafts.ts';
import { V_ID } from '../src/records/ids.ts';
import { relevanceOf } from '../src/records/relevance.ts';
import { withFreshSensitivity } from '../src/records/sensitivity.ts';
import { invalidReasonsOf } from '../src/records/observations/types.ts';
import { comparePredictions, todayLocal } from '../src/records/predictions.ts';
import {
  RESIDUALS_PATH,
  CLAIMS_DIR,
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
import { runObservationsCached } from './residual-cache.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    mark: { type: 'boolean', default: false },
    ci: { type: 'boolean', default: false },
    'no-ci': { type: 'boolean', default: false },
    'keep-generated': { type: 'boolean', default: false },
  },
});
const id = positionals[0];
if (!id || !V_ID.test(id)) {
  console.error('usage: npm run records:close -- V-NNNN [--mark] [--ci] [--keep-generated]');
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
let claims = loadClaims();
const own = observations.filter((o) => o.source === id);
let ownClaims = claims.filter((c) => verification.claims.includes(c.id));
// 等級の候補は、その結論の根拠の観測値をモデルと比べて出す
const basisObs = observations.filter((o) => ownClaims.some((c) => c.observations.includes(o.id)));
const residuals = runObservationsCached(basisObs, recordings, data);
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
// 根拠の観測値の感度はその場で計算して重ねる（最小構成の検査。plan/design-minimal-relevance.md 5 節）
const sensitivity = withFreshSensitivity(basisObs, { recordings, ...data, claims }, loadSensitivity());
const prediction = predictions.find((p) => p.verification === id);
// 同じ記録の仮説の結論を、まとめて確定にできるか（plan/design-workflow-simplification-15.md 2 節）。条件は records:new と同じ
// claimDraft で見る。when・edge は仮説にだけ書ける欄なので、書いた結論は人が仮説に置いたものとして外す
const compared = new Map(
  residuals.filter((r) => r.status !== 'invalid').map((r) => [r.observation.id, r.status === 'ok']),
);
const predictionComparison = prediction === undefined ? undefined : comparePredictions(prediction, observations);
const today = todayLocal();
const together = promoteTogether(
  ownClaims.filter((c) => c.state === '仮説' && c.when === undefined && c.edge === undefined).map((c) => c.id),
  (assumed) => {
    const assumedClaims = claims.map((c) => (assumed.has(c.id) ? { ...c, state: '確定' as const } : c));
    const targets = assumedClaims.filter((c) => assumed.has(c.id));
    const ctx = { recordings, ...data, claims: assumedClaims };
    const warnings = new Map(relevanceOf(targets, observations, ctx, sensitivity).map((r) => [r.claim, r.warnings]));
    return new Map(
      targets.map((c) => [
        c.id,
        claimDraft({
          id: c.id,
          verification: id,
          topic: c.topic,
          text: c.text,
          today,
          observations: observations.filter((o) => c.observations.includes(o.id)),
          gradeCandidate: gradeCandidates.get(c.id),
          compared: new Map([...compared].filter(([o]) => c.observations.includes(o))),
          ...(c.subject === undefined ? {} : { subject: c.subject }),
          minimal: warnings.get(c.id) ?? [],
          prediction: predictionComparison,
          ...(c.decidedOn === undefined ? {} : { decidedOn: c.decidedOn }),
          ...(c.runs === undefined ? {} : { runs: c.runs }),
          ...(c.parameterFree === undefined ? {} : { parameterFree: c.parameterFree }),
        }).reasons,
      ]),
    );
  },
);
if (together.promoted.length > 0 && values.mark) {
  for (const cid of together.promoted) {
    const path = `${CLAIMS_DIR}${cid}.json`;
    const claimFile = JSON.parse(readFileSync(path, 'utf8')) as ClaimFile;
    writeFileSync(path, `${JSON.stringify({ ...claimFile, state: '確定', updated: today }, null, 2)}\n`);
  }
  spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['prettier', '--write', ...together.promoted.map((cid) => `${CLAIMS_DIR}${cid}.json`)],
    { stdio: 'ignore' },
  );
  console.log(`同じ記録の結論をまとめて確定にした: ${together.promoted.join('・')}`);
  claims = loadClaims();
  ownClaims = claims.filter((c) => verification.claims.includes(c.id));
} else if (together.promoted.length > 0)
  console.log(
    `--mark で確定にする（同じ記録の結論をまとめて確定とみなすと条件がそろう）: ${together.promoted.join('・')}`,
  );
for (const [cid, reasons] of together.reasons) console.log(`仮説のまま: ${cid}（${reasons.join('。')}）`);
// 最小構成の検査（同 5 節）: この記録の結論の組
const relevanceCtx = { recordings, ...data, claims };
const minimal = new Map(
  relevanceOf(ownClaims, observations, relevanceCtx, sensitivity).map((r) => [r.claim, r.warnings]),
);
// 許容外の観測値と、予測と合った仮説（人の判断の上書きの検査。plan/design-investigation-review.md 3 節）
const outside = new Set(residuals.filter((r) => r.status === 'outside').map((r) => r.observation.id));
const predictionFits =
  prediction === undefined || prediction.predicted === null || prediction.hypotheses.length < 2
    ? undefined
    : [...comparePredictions(prediction, observations).score.entries()]
        .filter(([, s]) => s.total > 0 && s.ok === s.total)
        .map(([h]) => h);
const result = closeChecks({
  verification,
  claims,
  observations: own,
  gradeCandidates,
  minimal,
  outside,
  ...(predictionFits === undefined ? {} : { predictionFits }),
});
// 結論と観測値の結び付きの決まり（records:check と同じ。この記録の結論の根拠と、この記録の観測値だけを見る）
const ownIds = new Set([...own, ...basisObs].map((o) => o.id));
result.errors.push(
  ...claimTieErrors(observations, claims, invalid).filter((e) => ownIds.has(e.slice(0, e.indexOf(':')))),
);
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
run('npm run records:minimal');
if (values.ci) run('npm run ci');
console.log(`PR の題名の案: ${prTitle(verification)}`);
// 本文の骨組み（plan/design-workflow-simplification-5.md 2 節）。残差の件数は records:minimal が作り直した一覧と origin/main の一覧から読む
const before = spawnSync('git', ['show', `origin/main:${RESIDUALS_PATH.slice(ROOT.length)}`], {
  cwd: ROOT,
  encoding: 'utf8',
});
const afterClaims = loadClaims();
console.log(
  `PR の本文の骨組み:\n\n${prBody(
    verification,
    afterClaims,
    residualCounts(readFileSync(RESIDUALS_PATH, 'utf8')),
    before.status === 0 ? residualCounts(before.stdout) : undefined,
  )}\n`,
);
// 作り直した生成物は PR に入れないので、読み終えたら HEAD の版へ戻す（plan/design-workflow-simplification-15.md 4 節）
if (!values['keep-generated']) run('node packages/core/scripts/records-restore-generated.ts');
console.log(
  '残り: 設計書のある仕事なら、設計か実装が変わったときだけ設計書の経過に 1 行書く（ほかの所には書かない。AGENTS.md「文書の書き方」）。課題の状態が変わったら課題のファイル（records/backlog/。plan/backlog.md は生成物）を直し（Stage の状態が変わったときだけ plan/roadmap.md）、commit して npm run pr:prep -- --push の後に PR を出す（AGENTS.md「コミット手順」）',
);
