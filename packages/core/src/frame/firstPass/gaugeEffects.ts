// 1 パス目（../firstPass.ts の runFirstPassOnce）のゲージを溜める効果（plan/design-split-first-pass.md 3.4 節）: 段の循環・倍率ダメージ・
// 射撃の回数・持続ダメージ・味方のゲージ・CT の時間・周期のゲージを追い、ゲージをフレームに予約して足す。
import { burstDelaysOf } from '../../burst/landing.ts';
import { resolveCycleEvery, resolveCycles } from '../../skills/cycles.ts';
import { resolveDamageGauges, resolveShotGauges } from '../../skills/burstDamage.ts';
import type { ShotCountKind } from '../../skills/types.ts';
import type { SkillSlot } from '../../types.ts';
import type { FirstPassBase } from './base.ts';
import type { Gauge } from './gauge.ts';
import { createCooldownTimers } from './gaugeEffects/cooldown.ts';
import { createDamageGauges } from './gaugeEffects/damage.ts';
import { createDotGauges } from './gaugeEffects/dot.ts';
import { createLandingGauge } from './gaugeEffects/landing.ts';
import { createGaugeReserve } from './gaugeEffects/reserve.ts';
import { createShotCountGauges } from './gaugeEffects/shotCount.ts';

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

/** 自分の発動の出来事を読む口・ゲージを溜める効果の追跡を作り、そのゲージをフレームに予約して足す */
export function createGaugeEffects(base: FirstPassBase & Gauge & ShotGaugeTrackers) {
  // 準備の中の検査が投げる順を変えないため、作り手は持続ダメージ → 味方のゲージ → クールタイムの周期 → 周期のゲージ・倍率ダメージの
  // 順に呼ぶ（予約の表と射撃の回数のゲージは、準備で定義を読まない）
  const reserve = createGaugeReserve(base);
  const dot = createDotGauges({ ...base, ...reserve });
  const landing = createLandingGauge({ ...base, ...reserve });
  const cooldown = createCooldownTimers({ ...base, ...reserve });
  const damage = createDamageGauges({ ...base, ...reserve, ...landing });
  const shotCount = createShotCountGauges({ ...base, ...reserve, ...landing });
  /**
   * 時間で変わる速度の枠の、周期のゲージを予約する。周期で付く持続ダメージは、付けたときの分を発火の applyDelay 後に、tick の分を
   * 発火の tickDelay 後を起点にした刻みに予約する（どれも発火のフレームより前にはならない。このフレームの分は、このすぐ後の
   * takeReservedGauge が取る）。時間で変わるゲージ速度は、発火のフレームの速度で tick の分も決める
   */
  const reserveTimerGauges = (f: number): void => {
    damage.reserveTimedTimerGauges(f);
    dot.reserveTimerDots(f);
  };
  /** このフレームの射撃で溜まる効果のゲージを足す（倍率ダメージ → 射撃の回数 → 持続ダメージの順） */
  const addShotGauges = (gauge: number, f: number): number =>
    dot.addDotGauges(shotCount.addShotCountGauges(gauge, f), f);
  return {
    addAllyGauge: landing.addAllyGauge,
    allyGauges: landing.allyGauges,
    damageEffects: damage.damageEffects,
    addShotGauges,
    cooldownHoldUntil: cooldown.cooldownHoldUntil,
    cooldownTimerFires: cooldown.cooldownTimerFires,
    countCooldownTimers: cooldown.countCooldownTimers,
    skillFiredBefore: cooldown.skillFiredBefore,
    countCycles: shotCount.countCycles,
    countDamageHitGauges: damage.countDamageHitGauges,
    cycleGaugeHits: shotCount.cycleGaugeHits,
    dotGauges: dot.dotGauges,
    landingGauge: landing.landingGauge,
    reserveBurstUseDotTicks: dot.reserveBurstUseDotTicks,
    reserveGauge: reserve.reserveGauge,
    reserveTimerGauge: reserve.reserveTimerGauge,
    reserveTimerGauges,
    shotGauges: landing.shotGauges,
    takeReservedGauge: reserve.takeReservedGauge,
    timerGauges: reserve.timerGauges,
    trackDotBurstUse: dot.trackDotBurstUse,
  };
}

export type GaugeEffects = ReturnType<typeof createGaugeEffects>;
