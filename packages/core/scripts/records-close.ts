// 検証記録を閉じる（plan/design-records-automation.md 3.7 節）。
//   npm run records:close -- V-NNNN [--mark] [--no-ci]
// 完了にできるかを検査する（結論がこの記録の観測値を根拠にしている・等級が機械の候補より上でない（上なら gradeReason に理由）・
// 予測を撮る前に出している・「次に撮るもの」「分かったこと」が空でない）。予測ファイルに控え（seen）があれば、git の履歴で予測の
// commit が観測値を足した commit より前かも見る（plan/design-reread-prediction.md 5 節。ブランチの上で、マージの前に回す。
// スカッシュマージで予測と同じ commit になったものは注意にとどめる）。通れば --mark で状態を完了に書き換え、records:check と CI と同じ確認を回し
// （--no-ci で省く）、PR の題名の案を出す。roadmap.md の更新と PR は人（エージェント）が行う。
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { relative } from 'node:path';
import { parseArgs } from 'node:util';
import { gradeCandidate, type ClaimGrade } from '../src/records/claims.ts';
import {
  closeChecks,
  isHandPrediction,
  markState,
  predictionSectionOf,
  prTitle,
  type GitOrder,
} from '../src/records/close.ts';
import { relevanceOf } from '../src/records/relevance.ts';
import { withFreshSensitivity } from '../src/records/sensitivity.ts';
import { invalidReasonsOf, runObservations, type Observation } from '../src/records/observations.ts';
import type { PredictionFile } from '../src/records/predictions.ts';
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
const git = (args: string[]): string => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();

/** main にマージ済みの commit か（origin/main が無ければ main で見る）。スカッシュマージした予測と読みは同じ commit になる */
function isMergedCommit(c: string): boolean {
  const mainRef = ['origin/main', 'main'].find((r) => {
    try {
      git(['rev-parse', '--verify', '--quiet', r]);
      return true;
    } catch {
      return false;
    }
  });
  if (mainRef === undefined) return false;
  try {
    git(['merge-base', '--is-ancestor', c, mainRef]);
    return true;
  } catch {
    return false;
  }
}

/**
 * 予測（予測ファイルの predicted か、検証記録の「予測」の節）と読みの順。history は新しい順の [commit, その commit の予測の中身]、
 * atHead は HEAD の中身、current は手元の中身。予測の commit は、中身がいまと同じ続く最も古い commit（anyEarlier なら、続いて
 * いなくても中身がいまと同じ最も古い commit。手計算の予測で、途中で書き足して戻した節。plan/design-pellet-hit.md 7 節）
 */
function orderOf(
  history: readonly (readonly [string, string | undefined])[],
  atHead: string | undefined,
  current: string,
  own: readonly Observation[],
  anyEarlier = false,
): GitOrder {
  const uncommitted = atHead !== current;
  let predictionCommit: string | null = null;
  if (!uncommitted) {
    for (const [c, content] of history) {
      if (content === current) predictionCommit = c;
      else if (!anyEarlier) break;
    }
  }
  const notAfter: string[] = [];
  const merged: string[] = [];
  if (predictionCommit !== null) {
    for (const o of own) {
      const file = `records/observations/${o.recording}.json`;
      const added = git(['log', '--format=%H', '--reverse', '-S', `"id": "${o.id}"`, '--', file]).split('\n')[0];
      if (!added) continue; // まだ commit していない読みは予測の後
      if (added === predictionCommit && isMergedCommit(added)) {
        merged.push(o.id);
        continue;
      }
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
  return { uncommitted, predictionCommit, notAfter, merged };
}

/**
 * ファイルの履歴（新しい順の [commit, その commit でのパス]）。番号の振り直しでファイルを改名していれば、改名した commit の
 * 祖先に限って古い名前の履歴を続ける。--follow は、振り直した後に main を取り込むと、古い名前を使う main の別のファイルまで
 * たどってしまうので使わない（V-0378）
 */
function renamedHistory(path: string): (readonly [string, string])[] {
  const out: (readonly [string, string])[] = [];
  let at = 'HEAD';
  let file = path;
  for (let guard = 0; guard < 20; guard++) {
    const commits = git(['log', '--format=%H', at, '--', file])
      .split('\n')
      .filter((c) => c !== '');
    for (const c of commits) out.push([c, file] as const);
    const oldest = commits.at(-1);
    if (oldest === undefined) break;
    // その名前が現れた commit が改名なら、古い名前を親から続ける
    const renamed = git(['show', '-M', '--name-status', '--format=', oldest])
      .split('\n')
      .map((l) => l.split('\t'))
      .find((cols) => /^R\d*$/.test(cols[0] ?? '') && cols[2] === file);
    if (renamed === undefined) break;
    at = `${oldest}^`;
    file = renamed[1]!;
  }
  return out;
}

/** 予測ファイルと読みの順を git の履歴で調べる（調べられなければ undefined） */
function gitOrderOf(prediction: PredictionFile, own: readonly Observation[]): GitOrder | undefined {
  const path = `records/predictions/${prediction.verification}.json`;
  try {
    // 控え（seen）は予測の値ではなく、後から足せる記録なので、予測の commit を探すときは除いて比べる
    // （2026-10-04 より前の予測ファイルに後から控えを足した V-0124。plan/design-reread-prediction.md 7.2 節）
    const withoutSeen = (predicted: PredictionFile['predicted']): string => {
      if (predicted === undefined || predicted === null) return JSON.stringify(null);
      const { seen: _seen, ...rest } = predicted;
      return JSON.stringify(rest);
    };
    const predictedAt = (rev: string, file = path): string | undefined => {
      try {
        return withoutSeen((JSON.parse(git(['show', `${rev}:${file}`])) as PredictionFile).predicted);
      } catch {
        return undefined;
      }
    };
    // 手書きの部分（targets の observations など）を後で直した commit は、predicted が同じなので飛ばす。
    // 番号の振り直し（予測ファイルの改名）は renamedHistory でたどる
    const history = renamedHistory(path).map(([c, file]) => [c, predictedAt(c, file)] as const);
    return orderOf(history, predictedAt('HEAD'), withoutSeen(prediction.predicted), own);
  } catch (e) {
    console.log(`注意: git の履歴で予測と読みの順を調べられなかった（${(e as Error).message.split('\n')[0]}）`);
    return undefined;
  }
}

/**
 * 手計算の予測（予測ファイルが無く、「予測」の節に手計算の予測を書いた記録。plan/design-pellet-hit.md 7 節）と読みの順。
 * 記録の改名（番号の振り直し）をたどって、「予測」の節がいまと同じ中身の最も古い commit を予測の commit とみる
 */
function handOrderOf(path: string, own: readonly Observation[]): GitOrder | undefined {
  const rel = relative(ROOT, path).replaceAll('\\', '/');
  try {
    const sectionAt = (rev: string, file: string): string | undefined => {
      try {
        return predictionSectionOf(git(['show', `${rev}:${file}`]));
      } catch {
        return undefined;
      }
    };
    const history = renamedHistory(rel).map(([c, file]) => [c, sectionAt(c, file)] as const);
    const current = predictionSectionOf(readFileSync(path, 'utf8'));
    if (current === undefined) throw new Error('「予測」の節が無い');
    return orderOf(history, sectionAt('HEAD', rel), current, own, true);
  } catch (e) {
    console.log(`注意: git の履歴で手計算の予測と読みの順を調べられなかった（${(e as Error).message.split('\n')[0]}）`);
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
  minimal,
  ...(prediction?.predicted?.seen === undefined ? {} : { gitOrder: gitOrderOf(prediction, own) }),
  ...(prediction === undefined && isHandPrediction(verification)
    ? { handOrder: handOrderOf(verificationPath(verification), own) }
    : {}),
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
