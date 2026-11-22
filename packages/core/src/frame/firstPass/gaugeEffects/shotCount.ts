// 1 パス目のゲージを溜める効果のうち、射撃の回数で溜まるゲージ（段の循環・倍率ダメージのゲージ・射撃の回数のゲージ）: 追跡を作る
// createShotGaugeTrackers（件の一覧の前。../firstPass.ts が呼ぶ）と、フレームごとに数えて足すか予約する createShotCountGauges
// （../gaugeEffects.ts の createGaugeEffects が呼ぶ）。
import { burstDelaysOf } from '../../../burst/landing.ts';
import { resolveDamageGauges, resolveShotGauges } from '../../../skills/burstDamage.ts';
import { resolveCycleEvery, resolveCycles } from '../../../skills/cycles.ts';
import { advanceShotCount, shotCountWeight } from '../../../skills/triggers.ts';
import type { FirstPassResult } from '../../firstPass.ts';
import type { FirstPassBase } from '../base.ts';
import type { Gauge } from '../gauge.ts';
import type { ShotCountKind } from '../../../skills/types.ts';
import type { SkillSlot } from '../../../types.ts';
import type { LandingGauge } from './landing.ts';
import type { GaugeReserve } from './reserve.ts';

/**
 * V-0030: ゲージを溜める段の循環を 1 パス目で追う状態。規則は skills/cycles.ts の cycleFires と同じ
 * （通算の射撃回数 n、間隔の変更の件の中は件の every。件は持ち主ごとの一覧の、循環の間隔の変更）
 */
type CycleGaugeTracker = {
  slotIndex: number;
  /** 段の循環のスロット（間隔の変更の件を引く） */
  skill: SkillSlot;
  every: number;
  gaugeHits: number[][];
  count: number;
  step: number;
  /** fullChargeShot の循環は部分チャージの発を数えない */
  fullChargeOnly: boolean;
};

/** 射撃の回数で溜まるゲージ（段の循環・倍率ダメージのゲージ・射撃の回数のゲージ）の追跡を作る */
export function createShotGaugeTrackers({ logs, slots }: FirstPassBase) {
  // V-0030: 段のヒットでゲージを溜める循環。溜めるゲージは当たるフレームに予約する（pendingGauge）
  const cycleTrackers: CycleGaugeTracker[] = [];
  slots.forEach((slot, i) => {
    if (slot === null || slot.definition === null) return;
    const log = logs[i]!;
    for (const cycle of resolveCycles(slot.definition, slot.character, slot.levels)) {
      if (cycle.gaugeHits.every((d) => d.length === 0)) continue;
      if (cycle.trigger.count === 'fullChargeShot' && !log.fullCharge) continue;
      for (const e of resolveCycleEvery(slot.definition, slot.character, slot.levels)) {
        if (e.targetSkill !== cycle.source.skill) continue;
        if (e.trigger !== 'burstUse') {
          throw new RangeError(`cycle gauge hits support only a burstUse cycleEvery, got ${JSON.stringify(e.trigger)}`);
        }
        // 循環の窓は発動のフレームから数えるので、効果の発火が遅れるキャラ（burst/landing.ts）には使えない
        if (burstDelaysOf(slot.character).effectFrames !== 0) {
          throw new RangeError('cycleEvery is not supported for a character with a burst effect delay');
        }
      }
      cycleTrackers.push({
        slotIndex: i,
        skill: cycle.source.skill,
        every: cycle.trigger.every,
        gaugeHits: cycle.gaugeHits,
        count: 0,
        step: 0,
        fullChargeOnly: cycle.trigger.count === 'fullChargeShot',
      });
    }
  });
  // ゲージを溜める倍率ダメージ（damage の gaugeHits。V-0034）。射撃を数えて、段と同じく当たるフレームに予約する
  const damageGaugeTrackers: {
    slotIndex: number;
    count: ShotCountKind;
    every: number;
    gaugeHits: number[];
    n: number;
  }[] = [];
  slots.forEach((slot, i) => {
    if (slot === null || slot.definition === null) return;
    for (const g of resolveDamageGauges(slot.definition, slot.character, slot.levels)) {
      if (g.trigger.count === 'fullChargeShot' && !logs[i]!.fullCharge) continue;
      damageGaugeTrackers.push({
        slotIndex: i,
        count: g.trigger.count,
        every: g.trigger.every,
        gaugeHits: g.gaugeHits,
        n: 0,
      });
    }
  });
  // 射撃の回数でゲージだけを溜める効果（burstGaugeHit。plan/design-moran.md 3 節）。射撃を数えて、発火した射撃の
  // フレームのゲージに足す（付けるのは撃った時でヒットではないので、飛ぶ時間は足さない）。回数トリガーの遅れ編
  // （plan/design-shot-count-trigger-frame.md 6 節）: delayFrames があれば、発火した射撃の delayFrames 後のゲージに足す（C-0480）
  const shotGaugeTrackers: {
    slotIndex: number;
    count: ShotCountKind;
    every: number;
    n: number;
    delayFrames: number;
  }[] = [];
  slots.forEach((slot, i) => {
    if (slot === null || slot.definition === null) return;
    for (const t of resolveShotGauges(slot.definition, slot.character, slot.levels)) {
      if (t.count === 'fullChargeShot' && !logs[i]!.fullCharge) continue;
      shotGaugeTrackers.push({
        slotIndex: i,
        count: t.count,
        every: t.every,
        n: 0,
        delayFrames: t.delayFrames ?? 0,
      });
    }
  });
  return { cycleTrackers, damageGaugeTrackers, shotGaugeTrackers };
}

export type ShotGaugeTrackers = ReturnType<typeof createShotGaugeTrackers>;

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
