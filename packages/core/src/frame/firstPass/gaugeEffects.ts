// 1 パス目（../firstPass.ts の runFirstPassOnce）のゲージを溜める効果（plan/design-split-first-pass.md 3.4 節）: 段の循環・倍率ダメージ・
// 射撃の回数・持続ダメージ・味方のゲージ・CT の時間・周期のゲージを追い、ゲージをフレームに予約して足す。
import type { FirstPassBase } from './base.ts';
import type { Gauge } from './gauge.ts';
import { createCooldownTimers } from './gaugeEffects/cooldown.ts';
import { createDamageGauges } from './gaugeEffects/damage.ts';
import { createDotGauges } from './gaugeEffects/dot.ts';
import { createLandingGauge } from './gaugeEffects/landing.ts';
import { createGaugeReserve } from './gaugeEffects/reserve.ts';
import { createShotCountGauges, type ShotGaugeTrackers } from './gaugeEffects/shotCount.ts';
import { createTimerGauges } from './gaugeEffects/timer.ts';

export { createShotGaugeTrackers, type ShotGaugeTrackers } from './gaugeEffects/shotCount.ts';

/** 自分の発動の出来事を読む口・ゲージを溜める効果の追跡を作り、そのゲージをフレームに予約して足す */
export function createGaugeEffects(base: FirstPassBase & Gauge & ShotGaugeTrackers) {
  // 準備の中の検査が投げる順を変えないため、作り手は持続ダメージ → 味方のゲージ → クールタイムの周期 → 周期のゲージ → 倍率ダメージの
  // 順に呼ぶ（予約の表と射撃の回数のゲージは、準備で定義を読まない）
  const withReserve = { ...base, ...createGaugeReserve(base) };
  const dot = createDotGauges(withReserve);
  const landing = createLandingGauge(withReserve);
  const cooldown = createCooldownTimers(withReserve);
  const timer = createTimerGauges(withReserve);
  const damage = createDamageGauges({ ...withReserve, ...landing });
  const shotCount = createShotCountGauges({ ...withReserve, ...landing });
  /** 時間で変わる速度の枠の周期のゲージと、周期で付く持続ダメージの、フレーム f の発火の分を予約する（この順） */
  const reserveTimerGauges = (f: number): void => {
    timer.reserveTimedTimerGauges(f);
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
    reserveGauge: withReserve.reserveGauge,
    reserveTimerGauge: withReserve.reserveTimerGauge,
    reserveTimerGauges,
    shotGauges: landing.shotGauges,
    takeReservedGauge: withReserve.takeReservedGauge,
    timerGauges: withReserve.timerGauges,
    trackDotBurstUse: dot.trackDotBurstUse,
  };
}

export type GaugeEffects = ReturnType<typeof createGaugeEffects>;
