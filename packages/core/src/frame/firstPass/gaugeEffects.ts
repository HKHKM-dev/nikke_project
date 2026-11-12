// 1 パス目（../firstPass.ts の runFirstPassOnce）のゲージを溜める効果（plan/design-split-first-pass.md 3.4 節）: 段の循環・倍率ダメージ・
// 射撃の回数・持続ダメージ・味方のゲージ・CT の時間・周期のゲージを追い、ゲージをフレームに予約して足す。
import { burstDelaysOf } from '../../burst/landing.ts';
import { gameSecondsToFirstFrame } from '../../time.ts';
import { resolveCycleEvery, resolveCycles } from '../../skills/cycles.ts';
import {
  damageHitFramesOf,
  effectHitFrames,
  resolveDamageGauges,
  resolveAllyGaugeAdd,
  resolveDotEffects,
  resolveShotGauges,
  resolveTimerGauges,
  type ResolvedDamageEffect,
  resolveDamageEffects,
} from '../../skills/burstDamage.ts';
import { type BurstActivation } from '../../burst/schedule.ts';
import { isResolvedShotCount, isResolvedTimer, resolveSkillCooldownDowns } from '../../skills/resolve.ts';
import { cooldownTimer, shortenedTimer, timerFramesOf } from '../../skills/timeline.ts';
import { advanceShotCount, type ShotCountEveryAt, shotCountWeight } from '../../skills/triggers.ts';
import { isSummonAttackTrigger, isTimerTrigger, SKILL_SLOTS, type ShotCountKind } from '../../skills/types.ts';
import { dotTickTracker, groupDotsByState, type DotTickTracker } from '../dot.ts';
import { flightFramesAt, type FlightFrameSpan } from '../landing.ts';
import type { SkillSlot } from '../../types.ts';
import type { NamedStateId } from '../../skills/states.ts';
import type { FirstPassResult } from '../firstPass.ts';
import type { FirstPassBase } from './base.ts';
import type { Gauge } from './gauge.ts';

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
  energy: number;
  count: number;
  step: number;
  /** fullChargeShot の循環は部分チャージの発を数えない */
  fullChargeOnly: boolean;
};

/** 射撃の回数で溜まるゲージ（段の循環・倍率ダメージのゲージ・射撃の回数のゲージ）の追跡を作る */
export function createShotGaugeTrackers({ gaugeSpeed, logs, slots }: FirstPassBase & Gauge) {
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
        energy: slot.character.shot.targetBurstEnergyPerShot * (1 + gaugeSpeed[i]!),
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
    energy: number;
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
        energy: slot.character.shot.targetBurstEnergyPerShot * (1 + gaugeSpeed[i]!),
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
    energy: number;
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
        energy: slot.character.shot.targetBurstEnergyPerShot * (1 + gaugeSpeed[i]!),
        n: 0,
        delayFrames: t.delayFrames ?? 0,
      });
    }
  });
  return { cycleTrackers, damageGaugeTrackers, shotGaugeTrackers };
}

export type ShotGaugeTrackers = ReturnType<typeof createShotGaugeTrackers>;

/** ゲージを溜める効果を追い、そのゲージをフレームに予約して足す */
export function createGaugeEffects({
  cycleTrackers,
  damageGaugeTrackers,
  shotGaugeTrackers,
  hitGaugeEnergy,
  flights,
  frames,
  gaugeScale,
  gaugeSpeed,
  lists,
  logs,
  shotEvents,
  shotFlightAt,
  slots,
  targetEnergies,
  targetEnergyNow,
  timedGauge,
}: FirstPassBase & Gauge & ShotGaugeTrackers) {
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
    energy: number;
    /** 自動攻撃のヒットの飛ぶ時間（plan/design-anis-star-gauge-timing.md 4 節。持続ダメージ・表に無いものは null） */
    flight: FlightFrameSpan[] | null;
  }[] = [];
  slots.forEach((slot, i) => {
    if (slot === null || slot.definition === null) return;
    for (const group of groupDotsByState(resolveDotEffects(slot.definition, slot.character, slot.levels))) {
      const dot = group[0]!.dot!;
      // tick のゲージは同じ状態でそろっている（groupDotsByState）。付けたときのゲージは効果ごと
      const onTick = dot.gaugeOnTick === true;
      if (!onTick && !group.some((e) => e.dot!.gaugeOnApply === true)) continue;
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
        energy: slot.character.shot.targetBurstEnergyPerShot * (1 + gaugeSpeed[i]!),
        flight: dot.autoAttack === true ? (flights[i]?.autoAttacks[group[0]!.source.skill] ?? null) : null,
      });
    }
  });
  const dotGauges: FirstPassResult['dotGauges'] = [];
  const pendingGauge = new Map<number, number>();
  const shotGauges: FirstPassResult['shotGauges'] = [];
  const allyGauges: FirstPassResult['allyGauges'] = [];
  // allyGaugeAdd を持つ枠（plan/design-anis-star-ally-gauge.md 3 節）は、ほかの枠のゲージ 1 回（弾のヒット・射撃ごとの倍率ダメージの
  // ゲージのヒット）ごとに、自分の 1 発のゲージ × 割合を足す。1 発のゲージは自分の最初の発の着弾のフレームから
  // targetBurstEnergyPerShot、その前は burstEnergyPerShot（C-0246・C-0620）。回数は着くフレームに数え、そのフレームの射撃の後に、
  // そのフレームの量で足す（着弾と同じフレームの回は切り替わった後の量。境のフレームは確かめていない）。持つ枠が 2 つ以上なら、
  // 持つ枠ごとの量を足し合わせる（確かめていない）。while の状態があれば、持つ枠にその状態が付いているフレーム（selfStateAt。
  // そのフレームより前に付いた件）に着いた回にだけ足す（plan/design-grave-heat-gauge.md 2.1・2.2 節）
  const allyAdders = slots.flatMap((slot, i) => {
    if (slot === null || slot.definition === null) return [];
    const add = resolveAllyGaugeAdd(slot.definition, slot.character, slot.levels);
    if (add === null || add.ratio === 0) return [];
    const shot = slot.character.shot;
    return [
      {
        slotIndex: i,
        before: shot.burstEnergyPerShot * add.ratio,
        after: shot.targetBurstEnergyPerShot * add.ratio,
        whileState: add.whileState,
        /** 持つ枠の最初の発の着弾のフレーム（まだ撃っていなければ null） */
        landing: null as number | null,
      },
    ];
  });
  /** フレーム → 枠ごとの、そのフレームに着くゲージの回数（期待値） */
  const pendingAllyHits = new Map<number, number[]>();
  const reserveAllyHits = (i: number, at: number, hits: number): void => {
    if (allyAdders.length === 0) return;
    for (const a of allyAdders) if (a.slotIndex === i && (a.landing === null || at < a.landing)) a.landing = at;
    if (hits <= 0 || at >= frames) return;
    let row = pendingAllyHits.get(at);
    if (row === undefined) pendingAllyHits.set(at, (row = slots.map(() => 0)));
    row[i]! += hits;
  };
  /** 枠 i の発のゲージを、着弾のフレーム（f + 飛ぶ時間）に入れる。f のフレームならこのフレームのゲージに返す。hits はその回数（期待値） */
  const landingGauge = (i: number, at: number, f: number, energy: number, hits: number): number => {
    reserveAllyHits(i, at, hits);
    if (energy > 0 && at < frames) shotGauges.push({ slotIndex: i, shotFrame: f, frame: at, energy });
    if (at === f) return energy;
    if (at < frames) pendingGauge.set(at, (pendingGauge.get(at) ?? 0) + energy);
    return 0;
  };
  const trackDotBurstUse = dotGaugeTrackers.some((t) => t.onBurstUse);
  /** 持続ダメージがフレーム f に付いた。新しく決まった tick の分を、tick のフレームに予約する（どれも f より後） */
  const reserveDotTicks = (t: (typeof dotGaugeTrackers)[number], f: number): void => {
    const { ticks } = t.tracker.fire(f + t.tickDelay);
    if (!t.onTick) return;
    // 時間で変わるゲージ速度は、付いたフレームの速度で tick の分も決める
    const energy = targetEnergyNow(t.slotIndex, t.energy);
    for (const tick of ticks) {
      if (tick <= f) throw new RangeError(`dot gauge tick at ${tick} is not after the fire at ${f}`);
      // 自動攻撃のヒットは、刻みのフレーム + 飛ぶ時間に着く（C-0504。ダメージの tick のフレームは変えない）
      const at = tick + flightFramesAt(t.flight, tick);
      pendingGauge.set(at, (pendingGauge.get(at) ?? 0) + energy);
      dotGauges.push({ slotIndex: t.slotIndex, kind: 'tick', frame: at, energy });
    }
  };
  // クールタイムの印のある周期は、枠 × スロットごとに発火をフレームの順に追う
  // （cooldownTimer。plan/design-arcana-magician.md 2.1 節）。縮めるのは、
  // 編成のどれかの定義の状態の中身の「スキル N クールタイム X%▼」で、そのフレームまでに登録した状態の件で決める。
  // 縮める状態が無ければ静的な周期と同じ列になる。2 パス目とゲージはこの記録だけを読む
  const cooldownDowns = slots.flatMap((slot) =>
    slot === null || slot.definition === null
      ? []
      : resolveSkillCooldownDowns(slot.definition, slot.character, slot.levels),
  );
  const cooldownTrackers: {
    slotIndex: number;
    skill: SkillSlot;
    /** そのスロットを縮める状態と、その縮めた周期（フレーム） */
    downs: { state: NamedStateId; short: number }[];
    tick: (f: number, started: number | undefined, held: () => number | undefined) => boolean;
    /** 同じスロットの印のある burstGaugeHit の遅れ（ループの前の予約の代わりに、発火で予約する） */
    gaugeDelays: number[];
    fires: number[];
  }[] = [];
  slots.forEach((slot, slotIndex) => {
    if (slot === null || slot.definition === null) return;
    for (const skill of SKILL_SLOTS) {
      const marked = slot.definition.skills[skill].effects.filter(
        (e) => 'trigger' in e && isTimerTrigger(e.trigger) && e.trigger.cooldown === true,
      );
      const first = marked[0];
      if (first === undefined || !('trigger' in first) || !isTimerTrigger(first.trigger)) continue;
      const { everySeconds } = first.trigger;
      cooldownTrackers.push({
        slotIndex,
        skill,
        downs: cooldownDowns
          .filter((d) => d.slot === skill)
          .map((d) => ({ state: d.state, short: gameSecondsToFirstFrame(everySeconds * (1 - d.percent / 100)) })),
        tick: cooldownTimer(gameSecondsToFirstFrame(everySeconds)),
        gaugeDelays: marked.flatMap((e) => (e.kind === 'burstGaugeHit' ? [e.delayFrames!] : [])),
        fires: [],
      });
    }
  });
  // 周期のゲージ（burstGaugeHit）。射撃に依らないので、発火のフレームにループの前に予約する。
  // delayFrames があれば発火の後のヒットのフレームに足し、戦闘の終わりを越えるものは足さない（C-0453。plan/design-timer-ceil.md 7 節）
  // 時間で変わるゲージ速度の枠の周期のゲージは、発火のフレームの頭でその速度で予約する（発火のフレーム → 枠と遅れ）
  const timedTimerGauges = new Map<number, { slotIndex: number; delayFrames: number }[]>();
  const timerGauges: FirstPassResult['timerGauges'] = [];
  /** 周期のゲージを、発火 fireFrame の後のフレーム at のゲージに予約する（timerGauges にも残す） */
  const reserveTimerGauge = (slotIndex: number, fireFrame: number, at: number, energy: number): void => {
    timerGauges.push({ slotIndex, fireFrame, frame: at, energy });
    pendingGauge.set(at, (pendingGauge.get(at) ?? 0) + energy);
  };
  slots.forEach((slot, i) => {
    if (slot === null || slot.definition === null) return;
    const energy = slot.character.shot.targetBurstEnergyPerShot * (1 + gaugeSpeed[i]!);
    for (const { delayFrames, ...timer } of resolveTimerGauges(slot.definition)) {
      // クールタイムの印のある周期は、ループの中で発火を追って予約する（countCooldownTimers）
      if (timer.cooldown === true) continue;
      for (const fire of timerFramesOf(timer, frames)) {
        const at = fire + delayFrames;
        if (at >= frames) continue;
        if (timedGauge[i])
          timedTimerGauges.set(fire, [...(timedTimerGauges.get(fire) ?? []), { slotIndex: i, delayFrames }]);
        else reserveTimerGauge(i, fire, at, energy);
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
    enemyState?: NamedStateId;
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
        const enemyState = effect.condition?.enemyState;
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
  /**
   * フレーム f の終わりに、印のある周期の発火を決める（f に付いた縮める状態の件も見る）。発火したら記録し、その枠の
   * 印のある burstGaugeHit のゲージを遅れの後のフレームに予約する（ループの前の予約と同じ量）
   */
  const countCooldownTimers = (f: number): void => {
    for (const t of cooldownTrackers) {
      const i = t.slotIndex;
      const started = t.downs.find((d) => lists.stateStartedAt(i, d.state, f))?.short;
      const held = (): number | undefined => {
        const on = t.downs.filter((d) => lists.stateHeldAt(i, d.state, f));
        // 同じスロットを縮める状態が 2 つ同時に効く時の重ね方は確かめていない（使い手がいない。設計書 2.1 節）
        if (on.length > 1)
          throw new RangeError(`two or more states shorten the cooldown of ${t.skill} at once (not implemented)`);
        return on[0]?.short;
      };
      if (!t.tick(f, started, held)) continue;
      t.fires.push(f);
      const energy = hitGaugeEnergy(i);
      for (const d of t.gaugeDelays) if (f + d < frames) reserveTimerGauge(i, f, f + d, energy);
    }
  };
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
      if (t.enemyState !== undefined && !lists.enemyStateAt(t.enemyState, f)) continue;
      const per = t.effect.perCount;
      const count = per !== undefined && 'state' in per ? lists.selfStackCountAt(t.slotIndex, per.state, f) : undefined;
      const energy = hitGaugeEnergy(t.slotIndex) * t.effect.gaugePerHit!;
      for (const hit of effectHitFrames(t.effect, f, count, frames)) landingGauge(t.slotIndex, hit, f, energy, 1);
    }
  };
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
      const energy = targetEnergyNow(t.slotIndex, t.energy);
      for (const d of t.gaugeHits[t.step]!) {
        const at = f + d;
        cycleGaugeHits.push({ slotIndex: t.slotIndex, shotFrame: f, frame: at, energy });
        if (at < frames) pendingGauge.set(at, (pendingGauge.get(at) ?? 0) + energy);
      }
      t.step = (t.step + 1) % t.gaugeHits.length;
    }
  };
  /** 時間で変わる速度の枠の、周期のゲージを予約する */
  const reserveTimerGauges = (f: number): void => {
    for (const t of timedTimerGauges.get(f) ?? []) {
      reserveTimerGauge(t.slotIndex, f, f + t.delayFrames, targetEnergies[t.slotIndex]! * gaugeScale[t.slotIndex]!);
    }
  };
  /** 前のフレームまでに予約した、このフレームのゲージ（段のヒットのゲージなど。V-0030） */
  const takeReservedGauge = (f: number): number => {
    const gauge = pendingGauge.get(f) ?? 0;
    pendingGauge.delete(f);
    return gauge;
  };
  /** このフレームの射撃で溜まる効果のゲージを足す（倍率ダメージ → 射撃の回数 → 持続ダメージの順） */
  const addShotGauges = (gauge: number, f: number): number => {
    // ゲージを溜める倍率ダメージ。遅れ 0（V-0035 のモダニア。発と同じフレームに当たる）はこのフレームのゲージに足す
    for (const t of damageGaugeTrackers) {
      const shot = shotEvents[t.slotIndex];
      if (shot === null || shot === undefined) continue;
      const counted = advanceShotCount(t.n, shotCountWeight(t.count, shot), t.every);
      t.n = counted.count;
      if (!counted.fired) continue;
      // 射撃ごとの倍率ダメージのヒット（S1 の追加ダメージなど）も、発の着弾から数える（飛ぶ時間。plan/design-anis-star-gauge-timing.md 3.1 節）
      const flight = shotFlightAt(t.slotIndex, f);
      const energy = targetEnergyNow(t.slotIndex, t.energy);
      for (const d of t.gaugeHits) gauge += landingGauge(t.slotIndex, f + flight + d, f, energy, 1);
    }
    // 射撃の回数でゲージだけを溜める効果。発火した射撃のフレームのゲージに足す（遅れがあれば、そのフレームに予約する）
    for (const t of shotGaugeTrackers) {
      const shot = shotEvents[t.slotIndex];
      if (shot === null || shot === undefined) continue;
      const counted = advanceShotCount(t.n, shotCountWeight(t.count, shot), t.every);
      t.n = counted.count;
      if (!counted.fired) continue;
      const energy = targetEnergyNow(t.slotIndex, t.energy);
      if (t.delayFrames === 0) gauge += energy;
      else if (f + t.delayFrames < frames) {
        pendingGauge.set(f + t.delayFrames, (pendingGauge.get(f + t.delayFrames) ?? 0) + energy);
      }
    }
    // ゲージを溜める持続ダメージ。この射撃で付いたら、付けたときの分はこのフレームのゲージに足し、
    // 新しく決まった tick の分は tick のフレームに予約する（どれもこのフレームより後。resolveDotEffects が形を限っている）
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
        const energy = targetEnergyNow(t.slotIndex, t.energy);
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
  const addAllyGauge = (gauge: number, f: number): number => {
    // 味方のゲージ（allyGaugeAdd）: このフレームに着いたほかの枠のゲージの回数に、持つ枠ごとのこのフレームの量を足す
    const row = pendingAllyHits.get(f);
    if (row === undefined) return gauge;
    pendingAllyHits.delete(f);
    for (const a of allyAdders) {
      if (a.whileState !== null && !lists.selfStateAt(a.slotIndex, a.whileState, f)) continue;
      const amount = a.landing !== null && f >= a.landing ? a.after : a.before;
      row.forEach((hits, i) => {
        if (i === a.slotIndex || hits === 0) return;
        gauge += hits * amount;
        allyGauges.push({ slotIndex: i, holderIndex: a.slotIndex, frame: f, energy: hits * amount });
      });
    }
    return gauge;
  };
  const reserveBurstUseDotTicks = (f: number, burstEffects: readonly BurstActivation[]): void => {
    // V-0113: バースト使用時に付く持続ダメージ（クルミのハッキング）。付け直しと同じで、延びた tick のゲージを予約する
    // （burstUse のトリガーの判定と同じく、このフレームの効果の発火 burstEffects で見る）
    for (const t of dotGaugeTrackers) {
      if (t.onBurstUse && burstEffects.some((a) => a.slotIndex === t.slotIndex)) reserveDotTicks(t, f);
    }
  };
  return {
    addAllyGauge,
    allyGauges,
    damageEffects,
    addShotGauges,
    cooldownTrackers,
    countCooldownTimers,
    countCycles,
    countDamageHitGauges,
    cycleGaugeHits,
    dotGauges,
    landingGauge,
    reserveBurstUseDotTicks,
    reserveTimerGauge,
    reserveTimerGauges,
    shotGauges,
    takeReservedGauge,
    timerGauges,
    trackDotBurstUse,
  };
}

export type GaugeEffects = ReturnType<typeof createGaugeEffects>;
