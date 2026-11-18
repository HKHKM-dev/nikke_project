// 録画の編成・条件で sim を回し、指標のモデルの値を出す（観測値を書く前の見当。plan/design-workflow-simplification-14.md 4 節）。
//   npm run records:model -- <録画 id> <指定>... --setup '<JSON>' [--args '<JSON>']
//   npm run records:model -- --like <観測値 ID> [<指定>...] [--setup '<JSON>'] [--args '<JSON>']
// 指定は「指標」「指標,指標」か「指標:{args の JSON}」で、並べると 1 回で全部を出す（args は --args に重ねる）。--like は、その観測値の
// 録画・setup・args（指定が無ければ指標も。指標が違う指定には、その指標が要る引数だけ）を使い、--setup・--args はその上に重ねる（plan/design-workflow-simplification-15.md 6 節）。
// 指定ごとに、比べる指定（compare）を持つ仮の観測値を作り、records:check と同じ検査（addedObservationErrors）に通してから、残差の計算と
// 同じ predictCompare でモデルの値を出す。指標の語彙と args・setup の形は観測値の compare と同じなので、出した指定は
// そのまま records:new observation の下書きに写せる。値は標準出力に 1 行ずつ「指定: 値」で出す。
import { predictCompare, type ModelCache } from '../src/records/observations/run.ts';
import { METRICS } from '../src/records/observations/metrics/index.ts';
import type { CompareSpec, Observation } from '../src/records/observations/types.ts';
import {
  addedObservationErrors,
  loadObservations,
  loadRecordingsFile,
  loadRecordsData,
  recordingMap,
  splitIds,
} from './records-data.ts';
import { cliArgs } from './cli.ts';

const USAGE = [
  "usage: npm run records:model -- <録画 id> <指定>... --setup '<JSON>' [--args '<JSON>']",
  "       npm run records:model -- --like <観測値 ID> [<指定>...] [--setup '<JSON>'] [--args '<JSON>']",
  '       指定は 指標 か 指標,指標 か 指標:{"n":10}',
].join('\n');

const { values, positionals } = cliArgs(import.meta.url, {
  allowPositionals: true,
  options: { args: { type: 'string' }, setup: { type: 'string' }, like: { type: 'string' } },
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
    return fail(`${name} の JSON が読めない: ${(e as Error).message}`);
  }
}

/** 指定（指標・指標,指標・指標:{args}）を、指標と重ねる args の組に。text は出すときの見出し */
function parseSpecs(texts: readonly string[]): { metric: string; args: Record<string, unknown>; text: string }[] {
  return texts.flatMap((text) => {
    const at = text.indexOf(':{');
    if (at < 0) return splitIds(text).map((metric) => ({ metric, args: {}, text: metric }));
    // 指標,指標:{args} は、どの指標にも args を重ねる
    const args = parseObject(text.slice(at + 1), text.slice(0, at));
    return splitIds(text.slice(0, at)).map((metric) => ({ metric, args, text: `${metric}${text.slice(at)}` }));
  });
}

// --like の観測値（録画・setup・指標・args の既定）。録画は残差の計算と同じく recording だけを見る
const like =
  values.like === undefined
    ? undefined
    : (loadObservations().find((o) => o.id === values.like) ?? fail(`観測値 ${values.like} が無い`));
const likeCompare =
  like === undefined
    ? undefined
    : (like.compare ?? fail(`観測値 ${like.id} はモデルと比べる指定（compare）を持たない`));
if (like !== undefined && like.recording === undefined)
  fail(`観測値 ${like.id} は録画が 1 本でない（録画 id と --setup で指定する）`);
const [recordingId, ...rest] = like === undefined ? positionals : [like.recording!, ...positionals];
if (recordingId === undefined) fail('録画 id が要る');
const specs = parseSpecs(rest.length > 0 ? rest : likeCompare === undefined ? [] : [likeCompare.metric]);
if (specs.length === 0) fail('指標が要る');
if (values.setup === undefined && likeCompare === undefined)
  fail('--setup が要る（enemy を含む。観測値の compare.setup と同じ形）');
const setup = {
  ...likeCompare?.setup,
  ...(values.setup === undefined ? {} : parseObject(values.setup, '--setup')),
} as CompareSpec['setup'];
const extraArgs = values.args === undefined ? {} : parseObject(values.args, '--args');
/** args は --like の観測値の args（指標が違えば、その指標が要る引数だけ）→ --args → 指定の args の順に重ねる */
function argsOf(spec: (typeof specs)[number]): CompareSpec['args'] {
  const inherited = Object.entries(likeCompare?.args ?? {}).filter(
    ([k]) => spec.metric === likeCompare?.metric || METRICS[spec.metric]?.args.includes(k) === true,
  );
  return { ...Object.fromEntries(inherited), ...extraArgs, ...spec.args } as CompareSpec['args'];
}

const file = loadRecordingsFile();
const recording = recordingMap(file).get(recordingId);
if (recording === undefined) fail(`録画 ${recordingId} が台帳に無い`);
const recordings = new Map([[recordingId, recording]]);
// 仮の観測値（番号は実際の観測値と重ならない大きさにする。値は使わない）
const probes: Observation[] = specs.map((s, i) => ({
  id: `${recordingId}-${900_000 + i}`,
  recording: recordingId,
  kind: 'count',
  use: 'compare',
  value: 0,
  description: 'records:model',
  source: 'records:model',
  compare: {
    model: 'sim',
    metric: s.metric,
    args: argsOf(s),
    setup,
    tolerance: { abs: 0 },
  },
}));
const label = (text: string) => probes.reduce((t, p, i) => t.replaceAll(`${p.id}:`, `${specs[i]!.text}:`), text);
const errors = addedObservationErrors(probes, recordings);
if (errors.length > 0) fail(`指定が観測値の検査に通らない:\n${errors.map((e) => `  ${label(e)}`).join('\n')}`);
const data = loadRecordsData({ recordings: [recording] });
const cache: ModelCache = new Map();
for (const [i, p] of probes.entries()) {
  const r = predictCompare(recordingId, recording, p.compare!, data, cache);
  console.log(`${specs[i]!.text}: ${'error' in r ? `出せない（${r.error}）` : JSON.stringify(r.predicted)}`);
}
