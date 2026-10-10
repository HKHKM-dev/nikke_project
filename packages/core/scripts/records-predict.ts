// 予測（plan/design-records-automation.md 3.2 節）: records/predictions/V-NNNN.json の手書きの部分（編成・仮説・比べる指標）
// から sim（calc）を回し、predicted（仮説 × 指標の値、日付、commit）を書き込む。手書きの部分は触らない。
// 使い方: npm run records:predict -- V-NNNN [--date YYYY-MM-DD]
// 予測は任意の道具で、確定の条件ではない（plan/design-investigation-review.md 1 節）。撮影計画で、その録画で仮説を見分けられるかを
// 確かめるのに使う。
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { runPredictions, todayLocal, type PredictionFile } from '../src/records/predictions.ts';
import { PREDICTIONS_DIR, ROOT, loadRecordingsFile, loadRecordsData } from './records-data.ts';

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
// 2026-10-10 より前の控え（seen）は書き直すときに落とす（読まなくなった。plan/design-investigation-review.md 1.3 節）
const out: PredictionFile = { ...file, predicted: { at, commit, values: predicted } };
writeFileSync(path, `${JSON.stringify(out, null, 2)}\n`);
for (const h of file.hypotheses) {
  for (const t of file.targets) {
    const v = predicted[h.id]![t.id]!;
    console.log(`${h.id} ${t.id}（${t.metric}）: ${Array.isArray(v) ? JSON.stringify(v) : v.toLocaleString('en-US')}`);
  }
}
console.log(`${path} に predicted を書いた（${at}、commit ${commit.slice(0, 7)}）`);
