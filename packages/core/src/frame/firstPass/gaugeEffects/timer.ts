// 1 パス目のゲージを溜める効果（../gaugeEffects.ts の createGaugeEffects）のうち、クールタイムの印の無い周期のゲージ（burstGaugeHit）。
import { resolveTimerGauges } from '../../../skills/burstDamage.ts';
import { timerFramesOf } from '../../../skills/timeline.ts';
import type { FirstPassBase } from '../base.ts';
import type { Gauge } from '../gauge.ts';
import type { GaugeReserve } from './reserve.ts';

/** クールタイムの印の無い周期のゲージを、発火の後のフレームに予約する */
export function createTimerGauges({
  frames,
  hitGaugeEnergy,
  reserveTimerGauge,
  slots,
  timedGauge,
}: FirstPassBase & Gauge & GaugeReserve) {
  // 周期のゲージ（burstGaugeHit）。射撃に依らないので、発火のフレームにループの前に予約する。
  // delayFrames があれば発火の後のヒットのフレームに足し、戦闘の終わりを越えるものは足さない（C-0453。plan/design-timer-ceil.md 7 節）
  // 時間で変わるゲージ速度の枠の周期のゲージは、発火のフレームの頭でその速度で予約する（発火のフレーム → 枠と遅れ）
  const timedTimerGauges = new Map<number, { slotIndex: number; delayFrames: number }[]>();
  slots.forEach((slot, i) => {
    if (slot === null || slot.definition === null) return;
    for (const { delayFrames, ...timer } of resolveTimerGauges(slot.definition)) {
      // クールタイムの印のある周期は、ループの中で発火を追って予約する（cooldown.ts の countCooldownTimers）
      if (timer.cooldown === true) continue;
      for (const fire of timerFramesOf(timer, frames)) {
        const at = fire + delayFrames;
        if (at >= frames) continue;
        if (timedGauge[i])
          timedTimerGauges.set(fire, [...(timedTimerGauges.get(fire) ?? []), { slotIndex: i, delayFrames }]);
        else reserveTimerGauge(i, fire, at, hitGaugeEnergy(i));
      }
    }
  });
  /** 時間で変わる速度の枠の、フレーム f に発火する周期のゲージを予約する（../gaugeEffects.ts の reserveTimerGauges が持続ダメージの前に呼ぶ） */
  const reserveTimedTimerGauges = (f: number): void => {
    for (const t of timedTimerGauges.get(f) ?? []) {
      reserveTimerGauge(t.slotIndex, f, f + t.delayFrames, hitGaugeEnergy(t.slotIndex));
    }
  };
  return { reserveTimedTimerGauges };
}
