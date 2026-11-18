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
import {
  claimTieErrors,
  gradeAboveCandidate,
  gradeCandidate,
  type ClaimFile,
  type ClaimGrade,
} from '../src/records/claims.ts';
import { closeChecks, markState, prBody, prTitle, promoteTogether, residualCounts } from '../src/records/close.ts';
import { claimDraft, MINIMAL_REASON } from '../src/records/drafts.ts';
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
import { dirtyGenerated, restoreGenerated } from './generated.ts';
import { runObservationsCached } from './residual-cache.ts';
import { cliArgs } from './cli.ts';

const { values, positionals } = cliArgs(import.meta.url, {
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
// 回す前から書き換わっていた生成物（手で回した records:minimal の結果など）は、終わりに戻さない
const dirtyAtStart = dirtyGenerated();
const file = loadRecordingsFile();
const recordings = recordingMap(file);
const predictions = loadPredictions();
const data = loadRecordsData(
  file,
  predictions.flatMap((p) => p.team.map((m) => m.rid)),
);
const observations = loadObservations();
const loaded = loadClaims();
const own = observations.filter((o) => o.source === id);
const loadedOwn = loaded.filter((c) => verification.claims.includes(c.id));
// 等級の候補は、その結論の根拠の観測値をモデルと比べて出す
const basisObs = observations.filter((o) => loadedOwn.some((c) => c.observations.includes(o.id)));
const residuals = runObservationsCached(basisObs, recordings, data);
const residualOf = new Map(
  residuals.map((r) => [
    r.observation.id,
    { status: r.status, diff: r.diff, value: r.observation.value, metric: r.observation.compare?.metric },
  ]),
);
const invalid = new Set(invalidReasonsOf(observations).keys());
const gradeCandidates = new Map<string, ClaimGrade>();
for (const c of loadedOwn) {
  const g = gradeCandidate(c, residualOf, invalid);
  if (g !== undefined) gradeCandidates.set(c.id, g);
}
// 根拠の観測値の感度はその場で計算して重ねる（最小構成の検査。plan/design-minimal-relevance.md 5 節）
const sensitivity = withFreshSensitivity(basisObs, { recordings, ...data, claims: loaded }, loadSensitivity());
const prediction = predictions.find((p) => p.verification === id);
// 同じ記録の仮説の結論を、まとめて確定にできるか（plan/design-workflow-simplification-15.md 2 節）。条件は records:new と同じ
// claimDraft と、結論と観測値の結び付きの決まり（claimTieErrors）で見る。候補は、仮説の理由が最小構成の警告だけのもの（理由が
// 残っていないものを含む。ほかの理由があるものは触らない。when・edge は仮説にだけ書ける欄なので、書いた結論は外す）。--mark が無くても、
// 閉じる前の検査は確定にした後の結論で見る（--mark で通るかが分かるように）。書き換えは --mark で検査が通った後
const compared = new Map(
  residuals.filter((r) => r.status !== 'invalid').map((r) => [r.observation.id, r.status === 'ok']),
);
const predictionComparison = prediction === undefined ? undefined : comparePredictions(prediction, observations);
const today = todayLocal();
// 確定にするときは、等級も候補に合わせる（人の判断で候補より上にしたものは残す）
const confirm = <T extends { grade?: ClaimGrade | undefined }>(c: T, cid: string): T => {
  const g = gradeCandidates.get(cid);
  const grade = g !== undefined && (c.grade === undefined || !gradeAboveCandidate(c.grade, g)) ? g : c.grade;
  return { ...c, state: '確定', ...(grade === undefined ? {} : { grade }), updated: today };
};
const assumeConfirmed = (ids: ReadonlySet<string>) => loaded.map((c) => (ids.has(c.id) ? confirm(c, c.id) : c));
/** assumed を確定とみなしたときの、targets の結論の確定にできない理由 */
const reasonsOf = (assumed: ReadonlySet<string>, targets: readonly string[]) => {
  const assumedClaims = assumeConfirmed(assumed);
  const ctx = { recordings, ...data, claims: assumedClaims };
  const subjects = assumedClaims.filter((c) => targets.includes(c.id));
  const warnings = new Map(relevanceOf(subjects, observations, ctx, sensitivity).map((r) => [r.claim, r.warnings]));
  return new Map(
    subjects.map((c) => {
      const basis = observations.filter((o) => c.observations.includes(o.id));
      const draft = claimDraft({
        id: c.id,
        verification: id,
        topic: c.topic,
        text: c.text,
        today,
        observations: basis,
        gradeCandidate: gradeCandidates.get(c.id),
        compared: new Map([...compared].filter(([o]) => c.observations.includes(o))),
        ...(c.subject === undefined ? {} : { subject: c.subject }),
        minimal: warnings.get(c.id) ?? [],
        prediction: predictionComparison,
        ...(c.decidedOn === undefined ? {} : { decidedOn: c.decidedOn }),
        ...(c.runs === undefined ? {} : { runs: c.runs }),
        ...(c.parameterFree === undefined ? {} : { parameterFree: c.parameterFree }),
      });
      return [c.id, [...draft.reasons, ...claimTieErrors(basis, assumedClaims, invalid)]] as const;
    }),
  );
};
const hypotheses = loadedOwn
  .filter((c) => c.state === '仮説' && c.when === undefined && c.edge === undefined)
  .map((c) => c.id);
const initial = reasonsOf(new Set(), hypotheses);
const together = promoteTogether(
  hypotheses.filter((cid) => {
    const r = initial.get(cid) ?? [];
    return r.every((x) => x.startsWith(MINIMAL_REASON));
  }),
  (assumed) => reasonsOf(assumed, [...assumed]),
);
if (together.promoted.length > 0)
  console.log(
    `${values.mark ? '閉じる前の検査を通れば確定にする' : '--mark で確定にする'}（同じ記録の結論をまとめて確定とみなすと条件がそろう）: ${together.promoted.join('・')}`,
  );
for (const [cid, reasons] of together.reasons) console.log(`仮説のまま: ${cid}（${reasons.join('。')}）`);
const claims = assumeConfirmed(new Set(together.promoted));
const ownClaims = claims.filter((c) => verification.claims.includes(c.id));
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
    : [...predictionComparison!.score.entries()].filter(([, s]) => s.total > 0 && s.ok === s.total).map(([h]) => h);
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
  ...claimTieErrors(
    observations.filter((o) => ownIds.has(o.id)),
    claims,
    invalid,
  ),
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
if (values.mark && together.promoted.length > 0) {
  const paths = together.promoted.map((cid) => `${CLAIMS_DIR}${cid}.json`);
  for (const [i, cid] of together.promoted.entries())
    writeFileSync(
      paths[i]!,
      `${JSON.stringify(confirm(JSON.parse(readFileSync(paths[i]!, 'utf8')) as ClaimFile, cid), null, 2)}\n`,
    );
  if (
    spawnSync(process.execPath, [`${ROOT}tools/format-retry.ts`, ...paths], { cwd: ROOT, stdio: 'ignore' }).status !== 0
  )
    console.error(`結論のファイルを整えられなかった（npx prettier --write で整える）: ${paths.join(' ')}`);
  console.log(`同じ記録の結論をまとめて確定にした: ${together.promoted.join('・')}`);
}
const run = (cmd: string): void => {
  console.log(`$ ${cmd}`);
  const r = spawnSync(cmd, { cwd: ROOT, stdio: 'inherit', shell: true });
  if (r.status !== 0) {
    console.error(`${cmd} が失敗した`);
    if (!values['keep-generated']) restoreGenerated(dirtyAtStart);
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
if (!values['keep-generated'] && !restoreGenerated(dirtyAtStart)) process.exit(1);
console.log(
  '残り: 設計書のある仕事なら、設計か実装が変わったときだけ設計書の経過に 1 行書く（ほかの所には書かない。AGENTS.md「文書の書き方」）。課題の状態が変わったら課題のファイル（records/backlog/。plan/backlog.md は生成物）を直し（Stage の状態が変わったときだけ plan/roadmap.md）、commit して npm run pr:prep -- --push の後に PR を出す（AGENTS.md「コミット手順」）',
);
