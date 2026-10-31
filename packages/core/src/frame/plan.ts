// 1 パス目（calc と sim で共通）。射撃の列 → 時刻表 → バフの区間 → 倍率ダメージの発動。
// Stage 8: 1 パス目を planTeamRun にまとめ、sim と calc が同じものを使う。
// 射撃の回数トリガーの窓と倍率ダメージ（damage）の発動は sim と厳密一致し、calc が期待値で置くのは通常攻撃のトリガー数だけ。
// Stage 10: 射撃に効くバフと CT 短縮で射撃の列と時刻表が循環するので、1 パス目の射撃の列と時刻表は frame/firstPass.ts の
// フレームループで作る。バフの区間と倍率ダメージは Stage 8 のまま、確定した射撃の列と時刻表から作る。
// Stage 16（plan/design-stage16.md 2 節）: team.ts から分けた。
// 持ち主ごとの一覧編（plan/design-holder-effects.md 2.7 節）: バフの区間は、1 パス目の件の一覧の履歴から作る
// （2 パス目の作り直しはやめた）。件と記録は履歴（TeamPlan.history）を読む。
import { burstDelaysOf, isSplit, sameActivationBuffsOnHit } from '../burst/landing.ts';
import { planFixedCycle } from '../burst/fixedCycle.ts';
import { battleSecondsToFrames } from '../time.ts';
import { burstCandidateOf, planDynamicSchedule, type DynamicScheduleOptions } from '../burst/dynamic.ts';
import {
  effectFrameOf,
  hitFramesOf,
  isInFullBurst,
  type BurstSchedule,
  type BurstScheduleModel,
} from '../burst/schedule.ts';
import { computeTriggerDamage, type EnemyInput } from '../damage.ts';
import {
  SKILL_HIT_FULL_BURST_BONUS,
  computeSkillHit,
  damageHitFramesOf,
  effectHitFrames,
  perCountFrames,
  resolveDamageEffects,
  resolveDotEffects,
  resolvePerShotDamage,
  type ResolvedDamageEffect,
  type ResolvedSkillDamage,
  type SkillHitResult,
  type SustainedDamagePlacement,
} from '../skills/burstDamage.ts';
import { cycleFires, cycleShotFrames, resolveCycles } from '../skills/cycles.ts';
import {
  MAX_SKILL_LEVELS,
  isResolvedApplied,
  isResolvedTimer,
  isResolvedEventCount,
  isResolvedShotCount,
  resolveDotCancels,
  resolveDotStackUps,
  type ResolvedTrigger,
} from '../skills/resolve.ts';
import {
  EMPTY_BUFF_STATE,
  appliedFrames,
  timerDamageFrames,
  resolvePassiveStates,
  segmentIndexAt,
  triggerFrames,
  type BuffTimeline,
  type SlotBuffState,
} from '../skills/timeline.ts';
import {
  ENEMY,
  buffTimelineOf,
  counterEffectiveFrom,
  counterFullFrames,
  itemsOf,
  stacksHold,
  valuePiecesOf,
  type HolderHistory,
  type ValuePiece,
} from '../skills/holders.ts';
import { applyResolvedEffect, type AttackRounding, type BuffTotals } from '../skills/buffs.ts';
import type { CounterId } from '../skills/counters.ts';
import { stateMatches, type NamedStateId } from '../skills/states.ts';
import { everyAtOf, type ShotCountEveryAt } from '../skills/triggers.ts';
import {
  isCounterFullTrigger,
  isEnemyHeldStat,
  isStateStat,
  splitsPerCount,
  staticStatesOf,
  type EffectCondition,
  type SelfStateCondition,
} from '../skills/types.ts';
import { applyCompositionToTeam } from '../skills/composition.ts';
import { applyTreasureToTeam } from '../skills/treasure.ts';
import {
  toTimelineSlots,
  validateControlledSlot,
  validateObstacleBreaks,
  validatePelletHits,
  validateTeamSlots,
  type TeamInput,
  type TeamSlotInput,
} from '../team.ts';
import type { WeaponModel } from '../weapons.ts';
import { untargetableRanges } from './events.ts';
import type { FrameRange } from '../skills/timeline.ts';
import { dotStacksAt, dotTicks, groupDotsByState } from './dot.ts';
export {
  DOT_LATER_TICK_DELAY_SECONDS,
  dotTickFrames,
  dotTickTracker,
  dotTicks,
  groupDotsByState,
  type DotTick,
  type DotTickTracker,
} from './dot.ts';
import { runFirstPass, type FirstPassResult, type InstantApplication } from './firstPass.ts';
import {
  flightFramesAt,
  hitRateSpanWith,
  hitRateSpansOf,
  planLandings,
  slotAutoAttackCoreRatesOf,
  slotDistanceRatesOf,
  slotFlightsOf,
  slotWeaponChangeFirstHitsOf,
  type FlightFrameSpan,
  type LandingHitRateSpan,
  type LandingPlan,
} from './landing.ts';
import type { ShotLog } from './shots.ts';
import type { SkillSlot } from '../types.ts';

/** Stage 8: 倍率ダメージ 1 回の発動（1 パス目で決まる。sim と calc で共通） */
export type SkillHitEvent = {
  frame: number;
  slotIndex: number;
  effect: ResolvedDamageEffect;
  hit: SkillHitResult;
  /** レイヴン編: スタックする持続ダメージ（dot の maxStacks > 1）の tick なら、その tick の時点のスタックの数。hit はこの数倍の値 */
  stacks?: number;
  /** 2 段目の段 13 の PR 1: 持続ダメージの、付けた時の 1 スタックぶんのヒット（dot の hitOnApply）。tick ではない */
  onApply?: true;
};

/** バーストの時刻表（sim と calc で共通）。burst が false なら null。options は動的サイクルの射撃の列とゲージ速度（Stage 8） */
export function planTeamSchedule(
  slots: readonly (TeamSlotInput | null)[],
  frames: number,
  burst: boolean | undefined,
  burstModel: BurstScheduleModel = 'dynamic',
  model?: WeaponModel,
  controlledSlot: number | null = null,
  options: DynamicScheduleOptions = {},
): BurstSchedule | null {
  if (!burst) return null;
  if (burstModel === 'fixed') {
    return planFixedCycle(
      slots.map((s) => (s === null ? null : burstCandidateOf(s.character, s.skills?.definition ?? null))),
      frames,
    );
  }
  return planDynamicSchedule(slots, frames, model, undefined, controlledSlot, options);
}

/** 1 パス目の結果（sim と calc で共通） */
export type TeamPlan = {
  frames: number;
  /** 各枠の射撃の列（空枠は null） */
  shots: (ShotLog | null)[];
  schedule: BurstSchedule | null;
  timeline: BuffTimeline;
  /** 倍率ダメージ（damage）の発動（フレーム順） */
  skillHits: SkillHitEvent[];
  /** Stage 10: 即時効果（CT 短縮・弾丸チャージ）を当てた記録（発生順） */
  instants: InstantApplication[];
  /** Stage 16-B: 敵を狙えない窓（フレーム。出来事が無ければ空） */
  untargetable: FrameRange[];
  /** Stage 18-C: 着地点の計画（条件が自動の枠が無い、または的の表の無い敵では null） */
  landing: LandingPlan | null;
  /** V-0030: 段の循環のヒットで溜めたゲージ（1 パス目の記録。frame/firstPass.ts） */
  cycleGaugeHits: FirstPassResult['cycleGaugeHits'];
  /** レイヴン編: 持続ダメージで溜めたゲージ（1 パス目。テスト用） */
  dotGauges: FirstPassResult['dotGauges'];
  /** 発のゲージ（着弾のフレーム。1 パス目の記録。frame/firstPass.ts） */
  shotGauges: FirstPassResult['shotGauges'];
  /** フラワー編（V-0483）: 周期のゲージ（1 パス目の記録） */
  timerGauges: FirstPassResult['timerGauges'];
  /** 持ち主ごとの一覧編（plan/design-holder-effects.md 2.9 節）: 1 パス目の件の一覧の履歴 */
  history: HolderHistory;
};

/**
 * Stage 8: 1 パス目。射撃の列 → 時刻表（常時のゲージ速度込み）→ バフの区間（射撃の回数トリガー込み）→ 倍率ダメージの発動。
 * Stage 10: 射撃の列と時刻表は runFirstPass のフレームループで同時に作る（射撃に効くバフ・CT 短縮・弾丸チャージ込み）。
 * バフの区間と倍率ダメージは、確定した射撃の列と時刻表から作る。持ち主ごとの一覧編: バフの区間は 1 パス目の履歴から作る。
 */
export function planTeamRun(teamInput: TeamInput): TeamPlan {
  // Stage 9: 直接呼ばれても宝物の段階が効くように。最上位で適用済みなら何もしない（同じオブジェクト）
  const input = applyCompositionToTeam(applyTreasureToTeam(teamInput));
  const { slots, enemy, model } = input;
  validateTeamSlots(slots);
  validateControlledSlot(slots, input.controlledSlot);
  validateObstacleBreaks(slots, input.obstacleBreaks);
  validatePelletHits(slots, input.pelletHits);
  const frames = battleSecondsToFrames(input.durationSeconds);
  const timelineSlots = toTimelineSlots(slots);
  const untargetable = untargetableRanges(enemy.events, frames);
  // Stage 18-C: 条件が自動の枠の着地点（敵の出来事だけで決まるので、射撃より前に決まる）
  const landing = planLandings(slots, enemy, frames, resolvePassiveStates(timelineSlots));
  const first = runFirstPass(timelineSlots, {
    frames,
    model,
    burst: input.burst ?? false,
    burstModel: input.burstModel ?? 'dynamic',
    controlledSlot: input.controlledSlot ?? null,
    ...(input.manualBursts === undefined ? {} : { manualBursts: input.manualBursts }),
    ...(input.noBurstSlots === undefined ? {} : { noBurstSlots: input.noBurstSlots }),
    untargetable,
    hitRates: landing === null ? undefined : hitRateSpansOf(landing, slots.length),
    enemyHasCore: enemy.hasCore,
    // plan/design-anis-star-gauge-timing.md: 飛ぶ時間（的の表）と、発が壊した障害物（録画で数えた入力）
    flights: slotFlightsOf(slots, enemy, frames),
    // plan/design-eunhwa-tu-burst-shot-timing.md: 使用武器変更の最初の発の時刻（的の表）
    weaponChangeFirstHits: slotWeaponChangeFirstHitsOf(slots, enemy, frames),
    obstacleBreaks: input.obstacleBreaks ?? [],
    pelletHits: input.pelletHits ?? [],
    // plan/design-sustained-hit-rate-gauge.md: 持続の命中率▲を 1 パス目のゲージと命中の期待値にも効かせる（2 パス目と同じ切り替え）
    ...(landing === null || input.sustainedHitRateUp === false
      ? {}
      : {
          hitRateWith: (slotIndex: number, span: LandingHitRateSpan, up: number) =>
            hitRateSpanWith(landing, slots[slotIndex]!, slotIndex, span, up),
        }),
  });
  const { shots, schedule, instants, cycleGaugeHits, dotGauges, shotGauges, timerGauges } = first;
  // 持ち主ごとの一覧編（plan/design-holder-effects.md 2.7 節）: バフの区間は、1 パス目の件の一覧の履歴から作る
  const sustainedHitRateUp = input.sustainedHitRateUp ?? true;
  const timeline = buffTimelineOf(first.history, schedule, landing, sustainedHitRateUp);
  const skillHits = planSkillHits(
    slots,
    enemy,
    timeline,
    first.history,
    schedule,
    frames,
    shots,
    input.sustainedDamagePlacement,
    slotAutoAttackCoreRatesOf(slots, enemy, frames),
    input.attackRounding,
    slotDistanceRatesOf(landing, slots, frames),
  );
  return {
    frames,
    shots,
    schedule,
    timeline,
    skillHits,
    instants,
    untargetable,
    landing,
    cycleGaugeHits,
    dotGauges,
    shotGauges,
    timerGauges,
    history: first.history,
  };
}

/** Stage 11 モダニア: その枠の射撃ごとの倍率ダメージ（1 トリガーの値に畳み込む）。定義が無ければ空 */
export function perShotDamageOf(slot: TeamSlotInput): ResolvedSkillDamage[] {
  const definition = slot.skills?.definition;
  if (!definition) return [];
  return resolvePerShotDamage(definition, slot.character, slot.skills?.levels ?? MAX_SKILL_LEVELS);
}

/** バースト系のトリガー（burstDamage と同じく発動直前のバフで計算する）か */
function isBurstUseTrigger(trigger: ResolvedTrigger): boolean {
  return trigger === 'burstUse' || (isResolvedEventCount(trigger) && trigger.count === 'burstUse');
}

/**
 * Stage 8: 倍率ダメージ（damage）の発動を列挙し、発動フレームのバフで期待ダメージを計算する。
 * 射撃の回数トリガーはその射撃と同じバフ（その射撃で付くバフは次のフレームからなので含まない）、
 * バーストを使った時のもの（burstUse とその回数）は burstDamage と同じく発動直前のバフ。
 */
export function planSkillHits(
  slots: readonly (TeamSlotInput | null)[],
  enemy: EnemyInput,
  timeline: BuffTimeline,
  /**
   * 持ち主ごとの一覧編（plan/design-holder-effects.md 2.8 節・段 D の 2）: 1 パス目の履歴。条件 enemyState は敵の状態の件、
   * 下位効果のスタック適用は値の小片、{ applied } は付いた記録、段の循環は間隔の変更の件を見る。段 11 の PR 5: 条件 selfCounter と
   * perCount の { counter } はカウンタの記録を見る
   */
  history: Pick<HolderHistory, 'tracks' | 'amplified' | 'slots' | 'applications' | 'counters'>,
  schedule: BurstSchedule | null,
  frames: number,
  shots: readonly (ShotLog | null)[],
  sustainedDamagePlacement?: SustainedDamagePlacement,
  /** コアの経路編: 枠ごとの自動攻撃のコアに当たる割合の区間（frame/landing.ts の slotAutoAttackCoreRatesOf）。省略はコアなし */
  autoAttackCoreRates: readonly (Partial<Record<SkillSlot, FlightFrameSpan[]>> | null)[] = [],
  /** 攻撃力▲の丸め（TeamInput.attackRounding）。省略はいまのモデル */
  attackRounding?: AttackRounding,
  /**
   * 2 段目の段 12 の PR 2: 枠ごとの、通常攻撃に距離ボーナスの付く割合の区間（frame/landing.ts の slotDistanceRatesOf）。damage の distance の
   * ヒットが読む。省略は距離ボーナスなし
   */
  distanceRates: readonly (FlightFrameSpan[] | null)[] = [],
): SkillHitEvent[] {
  const hits: SkillHitEvent[] = [];
  // クルミ S2 編: damage の条件 enemyState が見る、敵の状態ごとの「付いている」区間。段 C: 敵の状態の件（どの出どころの件でもよい）
  const enemySpans = new Map<NamedStateId, { start: number; end: number }[]>();
  // エレグの段 3（plan/design-elegg-s3.md 2 節の 2）: 敵に付く状態の付与の件（ブームインストール）も同じ列に入れる
  for (const item of itemsOf(history, { holder: ENEMY })) {
    if (item.origin.kind !== 'enemyState' && item.origin.kind !== 'state') continue;
    enemySpans.set(item.origin.state, [...(enemySpans.get(item.origin.state) ?? []), item]);
  }
  // 段 D の 2: 下位効果のスタック適用が見る値の小片（区間に足すのと同じ。状態だけの stat は入れない）
  const pieces = valuePiecesOf(history).filter((p) => !isStateStat(p.effect.stat));
  slots.forEach((slot, slotIndex) => {
    const definition = slot?.skills?.definition;
    if (!slot || !definition) return;
    const levels = slot.skills?.levels ?? MAX_SKILL_LEVELS;
    const sequential = definition.skills.burst.sequential === true;
    // 2 段目の段 1（plan/design-skill-stage1.md 1.1 節）: damage の条件 selfState が見る、自分の静的な状態と状態の件（段の印に依らない。
    // 発火のフレームより前に付いた件だけを見る。同じフレームに付いた件（同じ発動の付与を含む）は見ない（C-0160 と同じ読み。V-0432）。
    // 解除・消去で外れる件はそのフレームまで付いている）。2 段目の段 5（plan/design-skill-stage5.md 1.2 節）: 家族の根なら、家族のどの
    // 状態でも当たる。2 段目の段 3（plan/design-skill-stage3.md 1.4 節）: スタック数の条件は、同じ件の段の最大を見る（skills/holders.ts の stacksHold）
    const ownStatics = new Set(staticStatesOf(definition));
    const ownStateItems = itemsOf(history, { holder: slotIndex, kind: 'state' });
    const selfStateHolds = (self: SelfStateCondition, frame: number): boolean => {
      const isStatic = [...ownStatics].some((s) => stateMatches(self.state, s));
      const active = ownStateItems.filter(
        (i) =>
          i.origin.kind === 'state' && stateMatches(self.state, i.origin.state) && i.start < frame && frame < i.end,
      );
      if (self.stacks === undefined) return (isStatic || active.length > 0) === self.present;
      return stacksHold(
        self.stacks,
        isStatic,
        [...new Set(active.map((i) => i.origin))].map((origin) => ({
          origin,
          items: active.filter((i) => i.origin === origin),
        })),
      );
    };
    // 2 段目の段 10: perCount が読む、自分のその状態のスタック数（selfStateHolds と同じ件。静的な状態は 1）
    const selfStackCount = (state: NamedStateId, frame: number): number => {
      let level = [...ownStatics].some((s) => stateMatches(state, s)) ? 1 : 0;
      for (const i of ownStateItems) {
        if (i.origin.kind !== 'state' || !stateMatches(state, i.origin.state)) continue;
        if (i.start < frame && frame < i.end) level = Math.max(level, i.stack ?? 1);
      }
      return level;
    };
    // 2 段目の段 11 の PR 5（plan/design-skill-stage11.md 2.5 節）: 条件 selfCounter と perCount の { counter } が読む、自分のカウンタの
    // 発火のフレームの値（前のフレームの終わりの値。1 パス目の判定と同じ見え方。戦闘開始時の増減はフレーム 0 から。counterEffectiveFrom）
    const ownCounters = history.counters.filter((r) => r.slotIndex === slotIndex);
    const counterAt = (counter: CounterId, frame: number): number => {
      let value = 0;
      for (const r of ownCounters) if (r.counter === counter && counterEffectiveFrom(r) <= frame) value = r.value;
      return value;
    };
    // 持続ダメージの付くフレーム。2 段目の段 13 の PR 1（plan/design-skill-stage13.md 2.3 節）: { counterFull } の perCount は、発火の
    // applyDelayFrames 後から間隔ごとに、カウンタの数だけ 1 つずつ付く（キャプチャーチェーンの攻撃ごとのチェーンバインド）
    const dotApplicationFrames = (effect: ResolvedDamageEffect): number[] => {
      const t = effect.trigger;
      if (!isCounterFullTrigger(t)) return triggerFrames(t, schedule, slotIndex, frames, shots);
      const per = effect.perCount;
      if (per === undefined || !('counter' in per) || effect.perCountIntervalFrames === undefined)
        throw new RangeError('a dot with { counterFull } needs perCount { counter } and perCountIntervalFrames');
      const step = { frames: effect.perCountIntervalFrames, delay: effect.dot!.applyDelayFrames };
      return counterFullFrames(ownCounters, slotIndex, t.counterFull).flatMap((f) =>
        perCountFrames(f, counterAt(per.counter, f), step, frames),
      );
    };
    // 着弾編: 同じ発動の順は、ヒットと効果の発火が同じフレームのキャラだけで決めてある（plan/design-burst-landing.md 3.2 節）
    const delays = burstDelaysOf(slot.character);
    if (sequential && delays.hitFrames !== delays.effectFrames) {
      throw new RangeError('a sequential burst needs the same hit and effect delays');
    }
    // 分かれたヒット編: 同じ発動の効果の順を、分かれたヒットにどう当てるかの根拠が無い（plan/design-burst-split-hits.md 4.1 節）
    if (sequential && isSplit(delays)) throw new RangeError('a sequential burst cannot have split hits');
    // ミハラのバースト編: 自分の発動（perBurstHit の damage が、発火のフレームからヒットのフレームの列を引く）
    const mine = (schedule?.activations ?? []).filter((a) => a.slotIndex === slotIndex);
    const push = (
      frame: number,
      effect: ResolvedDamageEffect,
      pre: boolean,
      stacks?: number,
      activationFrame = frame - delays.effectFrames,
      shooterAtHit = false,
      valueFrame = frame,
    ): void => {
      // バースト使用時の倍率ダメージは、撃つ側のバフを発動の時点で固定する（burstHitBuffs）。発動は発火の effectFrames 前
      // （ミハラのバースト編: 分かれたヒットごとに出す damage は、発動のフレームを渡す）。
      // 2 段目の段 10（C-0657。V-0527）: バーストのヒットごとに出す追加ダメージ（perBurstHit）は、撃つ側のバフもヒットの時点の値で出す
      // （シンデレラの S1 の攻撃力▲は、ヒットの時の最終最大HP を読み直す。バーストのヒットは発動の時点のまま）
      const atHit =
        pre && !shooterAtHit
          ? burstHitBuffs(timeline, activationFrame, frame, slotIndex, pre)
          : burstSnapshotState(timeline, valueFrame, slotIndex, pre).buffs;
      // ルドミラ：ウィンターオーナー編（plan/design-ludmilla-wo.md 2.4 節）: スキルのスロットの sequential は、射撃の回数
      // トリガーの発火（窓は次のフレームから）の damage に、同じ発火で前に書いた timed を足す
      const skill = effect.source.skill;
      const buffs =
        pre && sequential && skill === 'burst'
          ? withEarlierSequentialEffects(pieces, atHit, frame, slotIndex, skill, effect.effectIndex)
          : skill !== 'burst' && definition.skills[skill].sequential === true && isResolvedShotCount(effect.trigger)
            ? withEarlierSequentialEffects(pieces, atHit, frame + 1, slotIndex, skill, effect.effectIndex)
            : atHit;
      const trigger = computeTriggerDamage({
        character: slot.character,
        growth: slot.growth,
        enemy,
        attackOverride: slot.attackOverride,
        attackRounding,
        buffs,
        condition: { ...slot.condition, fullBurst: false },
      });
      // フルバースト補正はフルバースト中に出た倍率ダメージにだけ乗る（2026-09-23 実測）
      const fullBurst = SKILL_HIT_FULL_BURST_BONUS && schedule !== null && isInFullBurst(schedule, valueFrame);
      // レイヴン編: スタックする持続ダメージの tick は、1 スタックの倍率 × スタックの数（C-0182）
      const scaled = stacks === undefined ? effect : { ...effect, multiplier: effect.multiplier * stacks };
      // コアの経路編（plan/design-anis-star-core-path.md 3.2 節）: core の自動攻撃は、ヒットのフレームの着地点の行の割合
      // 2026-10-29 のキャラの編（plan/design-new-chars-1029.md 5.4 節）: コア命中ダメージは割合 1。2 段目の段 12 の PR 2: damage の core も
      // 自動攻撃と同じ行
      const coreRate =
        effect.coreHit === true
          ? 1
          : effect.core === true
            ? flightFramesAt(autoAttackCoreRates[slotIndex]?.[effect.source.skill], frame)
            : 0;
      // 2 段目の段 12 の PR 2: distance のヒットは、ヒットのフレームの撃った枠の通常攻撃と同じ距離ボーナスの割合
      const distanceRate = effect.distance === true ? flightFramesAt(distanceRates[slotIndex], frame) : 0;
      const hit = computeSkillHit(
        [scaled],
        slot.character,
        enemy,
        trigger,
        buffs,
        fullBurst,
        sustainedDamagePlacement,
        coreRate,
        distanceRate,
      );
      hits.push({ frame, slotIndex, effect, hit, ...(stacks === undefined ? {} : { stacks }) });
    };
    // 段 D の 2: 間隔の変更の件（持ち主はその枠。時刻の順）。2 段目の段 12 の PR 2（plan/design-skill-stage12.md 2.4 節）: 窓が効く先
    // （段の循環か、射撃の回数のきっかけか）とスロットで絞る
    const everyWindows = (target: 'cycle' | 'shotCounts', skill: SkillSlot) =>
      itemsOf(history, { holder: slotIndex, kind: 'cycleEvery' }).flatMap((i) =>
        i.origin.kind === 'cycleEvery' && i.origin.effect.target === target && i.origin.effect.targetSkill === skill
          ? [{ start: i.start, end: i.end, every: i.origin.effect.every }]
          : [],
      );
    const everyAtFor = (skill: SkillSlot): ShotCountEveryAt | undefined => everyAtOf(everyWindows('shotCounts', skill));
    for (const effect of resolveDamageEffects(definition, slot.character, levels)) {
      // 遅れて出る倍率ダメージ編（plan/design-delayed-skill-hit.md 3.1 節）: delayFrames があれば、きっかけの後のフレームに
      // そのフレームのバフで出す（発動の直前のバフで固定しない）。戦闘の終わりを越えるヒットは出さない
      const delay = effect.delayFrames ?? 0;
      const pre = delay === 0 && isBurstUseTrigger(effect.trigger) && BURST_HIT_USES_PRE_ACTIVATION_BUFFS;
      // ミハラのバースト編: 同じ発動の効果の順を、分かれたヒットにどう当てるかの根拠が無い（分かれたヒットと同じ）
      if (sequential && effect.perBurstHit === true)
        throw new RangeError('a sequential burst cannot have perBurstHit damage');
      // ペルソナ編（plan/design-persona.md 3.3 節）: 「〈状態名〉が適用された時」は、その状態がこの枠に付いたフレーム
      // （名前の付いた状態の語彙編: 時刻表の applications。plan/design-named-state.md 5.3 節）
      // 2026-10-29 のキャラの編（plan/design-new-chars-1029.md 5.3 節）: 状態の間だけ縮む周期は、前の発動のフレームの自分の状態で
      // 次の発動までの秒を決めて並べる
      const shorten = effect.periodShorten;
      // 2 段目の段 13 の PR 1（plan/design-skill-stage13.md 2.2 節）: { counterFull } はカウンタが上限に届いた次のフレーム（1 パス目の記録）
      const t = effect.trigger;
      const fires = isCounterFullTrigger(t)
        ? counterFullFrames(ownCounters, slotIndex, t.counterFull)
        : isResolvedApplied(t)
          ? appliedFrames(history, t.applied, slotIndex)
          : isResolvedTimer(t)
            ? timerDamageFrames(t, shorten, frames, schedule, slotIndex, (state, f) =>
                selfStateHolds({ state, present: true }, f),
              )
            : triggerFrames(t, schedule, slotIndex, frames, shots, undefined, everyAtFor(effect.source.skill));
      for (const frame of fires) {
        if (!damageConditionHolds(effect.condition, frame, schedule, enemySpans, selfStateHolds, counterAt)) continue;
        // 2 段目の段 10（plan/design-skill-stage10.md 2.1 節）: 「〈名前〉スタックコピー」は発火のフレームのスタック数を倍率に掛ける
        // （条件 selfState と同じく、発火のフレームより前に付いた件の段の最大。0 なら出さない。V-0502）。段 11 の PR 5: 「× オーバー
        // エネルギー段階」は発火のフレームのカウンタの値（V-0532）
        const per = effect.perCount;
        const copied =
          per === undefined
            ? undefined
            : 'state' in per
              ? selfStackCount(per.state, frame)
              : counterAt(per.counter, frame);
        if (copied === 0) continue;
        // 2 段目の段 12 の PR 2（plan/design-skill-stage12.md 2.2 節）: 数だけのヒットを、倍率を掛けずに 1 つずつ間隔を空けて出す
        // （粘着榴弾の起爆・キャプチャーチェーンの攻撃。perCountFrames。それぞれのフレームのバフとフルバースト補正）。
        // 2 段目の段 14 の PR 2（plan/design-skill-stage14.md 2.5 節）: オートファイアの順番の攻撃（フルチャージの発のフレームのオートファイア
        // 準備のスタック数。発で外れる前の数。V-0552）も同じ形で、delayFrames の後から刻む。
        // 2 段目の段 14 の PR 3（plan/design-skill-stage14.md 2.7 節。V-0553）: 順番の攻撃（sequentialAttack）のヒットは、バフとフルバースト
        // 補正を発火のフレーム（オートファイアならフルチャージの発）の値で固定する。「1 発間維持」の▲（窓は溜めが満ちたフレームから撃った
        // 発まで）は、その発の遅れて出る順番の攻撃の全部に乗り、次の発の順番の攻撃には乗らない
        if (splitsPerCount(effect) && copied !== undefined) {
          for (const at of effectHitFrames(effect, frame, copied, frames))
            push(at, effect, pre, undefined, undefined, false, effect.sequential === true ? frame : at);
          continue;
        }
        if (effect.perBurstHit === true) {
          // ミハラのバースト編（plan/design-mihara-burst-hits.md 3.2 節）: 条件は発火のフレームで 1 回判定し（C-0566）、
          // その発動のバーストの倍率ダメージのヒットのそれぞれに、等分しない倍率で出す（C-0565）
          const activation = mine.find((a) => effectFrameOf(a) === frame);
          if (activation === undefined) throw new RangeError(`no burst activation fires at frame ${frame}`);
          for (const hit of hitFramesOf(activation)) {
            if (hit < frames) push(hit, effect, pre, copied, activation.frame, true);
          }
          continue;
        }
        // 2026-10-29 のキャラの編（plan/design-new-chars-1029.md 5.2 節）: 「N 回順番に攻撃」は N ヒットを間をあけて出す。
        // 同 10.2 節の d: N ヒットとも発動（発火）のフレームのバフとフルバースト補正で出す（遅れ・間の後のヒットも。C-0735）。
        // N 回でない倍率ダメージは、遅れがあればヒットのフレームのバフ（遅れて出る倍率ダメージ編）
        // エレグの S1（C-0766）: 値を決めるフレームのある効果（valueDelayFrames。N 回は 0）は、どのヒットも発火のその後の値で出す
        // （エレグの S1 は届いた発の次のフレームで、同じ発で付いた timed も乗る）
        for (const at of damageHitFramesOf(effect, frame, frames))
          push(
            at,
            effect,
            pre,
            copied,
            undefined,
            false,
            effect.valueDelayFrames === undefined ? at : frame + effect.valueDelayFrames,
          );
      }
    }
    // ニヒリスター編: 持続ダメージ。付いた時から間隔ごとの tick を、倍率ダメージと同じ式で tick のフレームのバフで積む。
    // クルミ編: 同じ状態（state）の dot は 1 つの持続ダメージとして、発火をまとめて tick を出す（C-0136）。tick は、その時点で
    // 最後に付けた効果に帰属させる（値は同じ）。
    // レイヴン編: スタックする持続ダメージ（maxStacks > 1）は、tick の時点のスタックの数を倍率に掛ける（dotTicks。C-0182）
    // 2 段目の段 13 の PR 2（plan/design-skill-stage13.md 2.5 節）: 消去（cancelState）のフレームと、ほかの dot が写す元の付いたフレーム
    const dotCancels = resolveDotCancels(definition, slot.character, levels);
    const cancelsOf = (state: NamedStateId | undefined): number[] =>
      state === undefined
        ? []
        : dotCancels
            .filter((c) => c.state === state)
            .flatMap((c) => triggerFrames(c.trigger, schedule, slotIndex, frames, shots))
            .sort((a, b) => a - b);
    // 同 PR 3（2.6 節）: 敵のスタック量▲は、対象がその状態のフレーム（条件 enemyState。damage と同じ判定）だけ、同じ state の dot の付与として数える（1 スタックぶんの
    // ヒットと刻みの付け直しも付与と同じ。V-0548）。▲の付与は、その state の最初の dot の効果に帰属させる（値は同じ）
    const dotStackUps = resolveDotStackUps(definition, slot.character, levels);
    const dotGroups = groupDotsByState(resolveDotEffects(definition, slot.character, levels)).map((group) => {
      const fires = group
        .flatMap((effect) => dotApplicationFrames(effect).map((f) => ({ f, effect })))
        .sort((a, b) => a.f - b.f);
      const dot = group[0]!.dot!;
      const cancels = cancelsOf(dot.state);
      const ups = dotStackUps.filter((u) => u.state === dot.state);
      if (ups.length > 0) {
        for (const up of ups)
          for (const f of triggerFrames(up.trigger, schedule, slotIndex, frames, shots))
            if (damageConditionHolds(up.condition, f, schedule, enemySpans, selfStateHolds, counterAt))
              for (let k = 0; k < up.amount; k++) fires.push({ f, effect: group[0]! });
        fires.sort((a, b) => a.f - b.f);
      }
      return { dot, fires, cancels };
    });
    for (const { dot, fires, cancels } of dotGroups) {
      const { maxStacks } = dot;
      // 2 段目の段 13 の PR 2: スタックコピー。付けた時に元の持続ダメージのスタックの数を写し、その数の tick を出す（0 なら付かない）
      const from = dot.stacksFrom;
      if (from !== undefined) {
        // 元は同じ定義の dot（skills/types.ts の validateDotStateRefs）
        const source = dotGroups.find((g) => g.dot.state === from)!;
        const sourceFires = source.fires.map((x) => x.f);
        for (const { f, effect } of fires) {
          const copied = dotStacksAt(sourceFires, source.cancels, source.dot.maxStacks, f);
          if (copied === 0) continue;
          for (const tick of dotTicks([f], dot.intervalSeconds, dot.durationSeconds, frames, dot.firstTick))
            push(tick.frame, effect, false, copied);
        }
        continue;
      }
      // 2 段目の段 13 の PR 1（plan/design-skill-stage13.md 2.3 節）: 付けるたびに、付けた 1 スタックぶんの 1 ヒット（C-0411）
      if (dot.hitOnApply === true) {
        for (const { f, effect } of fires) {
          push(f, effect, false);
          hits[hits.length - 1]!.onApply = true;
        }
      }
      // tick の刻み・スタックの数・効果の帰属は、発火の tickDelayFrames 後（skills/types.ts の DotEffect.tickDelayFrames）を起点にする
      const starts = fires.map((x) => x.f + (dot.tickDelayFrames ?? 0));
      const ticks = dotTicks(
        starts,
        dot.intervalSeconds,
        dot.durationSeconds,
        frames,
        dot.firstTick,
        maxStacks,
        dot.tickIntervalFrames,
        cancels,
      );
      let last = 0;
      for (const tick of ticks) {
        while (last + 1 < starts.length && starts[last + 1]! <= tick.frame) last += 1;
        push(tick.frame, fires[last]!.effect, false, maxStacks > 1 ? tick.stacks : undefined);
      }
    }
    // Stage 11 紅蓮BS: 段の循環。射撃の列を通算で数え、間隔の変更の窓に入る射撃は窓の間隔で段を進める（skills/cycles.ts）。
    // 値は射撃の回数トリガーの倍率ダメージと同じく、ヒットのフレームのバフ（段の delayFrames があれば射撃の d 後）
    for (const cycle of resolveCycles(definition, slot.character, levels)) {
      const windows = everyWindows('cycle', cycle.source.skill);
      const shotFrames = cycleShotFrames(shots[slotIndex], cycle.trigger);
      for (const fire of cycleFires(cycle.trigger.every, cycle.steps.length, shotFrames, windows)) {
        // 回数トリガーの遅れ編の第 2 段（plan/design-shot-count-trigger-frame.md 6.6 節）: 段の delayFrames があれば、射撃の d 後に
        // そのフレームのバフで出す（紅蓮BS は A 10・B 9・C 9。C-0651）。戦闘の終わりを越えるヒットは出さない
        const step = cycle.steps[fire.step]!;
        const at = fire.frame + (step.delayFrames ?? 0);
        if (at < frames) push(at, step, false);
      }
    }
  });
  // フレーム順（同じフレームは枠順・定義順。sort は安定）
  return hits.sort((a, b) => a.frame - b.frame || a.slotIndex - b.slotIndex);
}

/**
 * クルミ S2 編: damage の発火の条件（plan/design-kurumi-s2.md 2.2・2.3 節）。条件が無ければ true。キーはすべてを満たすこと
 * （名前の付いた状態の語彙編: timed と同じ条件の型。damage が受ける鍵は inFullBurst・enemyState。plan/design-named-state.md 5.6 節。
 * 2 段目の段 1: selfState も。plan/design-skill-stage1.md 1.1 節）
 */
function damageConditionHolds(
  condition: EffectCondition | undefined,
  frame: number,
  schedule: BurstSchedule | null,
  enemySpans: ReadonlyMap<NamedStateId, readonly { start: number; end: number }[]>,
  selfStateHolds: (self: SelfStateCondition, frame: number) => boolean,
  counterAt: (counter: CounterId, frame: number) => number,
): boolean {
  if (condition === undefined) return true;
  if (condition.selfState !== undefined && !selfStateHolds(condition.selfState, frame)) return false;
  if (condition.selfCounter !== undefined) {
    const { counter, atLeast, below } = condition.selfCounter;
    const value = counterAt(counter, frame);
    if (atLeast !== undefined && value < atLeast) return false;
    if (below !== undefined && value >= below) return false;
  }
  if (condition.inFullBurst === true && (schedule === null || !isInFullBurst(schedule, frame))) return false;
  if (condition.enemyState !== undefined) {
    const spans = enemySpans.get(condition.enemyState) ?? [];
    if (!spans.some((s) => s.start <= frame && frame < s.end)) return false;
  }
  return true;
}

/**
 * 着弾編（plan/design-burst-landing.md 3.2 節）: 「下位効果のスタック適用」（sequential）の damage が見るバフ。
 * 発動の直前のバフに、同じ枠の同じスロットで前に書いた timed のうち、start（同じ発動の効果の窓の始まり）に始まって
 * この枠に掛かる値の小片を足す（イサベルの段階 2・3 の追加ダメージに、同じ発動の段階 1 の受けるダメージ▲が乗る。C-0163。
 * 持ち主ごとの一覧編の段 D の 2: 受けるダメージ▲は敵の件で、値の小片はこの枠にも写る）。
 * 前の発動の窓が続いていれば、直前のバフにもう入っている（窓が和集合で、start に始まらない）。
 * ルドミラ：ウィンターオーナー編: スキルのスロットでは、射撃の回数トリガーの窓の始まり（発火の次のフレーム）を start に渡す
 */
function withEarlierSequentialEffects(
  pieces: readonly ValuePiece[],
  buffs: BuffTotals,
  start: number,
  slotIndex: number,
  skill: SkillSlot,
  effectIndex: number,
): BuffTotals {
  let out = buffs;
  for (const w of pieces) {
    if (w.start !== start || w.slotIndex !== slotIndex || w.sourceSlotIndex !== slotIndex) continue;
    if (w.effect.source.skill !== skill || w.effect.effectIndex >= effectIndex) continue;
    if (
      w.stack !== undefined ||
      w.effect.scaling === 'casterAttack' ||
      w.effect.scaling === 'casterFinalMaxHp' ||
      w.effect.stat === 'weapon'
    ) {
      throw new RangeError(
        'a sequential burst supports only plain timed effects (no stacks, casterAttack, casterFinalMaxHp or weapon)',
      );
    }
    out = applyResolvedEffect(out, w.effect, 0).totals;
  }
  return out;
}

/**
 * 発動フレーム f のバーストヒットが見るバフ状態。
 * BURST_HIT_USES_PRE_ACTIVATION_BUFFS が true なら「f を終端に持つ区間」（= その発動で付くバフは乗らない）。
 */
export function burstSnapshotState(
  timeline: BuffTimeline,
  frame: number,
  slotIndex: number,
  preActivation: boolean,
): SlotBuffState {
  const index = preActivation ? segmentIndexAt(timeline, frame - 1) : segmentIndexAt(timeline, frame);
  if (index < 0) return EMPTY_BUFF_STATE;
  return timeline.segments[index]!.slots[slotIndex] ?? EMPTY_BUFF_STATE;
}

/**
 * 着弾編（2026-10-02 オーナー決定。plan/design-burst-landing.md 8 節、C-0163・C-0167）: バーストのヒットが見るバフ。
 * 撃つ側のバフは発動のフレーム activationFrame の時点（preActivation なら直前）で固定し、敵の側のデバフ（damageTaken。2 段目の段 2 の
 * enemyDefenseDown も）だけ
 * ヒットのフレーム hitFrame の時点の値を使う。ヘルムのヒットは発動から 59f 後でフルバーストの中に入るが、フルバーストの始まりで
 * 付く S2 の攻撃ダメージ▲は乗らない（`0079-07`）。遅れの無いキャラ（hitFrame = activationFrame）は burstSnapshotState と同じ。
 * sameActivation（同じ発動の▲がヒットに乗る行のキャラだけ。plan/design-burst-landing.md 10 節の案 1、C-0582）を渡すと、
 * 撃つ側のバフに、同じ発動で自分に付いた burst スロットの効果を足す（withSameActivationEffects）
 */
export function burstHitBuffs(
  timeline: BuffTimeline,
  activationFrame: number,
  hitFrame: number,
  slotIndex: number,
  preActivation: boolean,
  sameActivation?: readonly ValuePiece[],
): BuffTotals {
  const atActivation = burstSnapshotState(timeline, activationFrame, slotIndex, preActivation).buffs;
  let buffs = atActivation;
  if (hitFrame !== activationFrame) {
    const atHit = burstSnapshotState(timeline, hitFrame, slotIndex, preActivation).buffs;
    buffs = { ...atActivation, damageTaken: atHit.damageTaken, enemyDefenseDown: atHit.enemyDefenseDown };
  }
  if (sameActivation === undefined) return buffs;
  return withSameActivationEffects(
    sameActivation,
    buffs,
    activationFrame,
    preActivation ? hitFrame - 1 : hitFrame,
    slotIndex,
  );
}

/** 同じ発動の▲がヒットに乗るキャラ（plan/design-burst-landing.md 10 節）なら、burstHitBuffs の sameActivation に渡す値の小片 */
export function sameActivationPiecesOf(
  history: Parameters<typeof valuePiecesOf>[0],
  character: Parameters<typeof sameActivationBuffsOnHit>[0],
): readonly ValuePiece[] | undefined {
  return sameActivationBuffsOnHit(character) ? valuePiecesOf(history) : undefined;
}

/**
 * 同じ発動の▲がヒットに乗るキャラ（plan/design-burst-landing.md 10 節の案 1）: この枠が自分に付けた burst スロットの値の小片のうち、
 * 発動のフレーム以後に始まり、ヒットが見るフレーム at に続いているものを足す。遅れは CT（20 秒以上）より短いので、発動のフレーム
 * 以後に始まる burst スロットの小片は、この発動のものだけ。敵が持つ stat（受けるダメージ▲・防御力▼）は、もうヒットの時点の値で
 * 入っているので足さない
 */
function withSameActivationEffects(
  pieces: readonly ValuePiece[],
  buffs: BuffTotals,
  activationFrame: number,
  at: number,
  slotIndex: number,
): BuffTotals {
  let out = buffs;
  for (const w of pieces) {
    if (w.slotIndex !== slotIndex || w.sourceSlotIndex !== slotIndex || w.effect.source.skill !== 'burst') continue;
    if (w.start < activationFrame || w.start > at || w.end <= at) continue;
    if (isStateStat(w.effect.stat) || isEnemyHeldStat(w.effect.stat)) continue;
    if (
      w.stack !== undefined ||
      w.effect.scaling === 'casterAttack' ||
      w.effect.scaling === 'casterFinalMaxHp' ||
      w.effect.stat === 'weapon'
    ) {
      throw new RangeError(
        'same-activation buffs on a burst hit support only plain timed effects (no stacks, casterAttack, casterFinalMaxHp or weapon)',
      );
    }
    out = applyResolvedEffect(out, w.effect, 0).totals;
  }
  return out;
}

/**
 * バーストヒットに「発動直前」のバフを使うか。false なら発動フレームの区間（その発動で付くバフ込み）を使う。
 * **2026-09-22 の射撃場実測で true と確定**（plan/verification.md Stage 6 節、録画 0018）:
 * ラピのバーストは自分に攻撃力 +60.75%（10 秒）を付けるが、そのバーストのダメージは 208,131 × 3 = 624,393 で
 * 素の攻撃力基準だった（バフ込みなら 1 発 334,704 になるはず）。
 */
export const BURST_HIT_USES_PRE_ACTIVATION_BUFFS = true;
