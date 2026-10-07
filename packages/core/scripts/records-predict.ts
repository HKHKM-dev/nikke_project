// 予測の固定（plan/design-records-automation.md 3.2 節）: records/predictions/V-NNNN.json の手書きの部分（編成・仮説・比べる指標）
// から sim（calc）を回し、predicted（仮説 × 指標の値、日付、commit）を書き込む。手書きの部分は触らない。
// 使い方: npm run records:predict -- V-NNNN [--date YYYY-MM-DD]
// 撮る前にこのファイルを commit しておく（「予測は撮る前に書く」を履歴で示す）。
// 既存の録画の読み直しでは、検証記録の「録画」に録画を挙げてから回す。そのとき既にある観測値の ID を predicted.seen に控える
// （plan/design-reread-prediction.md 5 節。控えに入った観測値は、この予測の根拠にも照合にも数えない）。
import './below-normal.ts';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { runPredictions, seenAtPrediction, todayLocal, type PredictionFile } from '../src/records/predictions.ts';
import {
  PREDICTIONS_DIR,
  ROOT,
  loadObservations,
  loadRecordingsFile,
  loadRecordsData,
  loadVerifications,
} from './records-data.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { date: { type: 'string' } },
});
const id = positionals[0];
if (!id || !/^V-\d{4,}$/.test(id)) {
  console.error('usage: npm run records:predict -- V-NNNN [--date YYYY-MM-DD]');
  process.exit(1);
}
const path = `${PREDICTIONS_DIR}${id}.json`;
if (!existsSync(path)) {
  console.error(
    `${path} が無い。手書きの部分（verification・team・fixedSpec・hypotheses・targets、predicted: null）を先に書く`,
  );
  process.exit(1);
}
const file = JSON.parse(readFileSync(path, 'utf8')) as PredictionFile;
const data = loadRecordsData(
  loadRecordingsFile(),
  file.team.map((m) => m.rid),
);
const predicted = runPredictions(file, data);
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
const at = values.date ?? todayLocal();
const verification = loadVerifications().find((v) => v.id === id);
const seen = seenAtPrediction(verification?.recordings ?? [], loadObservations());
const out: PredictionFile = { ...file, predicted: { at, commit, values: predicted, seen } };
writeFileSync(path, `${JSON.stringify(out, null, 2)}\n`);
for (const h of file.hypotheses) {
  for (const t of file.targets) {
    const v = predicted[h.id]![t.id]!;
    console.log(`${h.id} ${t.id}（${t.metric}）: ${Array.isArray(v) ? JSON.stringify(v) : v.toLocaleString('en-US')}`);
  }
}
for (const [r, ids] of Object.entries(seen)) {
  console.log(
    `読み直し: 録画 ${r} の既にある観測値 ${ids.length} 件を控えた${ids.length > 0 ? `（${ids.join('・')}。後付けとして数えない）` : ''}`,
  );
}
console.log(`${path} に predicted を書いた（${at}、commit ${commit.slice(0, 7)}）。この後 commit する`);
