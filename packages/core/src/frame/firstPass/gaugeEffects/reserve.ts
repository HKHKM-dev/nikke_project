// 1 パス目のゲージを溜める効果（../gaugeEffects.ts の createGaugeEffects）の、フレームに予約したゲージの表と、周期のゲージの記録。
import type { FirstPassResult } from '../../firstPass.ts';
import type { FirstPassBase } from '../base.ts';

/** フレームに予約したゲージの表と、周期のゲージを予約して記録する口 */
export function createGaugeReserve({ frames }: FirstPassBase) {
  const pendingGauge = new Map<number, number>();
  const timerGauges: FirstPassResult['timerGauges'] = [];
  /** 周期のゲージを、発火 fireFrame の後のフレーム at のゲージに予約する（timerGauges にも残す） */
  const reserveTimerGauge = (slotIndex: number, fireFrame: number, at: number, energy: number): void => {
    timerGauges.push({ slotIndex, fireFrame, frame: at, energy });
    pendingGauge.set(at, (pendingGauge.get(at) ?? 0) + energy);
  };
  /** フレーム at のゲージに energy を予約する（at は予約するフレームより後か、takeReservedGauge の前のそのフレーム） */
  const reserveGauge = (at: number, energy: number): void => {
    if (at < frames) pendingGauge.set(at, (pendingGauge.get(at) ?? 0) + energy);
  };
  /** 前のフレームまでに予約した、このフレームのゲージ（段のヒットのゲージなど。V-0030） */
  const takeReservedGauge = (f: number): number => {
    const gauge = pendingGauge.get(f) ?? 0;
    pendingGauge.delete(f);
    return gauge;
  };
  return { pendingGauge, reserveGauge, reserveTimerGauge, takeReservedGauge, timerGauges };
}

export type GaugeReserve = ReturnType<typeof createGaugeReserve>;
