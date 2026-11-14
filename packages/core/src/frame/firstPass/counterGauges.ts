// 1 パス目（../firstPass.ts の runFirstPassOnce）の、カウンタが上限に届いた時（{ counterFull }）のきっかけのヒットのゲージ
// （plan/design-mihara-bc-gauge.md 3 節。V-0761）: 倍率ダメージのヒット（gaugePerHit）・持続ダメージの付けた時（gaugeOnApply）と
// 刻み（gaugeOnTick）を、2 パス目（frame/plan.ts の planSkillHits）と同じ規則のフレームのゲージに予約する。
import { counterMax, type CounterId } from '../../skills/counters.ts';
import {
  effectHitFrames,
  perCountFrames,
  resolveDotEffects,
  type ResolvedDamageEffect,
} from '../../skills/burstDamage.ts';
import { resolveDotCancels, resolveDotStackUps } from '../../skills/resolve.ts';
import { createTriggerTracker, type FrameEvents, type TriggerTracker } from '../../skills/triggers.ts';
import { isCounterFullTrigger } from '../../skills/types.ts';
import type { NamedStateId } from '../../skills/states.ts';
import { groupDotsByState, latestTickFrame, latestTickIntervalFrames } from '../dot.ts';
import type { FirstPassResult } from '../firstPass.ts';
import type { FirstPassBase } from './base.ts';
import type { Gauge } from './gauge.ts';
import type { GaugeEffects } from './gaugeEffects.ts';

type CounterGaugeKind = FirstPassResult['counterGauges'][number]['kind'];

/** { counterFull } のきっかけの、ゲージを溜める効果 1 つ（倍率ダメージか、持続ダメージの付けた時） */
type CounterHitGauge = {
  slotIndex: number;
  counter: CounterId;
  kind: Exclude<CounterGaugeKind, 'tick'>;
  /** ヒットごとにゲージを溜めるか（付けた時のゲージの無い持続ダメージは、付けたフレームを刻みの基点にするだけ） */
  charges: boolean;
  /** 発火のフレームと数から、ヒット（付けた時）のフレームを出す */
  hitFrames: (fire: number, count: number) => number[];
  /** 付けたフレームを刻みの基点に足す持続ダメージのまとまり（刻みを追わないなら null） */
  ticks: DotTickGauge | null;
};

/**
 * 持続ダメージの刻みのゲージ（firstTick halfAfterLatest。frame/dot.ts の latestDotTicks と同じ規則）。基点は最後に付けたフレームで、
 * 基点から (k + 0.5) × 間隔の後に刻む。次に付けたフレームちょうどの刻みは出さず、消去のフレームより後の刻みは出さない
 */
type DotTickGauge = {
  slotIndex: number;
  intervalFrames: number;
  /** 予約した付けるフレーム（昇順。過ぎたものは基点にして外す） */
  applies: number[];
  anchor: number | null;
  k: number;
  cancels: TriggerTracker[];
  /** 敵のスタック量▲（frame/plan.ts の dotStackUps と同じく、同じ状態の付与として基点を付け直す。▲のヒットのゲージは溜めない） */
  ups: { tracker: TriggerTracker; enemyState: NamedStateId | undefined }[];
};

export function createCounterGauges({
  burstModel,
  damageEffects,
  frames,
  hitGaugeEnergy,
  lists,
  options,
  reserveGauge,
  slots,
}: FirstPassBase & Gauge & Pick<GaugeEffects, 'damageEffects' | 'reserveGauge'>) {
  const scheduleModel = options.burst ? burstModel : null;
  const hitGauges: CounterHitGauge[] = [];
  const tickGauges: DotTickGauge[] = [];
  const counterOf = (effect: ResolvedDamageEffect): CounterId | null =>
    isCounterFullTrigger(effect.trigger) ? effect.trigger.counterFull : null;
  damageEffects.forEach((effects, i) => {
    for (const effect of effects) {
      const counter = counterOf(effect);
      if (counter === null || effect.gaugePerHit === undefined) continue;
      hitGauges.push({
        slotIndex: i,
        counter,
        kind: 'attack',
        charges: true,
        hitFrames: (fire, count) => effectHitFrames(effect, fire, count, frames),
        ticks: null,
      });
    }
  });
  slots.forEach((slot, i) => {
    if (slot === null || slot.definition === null) return;
    const { definition, character, levels } = slot;
    for (const group of groupDotsByState(resolveDotEffects(definition, character, levels))) {
      const counted = group.filter((e) => counterOf(e) !== null);
      if (counted.length === 0) continue;
      const dot = group[0]!.dot!;
      // gaugeEffects.ts は { counterFull } の効果を含むまとまりを追わないので、ほかのきっかけの効果のゲージもここで見る
      if (dot.gaugeOnTick !== true && !group.some((e) => e.dot!.gaugeOnApply === true)) continue;
      if (counted.length !== group.length)
        throw new RangeError('a dot state with gauge mixes { counterFull } and other triggers (not implemented)');
      let ticks: DotTickGauge | null = null;
      if (dot.gaugeOnTick === true) {
        const state = dot.state;
        const intervalFrames = latestTickIntervalFrames(dot.intervalSeconds, dot.tickIntervalFrames);
        // 最初の刻みが基点より後のフレームでないと、フレームごとの判定（tick === f + 1）に掛からない
        if (latestTickFrame(0, 0, intervalFrames) < 1)
          throw new RangeError(`a dot with tick gauge needs a tick interval of 1 frame or more, got ${intervalFrames}`);
        ticks = {
          slotIndex: i,
          intervalFrames,
          applies: [],
          anchor: null,
          k: 0,
          cancels: resolveDotCancels(definition, character, levels)
            .filter((c) => state !== undefined && c.state === state)
            .map((c) => createTriggerTracker(c.trigger, i, scheduleModel)),
          ups: resolveDotStackUps(definition, character, levels)
            .filter((u) => state !== undefined && u.state === state)
            .map((u) => {
              if (Object.keys(u.condition).some((k) => k !== 'enemyState'))
                throw new RangeError('a stack up of a dot with tick gauge supports only the condition enemyState');
              return { tracker: createTriggerTracker(u.trigger, i, scheduleModel), enemyState: u.condition.enemyState };
            }),
        };
        tickGauges.push(ticks);
      }
      for (const effect of counted) {
        const step = { frames: effect.perCountIntervalFrames, delay: effect.dot!.applyDelayFrames };
        if (step.frames === undefined)
          throw new RangeError('a dot with { counterFull } needs perCount { counter } and perCountIntervalFrames');
        hitGauges.push({
          slotIndex: i,
          counter: counterOf(effect)!,
          kind: 'apply',
          charges: effect.dot!.gaugeOnApply === true,
          hitFrames: (fire, count) => perCountFrames(fire, count, step, frames),
          ticks,
        });
      }
    }
  });
  const counterGauges: FirstPassResult['counterGauges'] = [];
  const reserve = (slotIndex: number, kind: CounterGaugeKind, frame: number): void => {
    const energy = hitGaugeEnergy(slotIndex);
    counterGauges.push({ slotIndex, kind, frame, energy });
    reserveGauge(frame, energy);
  };
  /** 刻みの基点を at に付け直す（k は基点から数える） */
  const rebase = (t: DotTickGauge, at: number): void => {
    t.anchor = at;
    t.k = 0;
  };
  /** 出来事の列（手順 3）を毎フレーム要るか（消去・スタック量▲のきっかけを数える） */
  const trackCounterEvents = tickGauges.some((t) => t.cancels.length > 0 || t.ups.length > 0);
  /**
   * フレーム f の終わり（手順 3 の件の登録の後）に、f + 1 に発火する { counterFull } のヒットのゲージと、f + 1 の刻みのゲージを予約する。
   * ev は f の出来事（手順 3 を回さなかったフレームは null）
   */
  const countCounterGauges = (f: number, ev: FrameEvents | null): void => {
    const fire = f + 1;
    for (const g of hitGauges) {
      if (!lists.counterFullFiresAt(g.slotIndex, g.counter, fire)) continue;
      const hits = g.hitFrames(fire, counterMax(g.counter));
      if (g.charges) for (const at of hits) reserve(g.slotIndex, g.kind, at);
      if (g.ticks !== null) {
        g.ticks.applies.push(...hits);
        g.ticks.applies.sort((a, b) => a - b);
      }
    }
    for (const t of tickGauges) {
      while (t.applies.length > 0 && t.applies[0]! <= f) rebase(t, t.applies.shift()!);
      if (ev !== null) {
        for (const up of t.ups)
          if (up.tracker(ev) && (up.enemyState === undefined || lists.enemyStateAt(up.enemyState, f))) rebase(t, f);
        // 消去はそのフレームの判定の後に閉じるので、消去のフレームまでの刻みは出て、その後は次に付けるまで出ない
        let cancelled = false;
        for (const c of t.cancels) if (c(ev)) cancelled = true;
        if (cancelled) t.anchor = null;
      }
      if (t.anchor === null || fire >= frames) continue;
      const tick = latestTickFrame(t.anchor, t.k, t.intervalFrames);
      if (tick !== fire) continue;
      t.k += 1;
      if (t.applies[0] === fire) continue;
      reserve(t.slotIndex, 'tick', fire);
    }
  };
  return { countCounterGauges, counterGauges, trackCounterEvents };
}
