// 照合ランナー: 比べる観測値をモデルと比べて残差を出す（plan/design-stage19.md 2.5 節）
import { runSimulation, type SimResult } from '../../sim/engine.ts';
import type { TeamInput } from '../../team.ts';
import type { RecordingEntry } from '../recordings.ts';
import type { MetricContext } from './metrics/context.ts';
import { METRICS } from './metrics/index.ts';
import { buildTeamInput, type RecordsData } from './teamInput.ts';
import type { CompareSpec, Observation, Tolerance } from './types.ts';

/** invalid は失効した観測値（比べずに一覧に残す） */
export type ResidualStatus = 'ok' | 'outside' | 'error' | 'invalid';

export type Residual = {
  observation: Observation;
  status: ResidualStatus;
  predicted: number | number[] | null;
  /** 比べた差（列なら要素ごとの差の最大。rel は比、abs は差） */
  diff: number | null;
  message?: string;
};

function within(measured: number, predicted: number, tolerance: Tolerance): { diff: number; ok: boolean } {
  if ('rel' in tolerance) {
    const diff = measured === 0 ? (predicted === 0 ? 0 : Infinity) : (predicted - measured) / measured;
    return { diff, ok: Math.abs(diff) <= tolerance.rel };
  }
  const diff = predicted - measured;
  return { diff, ok: Math.abs(diff) <= tolerance.abs };
}

export function compareValue(
  measured: number | number[],
  predicted: number | number[],
  tolerance: Tolerance,
): { diff: number; ok: boolean } {
  if (Array.isArray(measured) !== Array.isArray(predicted)) return { diff: Infinity, ok: false };
  if (!Array.isArray(measured) || !Array.isArray(predicted))
    return within(measured as number, predicted as number, tolerance);
  if (measured.length !== predicted.length) return { diff: Infinity, ok: false };
  let worst = 0;
  let ok = true;
  measured.forEach((m, i) => {
    const r = within(m, predicted[i]!, tolerance);
    if (Math.abs(r.diff) > Math.abs(worst)) worst = r.diff;
    ok &&= r.ok;
  });
  return { diff: worst, ok };
}

/** 1 つの観測値のモデルの予測値か、予測できなかったわけ */
export type Prediction = { predicted: number | number[] } | { error: string };

/**
 * 予測値の覚え（packages/core/scripts/residual-cache.ts。plan/design-workflow-simplification-8.md 2 節）。key は、モデルのコードと
 * データのほかに予測を決める入力（predictionKey）。モデルのコードとデータで覚えを分けるのは覚える側
 */
export type PredictionMemo = {
  get(key: string): Prediction | undefined;
  set(key: string, prediction: Prediction): void;
};

/**
 * 観測値の予測を決める入力のうち、モデルのコードとデータ（residual-cache.ts の MODEL_ROOTS）でないもの: 録画の ID と JSON・比べる指定と、
 * 比べる指定が ID で指すほかの観測値の値（条件が時刻などを観測値の ID で指す。buildTeamInput）。観測値自身の値と許容は入れない（比べるのは
 * 覚えの後）
 */
export function predictionKey(o: Observation, recording: RecordingEntry | undefined, data: RecordsData): string {
  const c = o.compare!;
  const refs: [string, number | number[]][] = [];
  JSON.stringify(c, (_, v: unknown) => {
    if (typeof v === 'string') {
      const value = data.observationValues?.get(v);
      if (value !== undefined) refs.push([v, value]);
    }
    return v;
  });
  return JSON.stringify({
    // 録画が無いと予測は「録画 <ID> が無い」のエラーになるので、ID も入れる
    id: o.recording,
    recording: recording ?? null,
    metric: c.metric,
    args: c.args ?? null,
    setup: c.setup ?? null,
    refs,
  });
}

/** 覚えてよい予測（JSON で往復して同じになるもの。NaN・Infinity は JSON で null になるので覚えない） */
function memorable(p: Prediction): boolean {
  if ('error' in p) return true;
  return (Array.isArray(p.predicted) ? p.predicted : [p.predicted]).every(Number.isFinite);
}

/**
 * use が compare の観測値をすべてモデルと比べる。同じ録画・同じ条件のモデルは 1 回だけ回す。memo があれば、覚えた予測値を使い、
 * 覚えていない観測値だけモデルを回す
 */
export function runObservations(
  observations: readonly Observation[],
  recordings: ReadonlyMap<string, RecordingEntry>,
  data: RecordsData,
  memo?: PredictionMemo,
): Residual[] {
  const cache = new Map<string, { input: TeamInput; sim?: SimResult }>();
  const predict = (o: Observation, c: CompareSpec, recording: RecordingEntry | undefined): Prediction => {
    try {
      if (recording === undefined) throw new Error(`録画 ${o.recording} が無い`);
      const metric = METRICS[c.metric];
      if (metric === undefined) throw new Error(`metric ${c.metric} が語彙に無い`);
      const key = `${o.recording}:${JSON.stringify(c.setup)}`;
      let run = cache.get(key);
      if (run === undefined) {
        run = { input: buildTeamInput(recording, c.setup, data) };
        cache.set(key, run);
      }
      const ctx: MetricContext = { args: c.args, input: run.input };
      run.sim ??= runSimulation(run.input);
      return { predicted: metric.sim(run.sim, ctx) };
    } catch (e) {
      return { error: (e as Error).message };
    }
  };
  const residuals: Residual[] = [];
  for (const o of observations) {
    const c = o.compare;
    if (o.use !== 'compare' || c === undefined) continue;
    if (o.invalid !== undefined) {
      residuals.push({ observation: o, status: 'invalid', predicted: null, diff: null, message: o.invalid.reason });
      continue;
    }
    const recording = recordings.get(o.recording);
    const key = memo === undefined ? undefined : predictionKey(o, recording, data);
    let p = key === undefined ? undefined : memo!.get(key);
    if (p === undefined) {
      p = predict(o, c, recording);
      if (key !== undefined && memorable(p)) memo!.set(key, p);
    }
    if ('error' in p) {
      residuals.push({ observation: o, status: 'error', predicted: null, diff: null, message: p.error });
      continue;
    }
    // 下書きは許容が無いことがある（そのときも投げずに比べられない 1 行にする）
    try {
      const { diff, ok } = compareValue(o.value, p.predicted, c.tolerance);
      residuals.push({ observation: o, status: ok ? 'ok' : 'outside', predicted: p.predicted, diff });
    } catch (e) {
      residuals.push({ observation: o, status: 'error', predicted: null, diff: null, message: (e as Error).message });
    }
  }
  return residuals;
}
