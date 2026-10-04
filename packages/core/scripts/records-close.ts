// 検証記録を閉じる（plan/design-records-automation.md 3.7 節）。
//   npm run records:close -- V-NNNN [--mark] [--no-ci]
// 完了にできるかを検査する（結論がこの記録の観測値を根拠にしている・等級が機械の候補より上でない・予測を撮る前に出している・
// 「次に撮るもの」「分かったこと」が空でない）。予測ファイルに控え（seen）があれば、git の履歴で予測の commit が観測値を足した commit
// より前かも見る（plan/design-reread-prediction.md 5 節。ブランチの上で、マージの前に回す）。通れば --mark で状態を完了に書き換え、records:check と CI と同じ確認を回し
// （--no-ci で省く）、PR の題名の案を出す。roadmap.md の更新と PR は人（エージェント）が行う。
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { gradeCandidate, type ClaimGrade } from '../src/records/claims.ts';
import { closeChecks, markState, prTitle, type GitOrder } from '../src/records/close.ts';
import { minimalWarnings } from '../src/records/minimal.ts';
import { invalidReasonsOf, runObservations, type Observation } from '../src/records/observations.ts';
import type { PredictionFile } from '../src/records/predictions.ts';
import {
  ROOT,
  loadClaims,
  loadObservations,
  loadPredictions,
  loadRecordingsFile,
  loadRecordsData,
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
const warnings = minimalWarnings([verification], {
  recordings,
  characters: data.characters,
  skills: data.skills,
  enemies: data.enemies,
  claims,
});
const git = (args: string[]): string => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();

/** 予測と読みの順を git の履歴で調べる（調べられなければ undefined） */
function gitOrderOf(prediction: PredictionFile, own: readonly Observation[]): GitOrder | undefined {
  const path = `records/predictions/${prediction.verification}.json`;
  try {
    let committed: PredictionFile | undefined;
    try {
      committed = JSON.parse(git(['show', `HEAD:${path}`])) as PredictionFile;
    } catch {
      committed = undefined;
    }
    const uncommitted = JSON.stringify(committed?.predicted ?? null) !== JSON.stringify(prediction.predicted);
    // いまの predicted を入れた commit: 日付か commit の行が最後に変わった commit
    const predictionCommit = git(['log', '-1', '--format=%H', '-G', '"(at|commit)": "', '--', path]) || null;
    const notAfter: string[] = [];
    if (predictionCommit !== null) {
      for (const o of own) {
        const file = `records/observations/${o.recording}.json`;
        const added = git(['log', '--format=%H', '--reverse', '-S', `"id": "${o.id}"`, '--', file]).split('\n')[0];
        if (!added) continue; // まだ commit していない読みは予測の後
        let after = added !== predictionCommit;
        if (after) {
          try {
            git(['merge-base', '--is-ancestor', predictionCommit, added]);
          } catch {
            after = false;
          }
        }
        if (!after) notAfter.push(o.id);
      }
    }
    return { uncommitted, predictionCommit, notAfter };
  } catch (e) {
    console.log(`注意: git の履歴で予測と読みの順を調べられなかった（${(e as Error).message.split('\n')[0]}）`);
    return undefined;
  }
}

const prediction = predictions.find((p) => p.verification === id);
const result = closeChecks({
  verification,
  claims,
  observations: own,
  recordings,
  prediction,
  gradeCandidates,
  warnings,
  ...(prediction?.predicted?.seen === undefined ? {} : { gitOrder: gitOrderOf(prediction, own) }),
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
