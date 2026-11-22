// 1 パス目のゲージを溜める効果（../gaugeEffects.ts の createGaugeEffects）のうち、射撃の回数で溜まるゲージ（段の循環・倍率ダメージの
// ゲージ・射撃の回数のゲージ。追跡は createShotGaugeTrackers が作る）を、フレームごとに数えて足すか予約する。
import { advanceShotCount, shotCountWeight } from '../../../skills/triggers.ts';
import type { FirstPassResult } from '../../firstPass.ts';
import type { FirstPassBase } from '../base.ts';
import type { Gauge } from '../gauge.ts';
import type { LandingGauge } from './landing.ts';
import type { GaugeReserve } from './reserve.ts';

import type { ShotGaugeTrackers } from '../gaugeEffects.ts';

/** 射撃の回数で溜まるゲージを数え、このフレームのゲージに足すか予約する */
export function createShotCountGauges({
  cycleTrackers,
  damageGaugeTrackers,
  frames,
  hitGaugeEnergy,
  landingGauge,
  lists,
  pendingGauge,
  shotEvents,
  shotFlightAt,
  shotGaugeTrackers,
}: FirstPassBase & Gauge & ShotGaugeTrackers & GaugeReserve & LandingGauge) {
  const cycleGaugeHits: FirstPassResult['cycleGaugeHits'] = [];
  /**
   * V-0030: 段の循環。このフレームの射撃を数え、段のヒットのゲージを当たるフレームに予約する。間隔の変更の件は、このフレームに
   * 付いたもの（発動のフレームから）も見るので、手順 3 の後に呼ぶ
   */
  const countCycles = (f: number): void => {
    for (const t of cycleTrackers) {
      const ev = shotEvents[t.slotIndex];
      if (ev === null || ev === undefined) continue;
      if (t.fullChargeOnly && !ev.fullCharge) continue;
      t.count += 1;
      let e = t.every;
      for (const every of lists.cycleEveryAt(t.slotIndex, t.skill, f)) e = Math.min(e, every);
      if (t.count % e !== 0) continue;
      const energy = hitGaugeEnergy(t.slotIndex);
      for (const d of t.gaugeHits[t.step]!) {
        const at = f + d;
        cycleGaugeHits.push({ slotIndex: t.slotIndex, shotFrame: f, frame: at, energy });
        if (at < frames) pendingGauge.set(at, (pendingGauge.get(at) ?? 0) + energy);
      }
      t.step = (t.step + 1) % t.gaugeHits.length;
    }
  };
  /** このフレームの射撃で溜まる、倍率ダメージのゲージと射撃の回数のゲージを足す（この順） */
  const addShotCountGauges = (gauge: number, f: number): number => {
    // ゲージを溜める倍率ダメージ。遅れ 0（V-0035 のモダニア。発と同じフレームに当たる）はこのフレームのゲージに足す
    for (const t of damageGaugeTrackers) {
      const shot = shotEvents[t.slotIndex];
      if (shot === null || shot === undefined) continue;
      const counted = advanceShotCount(t.n, shotCountWeight(t.count, shot), t.every);
      t.n = counted.count;
      if (!counted.fired) continue;
      // 射撃ごとの倍率ダメージのヒット（S1 の追加ダメージなど）も、発の着弾から数える（飛ぶ時間。plan/design-anis-star-gauge-timing.md 3.1 節）
      const flight = shotFlightAt(t.slotIndex, f);
      const energy = hitGaugeEnergy(t.slotIndex);
      for (const d of t.gaugeHits) gauge += landingGauge(t.slotIndex, f + flight + d, f, energy, 1);
    }
    // 射撃の回数でゲージだけを溜める効果。発火した射撃のフレームのゲージに足す（遅れがあれば、そのフレームに予約する）
    for (const t of shotGaugeTrackers) {
      const shot = shotEvents[t.slotIndex];
      if (shot === null || shot === undefined) continue;
      const counted = advanceShotCount(t.n, shotCountWeight(t.count, shot), t.every);
      t.n = counted.count;
      if (!counted.fired) continue;
      const energy = hitGaugeEnergy(t.slotIndex);
      if (t.delayFrames === 0) gauge += energy;
      else if (f + t.delayFrames < frames) {
        pendingGauge.set(f + t.delayFrames, (pendingGauge.get(f + t.delayFrames) ?? 0) + energy);
      }
    }
    return gauge;
  };
  return { addShotCountGauges, countCycles, cycleGaugeHits };
}
