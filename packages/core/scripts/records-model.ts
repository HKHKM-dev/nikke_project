// 録画の編成・条件で sim を回し、指標のモデルの値を出す（観測値を書く前の見当。plan/design-workflow-simplification-14.md 4 節）。
//   npm run records:model -- <録画 id> <指標>[,<指標>...] --setup '<JSON>' [--args '<JSON>']
// 指標ごとに、比べる指定（compare）を持つ仮の観測値を作り、records:check と同じ検査（addedObservationErrors）に通してから、残差の計算と
// 同じ predictCompare でモデルの値を出す。指標の語彙と args・setup の形は観測値の compare と同じなので、出した指定は
// そのまま records:new observation の下書きに写せる。値は標準出力に 1 行ずつ「指標: 値」で出す。
import { parseArgs } from 'node:util';
import { predictCompare, type ModelCache } from '../src/records/observations/run.ts';
import type { CompareSpec, Observation } from '../src/records/observations/types.ts';
import { addedObservationErrors, loadRecordingsFile, loadRecordsData, recordingMap, splitIds } from './records-data.ts';

const USAGE = "usage: npm run records:model -- <録画 id> <指標>[,<指標>...] --setup '<JSON>' [--args '<JSON>']";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { args: { type: 'string' }, setup: { type: 'string' } },
});

function fail(message: string): never {
  console.error(message);
  console.error(USAGE);
  process.exit(1);
}

function parseObject(text: string, name: string): Record<string, unknown> {
  try {
    const value = JSON.parse(text) as unknown;
    if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('オブジェクトでない');
    return value as Record<string, unknown>;
  } catch (e) {
    return fail(`--${name} の JSON が読めない: ${(e as Error).message}`);
  }
}

const [recordingId, metricList] = positionals;
if (recordingId === undefined || metricList === undefined) fail('録画 id と指標が要る');
if (values.setup === undefined) fail('--setup が要る（enemy を含む。観測値の compare.setup と同じ形）');
const setup = parseObject(values.setup, 'setup') as CompareSpec['setup'];
const args = (values.args === undefined ? {} : parseObject(values.args, 'args')) as CompareSpec['args'];

const file = loadRecordingsFile();
const recording = recordingMap(file).get(recordingId);
if (recording === undefined) fail(`録画 ${recordingId} が台帳に無い`);
const recordings = new Map([[recordingId, recording]]);
// 仮の観測値（番号は実際の観測値と重ならない大きさにする。値は使わない）
const metrics = splitIds(metricList);
const probes: Observation[] = metrics.map((metric, i) => ({
  id: `${recordingId}-${900_000 + i}`,
  recording: recordingId,
  kind: 'count',
  use: 'compare',
  value: 0,
  description: 'records:model',
  source: 'records:model',
  compare: { model: 'sim', metric, args, setup, tolerance: { abs: 0 } },
}));
const label = (text: string) => probes.reduce((t, p, i) => t.replaceAll(`${p.id}:`, `${metrics[i]}:`), text);
const errors = addedObservationErrors(probes, recordings);
if (errors.length > 0) fail(`指定が観測値の検査に通らない:\n${errors.map((e) => `  ${label(e)}`).join('\n')}`);
const data = loadRecordsData({ recordings: [recording] });
const cache: ModelCache = new Map();
for (const [i, p] of probes.entries()) {
  const r = predictCompare(recordingId, recording, p.compare!, data, cache);
  console.log(`${metrics[i]}: ${'error' in r ? `出せない（${r.error}）` : JSON.stringify(r.predicted)}`);
}
