// 1 パス目のゲージを溜める効果（../gaugeEffects.ts の createGaugeEffects）のうち、周期のゲージ（burstGaugeHit）と、倍率ダメージの
// ヒットごとのゲージ（gaugePerHit）。
import {
  damageHitFramesOf,
  effectHitFrames,
  resolveTimerGauges,
  type ResolvedDamageEffect,
  resolveDamageEffects,
} from '../../../skills/burstDamage.ts';
import { isResolvedShotCount, isResolvedTimer } from '../../../skills/resolve.ts';
import { shortenedTimer, timerFramesOf } from '../../../skills/timeline.ts';
import { advanceShotCount, type ShotCountEveryAt, shotCountWeight } from '../../../skills/triggers.ts';
import {
  enemyStateHolds,
  enemyStateOf,
  type EnemyStateCheck,
  isSummonAttackTrigger,
  type ShotCountKind,
} from '../../../skills/types.ts';
import type { FirstPassBase } from '../base.ts';
import type { Gauge } from '../gauge.ts';
import type { LandingGauge } from './landing.ts';
import type { GaugeReserve } from './reserve.ts';

/** 周期のゲージと、倍率ダメージのヒットごとのゲージを追って予約する */
export function createDamageGauges({
  frames,
  hitGaugeEnergy,
  landingGauge,
  lists,
  logs,
  reserveTimerGauge,
  shotEvents,
  slots,
  timedGauge,
}: FirstPassBase & Gauge & GaugeReserve & LandingGauge) {
  // 周期のゲージ（burstGaugeHit）。射撃に依らないので、発火のフレームにループの前に予約する。
  // delayFrames があれば発火の後のヒットのフレームに足し、戦闘の終わりを越えるものは足さない（C-0453。plan/design-timer-ceil.md 7 節）
  // 時間で変わるゲージ速度の枠の周期のゲージは、発火のフレームの頭でその速度で予約する（発火のフレーム → 枠と遅れ）
  const timedTimerGauges = new Map<number, { slotIndex: number; delayFrames: number }[]>();
  slots.forEach((slot, i) => {
    if (slot === null || slot.definition === null) return;
    for (const { delayFrames, ...timer } of resolveTimerGauges(slot.definition)) {
      // クールタイムの印のある周期は、ループの中で発火を追って予約する（countCooldownTimers）
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
  // V-0545（plan/design-new-chars-1029.md 11.2 節の b）: 周期の倍率ダメージのヒットごとのゲージ（gaugePerHit）。発火をフレームの順に
  // 追い（periodShorten の短縮は、そのフレームまでに登録した自分の状態で決める。2 パス目の shortenedTimerFrames と同じ規則）、
  // N ヒットのフレームのゲージに予約する（delayFrames は 1 以上なので、どのヒットも発火より後のフレーム）
  const damageTimerGauges: { slotIndex: number; effect: ResolvedDamageEffect; fires: (f: number) => boolean }[] = [];
  // 射撃の回数のきっかけの倍率ダメージのヒットごとのゲージ
  // （gaugePerHit。オートファイア。plan/design-skill-stage14.md 2.5 節。C-0426）。射撃を数えて発火を追い、
  // ヒットのフレーム（perCount { state } の数だけ 1 つずつ出すヒットは、発火の
  // フレームより前に付いたスタック数。2 パス目の planSkillHits と同じ見え方）のゲージに予約する（delayFrames は 1 以上なので、どのヒットも
  // 発火より後のフレーム）。射撃ごとの倍率ダメージのゲージと同じく発のゲージの記録（shotGauges）に残し、味方のゲージの回数にも数える
  const shotDamageGauges: {
    slotIndex: number;
    effect: ResolvedDamageEffect;
    count: ShotCountKind;
    every: number;
    /**
     * V-0692（ラピ：レッドフードの粘着榴弾の付着。C-0991）: 回数の間隔の変更（cycleEvery の shotCounts）の窓の中の間隔。射撃の止まり
     * （../firstPass.ts の shotPauseTrackers）と同じく、窓の中は通算の回数が窓の間隔の倍数に届いた発で発火する（C-0727）
     */
    everyAt: ShotCountEveryAt | undefined;
    n: number;
    /** エレグの S1（C-0773）: 条件 enemyState（発火のフレームに敵がその状態なら予約する） */
    enemyState?: EnemyStateCheck;
  }[] = [];
  /** 枠ごとの倍率ダメージ（ヒットごとのゲージ・蓄積爆破・召喚の攻撃が読む。枠ごとに 1 回だけ解く） */
  const damageEffects = slots.map((slot) =>
    slot === null || slot.definition === null ? [] : resolveDamageEffects(slot.definition, slot.character, slot.levels),
  );
  damageEffects.forEach((effects, i) => {
    for (const effect of effects) {
      if (effect.gaugePerHit === undefined || isSummonAttackTrigger(effect.trigger)) continue;
      const { trigger } = effect;
      if (isResolvedTimer(trigger)) {
        // periodShorten の名前の無い窓（window）は gaugePerHit と組まない（読み込みで落とす）ので、鍵は状態だけ
        const shorten = effect.periodShorten;
        const state = shorten?.state;
        const shortened = (frame: number) => state !== undefined && lists.selfStateAt(i, state, frame);
        const fires = shortenedTimer(trigger, shorten?.seconds ?? 0, frames, shortened);
        damageTimerGauges.push({ slotIndex: i, effect, fires });
      } else if (isResolvedShotCount(trigger)) {
        if (trigger.count === 'fullChargeShot' && !logs[i]!.fullCharge) continue;
        const enemyState = enemyStateOf(effect.condition);
        shotDamageGauges.push({
          slotIndex: i,
          effect,
          count: trigger.count,
          every: trigger.every,
          everyAt: lists.shotCountEveryOf(i, effect.source.skill),
          n: 0,
          ...(enemyState === undefined ? {} : { enemyState }),
        });
      }
    }
  });
  const countDamageHitGauges = (f: number): void => {
    for (const t of damageTimerGauges) {
      if (!t.fires(f)) continue;
      const energy = hitGaugeEnergy(t.slotIndex) * t.effect.gaugePerHit!;
      for (const at of damageHitFramesOf(t.effect, f, frames)) reserveTimerGauge(t.slotIndex, f, at, energy);
    }
    for (const t of shotDamageGauges) {
      const shot = shotEvents[t.slotIndex];
      if (shot === null || shot === undefined) continue;
      const counted = advanceShotCount(t.n, shotCountWeight(t.count, shot), t.everyAt?.(f) ?? t.every);
      t.n = counted.count;
      if (!counted.fired) continue;
      if (!enemyStateHolds(t.enemyState, f, lists.enemyStateAt)) continue;
      const per = t.effect.perCount;
      const count = per !== undefined && 'state' in per ? lists.selfStackCountAt(t.slotIndex, per.state, f) : undefined;
      const energy = hitGaugeEnergy(t.slotIndex) * t.effect.gaugePerHit!;
      for (const hit of effectHitFrames(t.effect, f, count, frames)) landingGauge(t.slotIndex, hit, f, energy, 1);
    }
  };
  /** 時間で変わる速度の枠の、フレーム f に発火する周期のゲージを予約する（../gaugeEffects.ts の reserveTimerGauges） */
  const reserveTimedTimerGauges = (f: number): void => {
    for (const t of timedTimerGauges.get(f) ?? []) {
      reserveTimerGauge(t.slotIndex, f, f + t.delayFrames, hitGaugeEnergy(t.slotIndex));
    }
  };
  return { countDamageHitGauges, damageEffects, reserveTimedTimerGauges };
}
