// 録画の編成・条件で sim を回し、指標のモデルの値を出す（観測値を書く前の見当。plan/design-workflow-simplification-14.md 4 節）。
//   npm run records:model -- <録画 id> <指標>[,<指標>...] --setup '<JSON>' [--args '<JSON>']
// 指標の語彙と args・setup の形は観測値の compare と同じ（packages/core/src/records/observations/metrics/・setup.ts）。setup が ID で
// 指す観測値の値（jumpWindows など）も、観測値のファイルから引く。値は標準出力に 1 行ずつ「指標: 値」で出す。
import { parseArgs } from 'node:util';
import { runSimulation } from '../src/sim/engine.ts';
import { METRICS } from '../src/records/observations/metrics/index.ts';
import type { CompareSetup } from '../src/records/observations/setup.ts';
import { buildTeamInput } from '../src/records/observations/teamInput.ts';
import type { CompareSpec } from '../src/records/observations/types.ts';
import { loadRecordingsFile, loadRecordsData, recordingMap } from './records-data.ts';

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

function parseObject<T>(text: string | undefined, name: string): T | undefined {
  if (text === undefined) return undefined;
  try {
    const value = JSON.parse(text) as unknown;
    if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('オブジェクトでない');
    return value as T;
  } catch (e) {
    return fail(`--${name} の JSON が読めない: ${(e as Error).message}`);
  }
}

const [recordingId, metricList] = positionals;
if (recordingId === undefined || metricList === undefined) fail('録画 id と指標が要る');
const metrics = metricList.split(',').map((m) => m.trim());
const unknown = metrics.filter((m) => METRICS[m] === undefined);
if (unknown.length > 0) fail(`指標が語彙に無い: ${unknown.join('・')}（語彙: ${Object.keys(METRICS).join(' / ')}）`);
const args = parseObject<CompareSpec['args']>(values.args, 'args') ?? {};
const setup = parseObject<CompareSetup>(values.setup, 'setup');
if (typeof setup?.enemy !== 'string') fail('--setup が要る（enemy を含む。観測値の compare.setup と同じ形）');

const file = loadRecordingsFile();
const recording = recordingMap(file).get(recordingId);
if (recording === undefined) fail(`録画 ${recordingId} が台帳に無い`);
const input = buildTeamInput(recording, setup, loadRecordsData(file));
const sim = runSimulation(input);
for (const m of metrics) {
  try {
    console.log(`${m}: ${JSON.stringify(METRICS[m]!.sim(sim, { args, input }))}`);
  } catch (e) {
    console.log(`${m}: 出せない（${(e as Error).message}）`);
  }
}
