// 1 パス目のゲージを溜める効果（../gaugeEffects.ts の createGaugeEffects）のうち、ゲージを溜める持続ダメージ。
import { resolveDotEffects } from '../../../skills/burstDamage.ts';
import type { BurstActivation } from '../../../burst/schedule.ts';
import { isResolvedShotCount, isResolvedTimer } from '../../../skills/resolve.ts';
import { timerFramesOf } from '../../../skills/timeline.ts';
import { advanceShotCount, shotCountWeight } from '../../../skills/triggers.ts';
import { isCounterFullTrigger, type ShotCountKind } from '../../../skills/types.ts';
import { dotTickTracker, groupDotsByState, type DotTickTracker } from '../../dot.ts';
import { flightFramesAt, type FlightFrameSpan } from '../../landing.ts';
import type { FirstPassResult } from '../../firstPass.ts';
import type { FirstPassBase } from '../base.ts';
import type { Gauge } from '../gauge.ts';
import type { GaugeReserve } from './reserve.ts';

/** ゲージを溜める持続ダメージを追い、付けたときと tick のゲージを足すか予約する */
export function createDotGauges({
  flights,
  frames,
  hitGaugeEnergy,
  logs,
  pendingGauge,
  reserveGauge,
  shotEvents,
  slots,
}: FirstPassBase & Gauge & GaugeReserve) {
  // ゲージを溜める持続ダメージ（dot の gaugeOnApply・gaugeOnTick。plan/design-raven-s1.md 4 節）。射撃を数えて
  // 発火を追い、付けたときの分は発火のフレームに、tick の分は dotTickTracker が返した tick のフレームに予約する。
  // V-0113（10 節）: バースト使用時に付く効果（burstUse。クルミのハッキング）も同じまとまりの発火として、手順 3 の出来事で追う
  const dotGaugeTrackers: {
    slotIndex: number;
    effects: { count: ShotCountKind; every: number; n: number; onApply: boolean }[];
    /** 付けたときのゲージを発火の何フレーム後に足すか（0 は発火のフレーム。C-0181） */
    applyDelay: number;
    /** tick の刻みを発火の何フレーム後から数えるか（skills/types.ts の DotEffect.tickDelayFrames。0 は発火のフレーム） */
    tickDelay: number;
    onBurstUse: boolean;
    tracker: DotTickTracker;
    onTick: boolean;
    /** 自動攻撃のヒットの飛ぶ時間（plan/design-anis-star-gauge-timing.md 4 節。持続ダメージ・表に無いものは null） */
    flight: FlightFrameSpan[] | null;
  }[] = [];
  // 周期で付く持続ダメージのゲージ（V-0847。plan/design-rosanna-co.md 7 節）。発火は射撃に依らないので、発火のフレーム → 付けた
  // 持続ダメージの並び（同じまとまりは同じ追跡）を前もって作り、そのフレームの頭（reserveTimerDots）で付けたときと tick の分を予約する
  const timerDotFires = new Map<
    number,
    {
      slotIndex: number;
      onApply: boolean;
      applyDelay: number;
      tickDelay: number;
      tracker: DotTickTracker;
      onTick: boolean;
    }[]
  >();
  slots.forEach((slot, i) => {
    if (slot === null || slot.definition === null) return;
    for (const group of groupDotsByState(resolveDotEffects(slot.definition, slot.character, slot.levels))) {
      // { counterFull } のきっかけの dot のゲージは counterGauges.ts が追う（plan/design-mihara-bc-gauge.md 3 節）
      if (group.some((e) => isCounterFullTrigger(e.trigger))) continue;
      const dot = group[0]!.dot!;
      // tick のゲージは同じ状態でそろっている（groupDotsByState）。付けたときのゲージは効果ごと
      const onTick = dot.gaugeOnTick === true;
      if (!onTick && !group.some((e) => e.dot!.gaugeOnApply === true)) continue;
      if (group.some((e) => isResolvedTimer(e.trigger))) {
        const tracker = dotTickTracker(dot.intervalSeconds, dot.durationSeconds, frames, dot.firstTick);
        const applyDelay = Math.max(0, ...group.map((e) => e.dot!.gaugeOnApplyDelayFrames ?? 0));
        const tickDelay = dot.tickDelayFrames ?? 0;
        for (const e of group) {
          if (!isResolvedTimer(e.trigger) || e.trigger.cooldown === true) {
            throw new RangeError('a dot with gauge on a timer needs timers without cooldown in its whole group');
          }
          const onApply = e.dot!.gaugeOnApply === true;
          for (const f of timerFramesOf(e.trigger, frames)) {
            const fires = timerDotFires.get(f) ?? [];
            fires.push({ slotIndex: i, onApply, applyDelay, tickDelay, tracker, onTick });
            timerDotFires.set(f, fires);
          }
        }
        continue;
      }
      const effects: { count: ShotCountKind; every: number; n: number; onApply: boolean }[] = [];
      let onBurstUse = false;
      for (const e of group) {
        if (isResolvedShotCount(e.trigger)) {
          effects.push({ count: e.trigger.count, every: e.trigger.every, n: 0, onApply: e.dot!.gaugeOnApply === true });
        } else if (e.trigger === 'burstUse' && e.dot!.gaugeOnApply !== true) {
          onBurstUse = true;
        } else {
          throw new RangeError('a dot with gauge needs shot count triggers or burstUse (without the apply gauge)');
        }
      }
      if (!onBurstUse && effects.every((e) => e.count === 'fullChargeShot') && !logs[i]!.fullCharge) continue;
      dotGaugeTrackers.push({
        slotIndex: i,
        effects,
        applyDelay: Math.max(0, ...group.map((e) => e.dot!.gaugeOnApplyDelayFrames ?? 0)),
        tickDelay: dot.tickDelayFrames ?? 0,
        onBurstUse,
        tracker: dotTickTracker(dot.intervalSeconds, dot.durationSeconds, frames, dot.firstTick),
        onTick,
        flight: dot.autoAttack === true ? (flights[i]?.autoAttacks[group[0]!.source.skill] ?? null) : null,
      });
    }
  });
  const dotGauges: FirstPassResult['dotGauges'] = [];
  const trackDotBurstUse = dotGaugeTrackers.some((t) => t.onBurstUse);
  /** 持続ダメージがフレーム f に付いた。新しく決まった tick の分を、tick のフレームに予約する（どれも f より後） */
  const reserveDotTicks = (t: (typeof dotGaugeTrackers)[number], f: number): void => {
    const { ticks } = t.tracker.fire(f + t.tickDelay);
    if (!t.onTick) return;
    // 時間で変わるゲージ速度は、付いたフレームの速度で tick の分も決める
    const energy = hitGaugeEnergy(t.slotIndex);
    for (const tick of ticks) {
      if (tick <= f) throw new RangeError(`dot gauge tick at ${tick} is not after the fire at ${f}`);
      // 自動攻撃のヒットは、刻みのフレーム + 飛ぶ時間に着く（C-0504。ダメージの tick のフレームは変えない）
      const at = tick + flightFramesAt(t.flight, tick);
      pendingGauge.set(at, (pendingGauge.get(at) ?? 0) + energy);
      dotGauges.push({ slotIndex: t.slotIndex, kind: 'tick', frame: at, energy });
    }
  };
  /**
   * ゲージを溜める持続ダメージ。この射撃で付いたら、付けたときの分はこのフレームのゲージに足し、
   * 新しく決まった tick の分は tick のフレームに予約する（どれもこのフレームより後。resolveDotEffects が形を限っている）
   */
  const addDotGauges = (gauge: number, f: number): number => {
    for (const t of dotGaugeTrackers) {
      const shot = shotEvents[t.slotIndex];
      if (shot === null || shot === undefined) continue;
      let fired = false;
      let apply = false;
      for (const e of t.effects) {
        const counted = advanceShotCount(e.n, shotCountWeight(e.count, shot), e.every);
        e.n = counted.count;
        if (!counted.fired) continue;
        fired = true;
        if (e.onApply) apply = true;
      }
      if (!fired) continue;
      if (apply) {
        const energy = hitGaugeEnergy(t.slotIndex);
        // 付けたのは撃った 6f 後（C-0181。plan/design-shot-count-trigger-frame.md 6.6 節）。
        // モデルの射撃のフレームは撃ったフレーム（C-0661）なので、その applyDelay 後のゲージに足す
        if (t.applyDelay === 0) {
          gauge += energy;
          dotGauges.push({ slotIndex: t.slotIndex, kind: 'apply', frame: f, energy });
        } else if (f + t.applyDelay < frames) {
          pendingGauge.set(f + t.applyDelay, (pendingGauge.get(f + t.applyDelay) ?? 0) + energy);
          dotGauges.push({ slotIndex: t.slotIndex, kind: 'apply', frame: f + t.applyDelay, energy });
        }
      }
      reserveDotTicks(t, f);
    }
    return gauge;
  };
  /**
   * 周期で付く持続ダメージの、フレーム f の発火の分を予約する（../gaugeEffects.ts の reserveTimerGauges）。付けたときの分を発火の
   * applyDelay 後に、tick の分を発火の tickDelay 後を起点にした刻みに予約する（どれも発火のフレームより前にはならない。このフレームの
   * 分は、このすぐ後の takeReservedGauge が取る）。時間で変わるゲージ速度は、発火のフレームの速度で tick の分も決める
   */
  const reserveTimerDots = (f: number): void => {
    for (const t of timerDotFires.get(f) ?? []) {
      const energy = hitGaugeEnergy(t.slotIndex);
      if (t.onApply && f + t.applyDelay < frames) {
        reserveGauge(f + t.applyDelay, energy);
        dotGauges.push({ slotIndex: t.slotIndex, kind: 'apply', frame: f + t.applyDelay, energy });
      }
      const { ticks } = t.tracker.fire(f + t.tickDelay);
      if (!t.onTick) continue;
      for (const tick of ticks) {
        if (tick >= frames) continue;
        reserveGauge(tick, energy);
        dotGauges.push({ slotIndex: t.slotIndex, kind: 'tick', frame: tick, energy });
      }
    }
  };
  const reserveBurstUseDotTicks = (f: number, burstEffects: readonly BurstActivation[]): void => {
    // V-0113: バースト使用時に付く持続ダメージ（クルミのハッキング）。付け直しと同じで、延びた tick のゲージを予約する
    // （burstUse のトリガーの判定と同じく、このフレームの効果の発火 burstEffects で見る）
    for (const t of dotGaugeTrackers) {
      if (t.onBurstUse && burstEffects.some((a) => a.slotIndex === t.slotIndex)) reserveDotTicks(t, f);
    }
  };
  return { addDotGauges, dotGauges, reserveBurstUseDotTicks, reserveTimerDots, trackDotBurstUse };
}
