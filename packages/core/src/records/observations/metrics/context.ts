// 指標（METRICS）の型と、テーマをまたいで使う補助（plan/design-observations-split.md 3.1 節）
import type { BurstActivation, BurstSchedule } from '../../../burst/schedule.ts';
import type { SimResult } from '../../../sim/engine.ts';
import type { TeamInput } from '../../../team.ts';
import type { CompareSpec } from '../types.ts';

export type MetricContext = {
  args: CompareSpec['args'];
  input: TeamInput;
};

export type Metric = {
  /** 必須の引数 */
  args: readonly string[];
  sim: (result: SimResult, ctx: MetricContext) => number | number[];
};

export function slotIndexOf(ctx: MetricContext): number {
  return Number(ctx.args.slot) - 1;
}

export function slotOf<T>(slots: readonly (T | null)[], ctx: MetricContext): T {
  const slot = slots[slotIndexOf(ctx)];
  if (slot === null || slot === undefined) throw new Error(`枠 ${String(ctx.args.slot)} が無い`);
  return slot;
}

/** 枠（ctx.args.slot）の n 発目（1 始まり）を撃ったフレームを frame に入れた ctx（maxAmmoAtShot・hitDamageAtShot） */
export function atShotFrame(result: SimResult, ctx: MetricContext, n: number): MetricContext {
  const frame = slotOf(result.shots, ctx).frames[n - 1];
  if (frame === undefined) throw new Error(`枠 ${String(ctx.args.slot)} の ${n} 発目が無い`);
  return { ...ctx, args: { ...ctx.args, frame } };
}

/** 引数 n（回・発の番号）がカンマ区切りの並び（"0,2,3"）なら回ごとの列、1 つなら 1 つの値 */
export function eachOrOne(n: unknown, at: (n: number) => number): number | number[] {
  if (typeof n === 'string') return n.split(',').map((x) => at(Number(x.trim())));
  return at(Number(n));
}

export function median(values: readonly number[]): number {
  if (values.length === 0) throw new Error('値が無い');
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** 結果の頭の skip 個（省略は 0）を飛ばし、count 個に切る（count が無ければ残り全部。足りなければ誤り） */
export function firstCount<T>(values: T[], ctx: MetricContext, what: string): T[] {
  const skip = ctx.args.skip === undefined ? 0 : Number(ctx.args.skip);
  const count = ctx.args.count === undefined ? values.length - skip : Number(ctx.args.count);
  if (values.length < skip + count) throw new Error(`${what}が ${values.length} 回しか無い`);
  return values.slice(skip, skip + count);
}

/** ctx の引数を args で上書きした ctx（undefined の欄は消す）。指標を eventFrames の包みにするときに使う */
export function withArgs(
  ctx: MetricContext,
  args: Record<string, string | number | boolean | undefined>,
): MetricContext {
  const merged: CompareSpec['args'] = { ...ctx.args };
  for (const [k, v] of Object.entries(args)) {
    if (v === undefined) delete merged[k];
    else merged[k] = v;
  }
  return { ...ctx, args: merged };
}

/**
 * n 回目（0 始まり）の発動の、1 ヒット目から各ヒットまでの動画のフレーム数
 * （先頭は 0。1 ヒットなら [0]。plan/design-burst-split-hits.md 4.4 節）
 */
/** 枠の n 回目（ctx.args.n。0 始まり）の発動と、その時刻表 */
export function nthActivationOf(
  result: SimResult,
  ctx: MetricContext,
): { schedule: BurstSchedule; activation: BurstActivation } {
  const schedule = result.schedule;
  if (schedule === null) throw new Error('バーストの時刻表が無い');
  const activation = schedule.activations.filter((a) => a.slotIndex === slotIndexOf(ctx))[Number(ctx.args.n)];
  if (activation === undefined) throw new Error(`${String(ctx.args.n)} 回目の発動が無い`);
  return { schedule, activation };
}
