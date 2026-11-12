// 1 パス目（../firstPass.ts の runFirstPassOnce）の蓄積して爆発するダメージ（plan/design-split-first-pass.md 3.4 節。
// plan/design-accumulate-explosion.md）: 付いている間の発を溜め、爆発のゲージを足す。
import { ZERO_BUFFS } from '../../skills/buffs.ts';
import { type AccumulateRelease } from '../firstPass.ts';
import type { FirstPassBase } from './base.ts';
import type { Gauge } from './gauge.ts';
import type { GaugeEffects } from './gaugeEffects.ts';

/** 蓄積爆破の蓄積と爆発を追う */
export function createAccumulate({
  damageEffects,
  hitGaugeEnergy,
  lists,
  logs,
  options,
  passive,
  shotEvents,
  windowsOf,
}: FirstPassBase & Gauge & GaugeEffects) {
  // 蓄積して爆発するダメージ（plan/design-accumulate-explosion.md 2.3・2.4 節）: 蓄積爆破（damage の accumulate の self）。フルチャージの発で、
  // 付いていなければ付ける（付けた発は溜めない）。付けた後、切れる capDelayFrames 前までの発（C-0927）の値 × (割合 + 蓄積割合▲) を、
  // 次のフレームの頭に（その発のフレームまでに付いた件と、2 パス目と同じ 1 発の値の関数で）数えて溜め、最大量に届いた発の
  // capDelayFrames 後に最大量を出して解除する。付くのは付けた発の applyDelayFrames 後で、最大量はそのフレームの値で決め（C-0916）、
  // 届かなければ付いてから窓の長さで切れ、射手の 1 ヒットぶんのゲージを溜める（C-0430）。付くまでの発は、最大量が決まってから溜める
  const accumulators = damageEffects.flatMap((effects, slotIndex) =>
    effects.flatMap((effect) => {
      const acc = effect.accumulate;
      if (acc?.source !== 'self') return [];
      return [
        {
          slotIndex,
          effect,
          acc,
          active: null as null | {
            applied: number;
            expire: number;
            cap: number | null;
            stored: number;
            reached: number | null;
          },
          pending: [] as { frame: number; progress: number | undefined }[],
        },
      ];
    }),
  );
  const shotValueAt = options.shotValueAt;
  if (accumulators.length > 0 && shotValueAt === undefined) throw new Error('accumulate (self) needs shotValueAt');
  const accumulateReleases: AccumulateRelease[] = [];
  /** 枠 i がフレーム frame に撃った発の値と最終攻撃力、そのフレームの件の合計（frame より後のフレームに呼ぶ） */
  const accumulateShotAt = (i: number, frame: number, progress: number | undefined) => {
    let buffs = lists.damageBuffsAt(i, frame, passive[i]?.buffs ?? ZERO_BUFFS);
    // 持続の命中率▲を区間に足すとき（2 パス目の区間と同じ。frame/plan.ts の planTeamRun が hitRateWith を渡す時）
    if (options.hitRateWith !== undefined && lists.hasHitTracks) {
      const timed = lists.hitRateAt(i, frame);
      buffs = { ...buffs, hitRate: buffs.hitRate + timed.n, hitRateUp: buffs.hitRateUp + timed.up };
    }
    // 時間で変わる適正最小射程距離▲も、2 パス目の区間と同じに足す（距離ボーナスの出し直し）
    const range = lists.minEffectiveRangeAt(i, frame);
    if (range !== 0) buffs = { ...buffs, minEffectiveRange: buffs.minEffectiveRange + range };
    const fullBurst = windowsOf().some((w) => w.start <= frame && frame < w.end);
    return { ...shotValueAt!(i, frame, buffs, fullBurst, progress), buffs };
  };
  /** フレーム f の頭: 前のフレームまでの発を溜め、爆発があれば記録する。切れたら溜めるゲージを返す */
  const stepAccumulator = (a: (typeof accumulators)[number], f: number): number => {
    const s = a.active;
    if (s === null) return 0;
    if (s.cap === null) {
      const attached = s.applied + a.acc.applyDelayFrames;
      if (f <= attached) return 0;
      const at = accumulateShotAt(a.slotIndex, attached, undefined);
      s.cap = at.attack * a.effect.multiplier * (1 + at.buffs.distributedDamage);
    }
    // 切れるフレームの capDelayFrames 前より後に撃った発は溜めない（C-0927。発が溜まるのは約 13f 後とみた形）
    const lastStored = s.expire - a.acc.capDelayFrames;
    for (const p of a.pending) {
      if (s.reached !== null || p.frame > lastStored) break;
      const at = accumulateShotAt(a.slotIndex, p.frame, p.progress);
      s.stored += at.value * (a.acc.ratio + at.buffs.accumulateRatio);
      if (s.stored >= s.cap) s.reached = p.frame;
    }
    a.pending.length = 0;
    // 届いた発が付くより前でも、爆発は届いた発の capDelayFrames 後（最大量が決まったフレームより前なら、そのフレーム）
    const capped = s.reached !== null && f >= s.reached + a.acc.capDelayFrames;
    if (!capped && (s.reached !== null || f !== s.expire)) return 0;
    accumulateReleases.push({
      slotIndex: a.slotIndex,
      effect: a.effect,
      applied: s.applied,
      end: (capped ? s.reached! : lastStored) + 1,
      frame: f,
      capped,
      cap: s.cap,
      stored: s.stored,
    });
    a.active = null;
    return capped ? 0 : hitGaugeEnergy(a.slotIndex);
  };
  /** フレームの頭: 溜めた発を進め、爆発のゲージを足す */
  const addAccumulatedGauge = (gauge: number, f: number): number => {
    for (const a of accumulators) gauge += stepAccumulator(a, f);
    return gauge;
  };
  /** このフレームの射撃で、蓄積を付けるか、発を溜める */
  const recordAccumulatorShots = (f: number): void => {
    // 蓄積爆破: 付いていなければフルチャージの発で付け、付いていれば発を次のフレームの頭に溜める（最大量に届いた後の発は溜めない）
    for (const a of accumulators) {
      const shot = shotEvents[a.slotIndex];
      if (shot === null || shot === undefined) continue;
      if (a.active === null) {
        if (shot.fullCharge)
          a.active = {
            applied: f,
            expire: f + a.acc.applyDelayFrames + a.acc.durationFrames,
            cap: null,
            stored: 0,
            reached: null,
          };
      } else if (a.active.reached === null) {
        const last = logs[a.slotIndex]!.partialShots?.at(-1);
        a.pending.push({ frame: f, progress: last?.frame === f ? last.progress : undefined });
      }
    }
  };
  return { accumulateReleases, addAccumulatedGauge, recordAccumulatorShots };
}

export type Accumulate = ReturnType<typeof createAccumulate>;
