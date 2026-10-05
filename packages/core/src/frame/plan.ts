// 1 パス目（calc と sim で共通）。射撃の列 → 時刻表 → バフの区間 → 倍率ダメージの発動。
// Stage 8: 1 パス目を planTeamRun にまとめ、sim と calc が同じものを使う。
// 射撃の回数トリガーの窓と倍率ダメージ（damage）の発動は sim と厳密一致し、calc が期待値で置くのは通常攻撃のトリガー数だけ。
// Stage 10: 射撃に効くバフと CT 短縮で射撃の列と時刻表が循環するので、1 パス目の射撃の列と時刻表は frame/firstPass.ts の
// フレームループで作る。バフの区間と倍率ダメージは Stage 8 のまま、確定した射撃の列と時刻表から作る。
// Stage 16（plan/design-stage16.md 2 節）: team.ts から分けた。
import { burstDelaysFieldOf, burstDelaysOf, isSplit } from '../burst/landing.ts';
import { planFixedCycle } from '../burst/fixedCycle.ts';
import { battleSecondsToFrames } from '../time.ts';
import { planDynamicSchedule, type DynamicScheduleOptions } from '../burst/dynamic.ts';
import { isInFullBurst, type BurstSchedule, type BurstScheduleModel } from '../burst/schedule.ts';
import { computeTriggerDamage, type EnemyInput } from '../damage.ts';
import {
  SKILL_HIT_FULL_BURST_BONUS,
  computeSkillHit,
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
  isResolvedEventCount,
  isResolvedShotCount,
  type ResolvedTrigger,
} from '../skills/resolve.ts';
import {
  EMPTY_BUFF_STATE,
  planBuffTimeline,
  resolvePassiveStates,
  segmentIndexAt,
  triggerFrames,
  type BuffTimeline,
  type SlotBuffState,
} from '../skills/timeline.ts';
import { applyResolvedEffect, type BuffTotals } from '../skills/buffs.ts';
import type { DamageCondition } from '../skills/types.ts';
import { applyCompositionToTeam } from '../skills/composition.ts';
import { applyTreasureToTeam } from '../skills/treasure.ts';
import {
  toTimelineSlots,
  validateControlledSlot,
  validateObstacleBreaks,
  validateTeamSlots,
  type TeamInput,
  type TeamSlotInput,
} from '../team.ts';
import type { WeaponModel } from '../weapons.ts';
import { untargetableRanges } from './events.ts';
import type { FrameRange } from '../skills/timeline.ts';
import { dotActiveSpans, dotTicks, groupDotsByStatus } from './dot.ts';
export {
  DOT_LATER_TICK_DELAY_SECONDS,
  dotTickFrames,
  dotTickTracker,
  dotTicks,
  groupDotsByStatus,
  type DotTick,
  type DotTickTracker,
} from './dot.ts';
import { runFirstPass, type FirstPassResult, type InstantApplication } from './firstPass.ts';
import {
  hitRateSpanWith,
  hitRateSpansOf,
  planLandings,
  slotFlightsOf,
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
      slots.map((s) => (s === null ? null : { burstStep: s.character.burstStep, ...burstDelaysFieldOf(s.character) })),
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
};

/**
 * Stage 8: 1 パス目。射撃の列 → 時刻表（常時のゲージ速度込み）→ バフの区間（射撃の回数トリガー込み）→ 倍率ダメージの発動。
 * Stage 10: 射撃の列と時刻表は runFirstPass のフレームループで同時に作る（射撃に効くバフ・CT 短縮・弾丸チャージ込み）。
 * バフの区間と倍率ダメージは、確定した射撃の列と時刻表から作る。
 */
export function planTeamRun(teamInput: TeamInput): TeamPlan {
  // Stage 9: 直接呼ばれても宝物の段階が効くように。最上位で適用済みなら何もしない（同じオブジェクト）
  const input = applyCompositionToTeam(applyTreasureToTeam(teamInput));
  const { slots, enemy, model } = input;
  validateTeamSlots(slots);
  validateControlledSlot(slots, input.controlledSlot);
  validateObstacleBreaks(slots, input.obstacleBreaks);
  const frames = battleSecondsToFrames(input.durationSeconds);
  const timelineSlots = toTimelineSlots(slots);
  const untargetable = untargetableRanges(enemy.events, frames);
  // Stage 18-C: 条件が自動の枠の着地点（敵の出来事だけで決まるので、射撃より前に決まる）
  const landing = planLandings(slots, enemy, frames, resolvePassiveStates(timelineSlots));
  const { shots, schedule, instants, cycleGaugeHits, dotGauges, shotGauges } = runFirstPass(timelineSlots, {
    frames,
    model,
    burst: input.burst ?? false,
    burstModel: input.burstModel ?? 'dynamic',
    controlledSlot: input.controlledSlot ?? null,
    untargetable,
    hitRates: landing === null ? undefined : hitRateSpansOf(landing, slots.length),
    enemyHasCore: enemy.hasCore,
    // plan/design-anis-star-gauge-timing.md: 飛ぶ時間（的の表）と、発が壊した障害物（録画で数えた入力）
    flights: slotFlightsOf(slots, enemy, frames),
    obstacleBreaks: input.obstacleBreaks ?? [],
    // plan/design-sustained-hit-rate-gauge.md: 持続の命中率▲を 1 パス目のゲージと命中の期待値にも効かせる（2 パス目と同じ切り替え）
    ...(landing === null || input.sustainedHitRateUp === false
      ? {}
      : {
          hitRateWith: (slotIndex: number, span: LandingHitRateSpan, up: number) =>
            hitRateSpanWith(landing, slots[slotIndex]!, slotIndex, span, up),
        }),
  });
  const timeline = planBuffTimeline(timelineSlots, schedule, frames, shots, landing, input.sustainedHitRateUp ?? true);
  const skillHits = planSkillHits(slots, enemy, timeline, schedule, frames, shots, input.sustainedDamagePlacement);
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
  schedule: BurstSchedule | null,
  frames: number,
  shots: readonly (ShotLog | null)[],
  sustainedDamagePlacement?: SustainedDamagePlacement,
): SkillHitEvent[] {
  const hits: SkillHitEvent[] = [];
  // クルミ S2 編: damage の条件 targetStatus が見る、status ごとの「付いている」区間（編成の全枠の dot から先に出しておく）
  const statusSpans = dotStatusSpans(slots, schedule, frames, shots);
  slots.forEach((slot, slotIndex) => {
    const definition = slot?.skills?.definition;
    if (!slot || !definition) return;
    const levels = slot.skills?.levels ?? MAX_SKILL_LEVELS;
    const sequential = definition.skills.burst.sequential === true;
    // 着弾編: 同じ発動の順は、ヒットと効果の発火が同じフレームのキャラだけで決めてある（plan/design-burst-landing.md 3.2 節）
    const delays = burstDelaysOf(slot.character);
    if (sequential && delays.hitFrames !== delays.effectFrames) {
      throw new RangeError('a sequential burst needs the same hit and effect delays');
    }
    // 分かれたヒット編: 同じ発動の効果の順を、分かれたヒットにどう当てるかの根拠が無い（plan/design-burst-split-hits.md 4.1 節）
    if (sequential && isSplit(delays)) throw new RangeError('a sequential burst cannot have split hits');
    const push = (frame: number, effect: ResolvedDamageEffect, pre: boolean, stacks?: number): void => {
      // バースト使用時の倍率ダメージは、撃つ側のバフを発動の時点で固定する（burstHitBuffs）。発動は発火の effectFrames 前
      const atHit = pre
        ? burstHitBuffs(timeline, frame - delays.effectFrames, frame, slotIndex, pre)
        : burstSnapshotState(timeline, frame, slotIndex, pre).buffs;
      // ルドミラ：ウィンターオーナー編（plan/design-ludmilla-wo.md 2.4 節）: スキルのスロットの sequential は、射撃の回数
      // トリガーの発火（窓は次のフレームから）の damage に、同じ発火で前に書いた timed を足す
      const skill = effect.source.skill;
      const buffs =
        pre && sequential && skill === 'burst'
          ? withEarlierSequentialEffects(timeline, atHit, frame, slotIndex, skill, effect.effectIndex)
          : skill !== 'burst' && definition.skills[skill].sequential === true && isResolvedShotCount(effect.trigger)
            ? withEarlierSequentialEffects(timeline, atHit, frame + 1, slotIndex, skill, effect.effectIndex)
            : atHit;
      const trigger = computeTriggerDamage({
        character: slot.character,
        growth: slot.growth,
        enemy,
        attackOverride: slot.attackOverride,
        buffs,
        condition: { ...slot.condition, fullBurst: false },
      });
      // フルバースト補正はフルバースト中に出た倍率ダメージにだけ乗る（2026-09-23 実測）
      const fullBurst = SKILL_HIT_FULL_BURST_BONUS && schedule !== null && isInFullBurst(schedule, frame);
      // レイヴン編: スタックする持続ダメージの tick は、1 スタックの倍率 × スタックの数（C-0182）
      const scaled = stacks === undefined ? effect : { ...effect, multiplier: effect.multiplier * stacks };
      const hit = computeSkillHit([scaled], slot.character, enemy, trigger, buffs, fullBurst, sustainedDamagePlacement);
      hits.push({ frame, slotIndex, effect, hit, ...(stacks === undefined ? {} : { stacks }) });
    };
    for (const effect of resolveDamageEffects(definition, slot.character, levels)) {
      const pre = isBurstUseTrigger(effect.trigger) && BURST_HIT_USES_PRE_ACTIVATION_BUFFS;
      for (const frame of triggerFrames(effect.trigger, schedule, slotIndex, frames, shots)) {
        if (!damageConditionHolds(effect.condition, frame, schedule, statusSpans)) continue;
        push(frame, effect, pre);
      }
    }
    // ニヒリスター編: 持続ダメージ。付いた時から間隔ごとの tick を、倍率ダメージと同じ式で tick のフレームのバフで積む。
    // クルミ編: 同じ status の dot は 1 つの持続ダメージとして、発火をまとめて tick を出す（C-0136）。tick は、その時点で
    // 最後に付けた効果に帰属させる（値は同じ）。
    // レイヴン編: スタックする持続ダメージ（maxStacks > 1）は、tick の時点のスタックの数を倍率に掛ける（dotTicks。C-0182）
    for (const group of groupDotsByStatus(resolveDotEffects(definition, slot.character, levels))) {
      const fires = group
        .flatMap((effect) =>
          triggerFrames(effect.trigger, schedule, slotIndex, frames, shots).map((f) => ({ f, effect })),
        )
        .sort((a, b) => a.f - b.f);
      const { intervalSeconds, durationSeconds, firstTick, maxStacks } = group[0]!.dot!;
      let last = 0;
      for (const tick of dotTicks(
        fires.map((x) => x.f),
        intervalSeconds,
        durationSeconds,
        frames,
        firstTick,
        maxStacks,
      )) {
        while (last + 1 < fires.length && fires[last + 1]!.f <= tick.frame) last += 1;
        push(tick.frame, fires[last]!.effect, false, maxStacks > 1 ? tick.stacks : undefined);
      }
    }
    // Stage 11 紅蓮BS: 段の循環。射撃の列を通算で数え、間隔の変更の窓に入る射撃は窓の間隔で段を進める（skills/cycles.ts）。
    // 値は射撃の回数トリガーの倍率ダメージと同じく、その射撃と同じバフ
    for (const cycle of resolveCycles(definition, slot.character, levels)) {
      const windows = timeline.cycleWindows.filter(
        (w) => w.slotIndex === slotIndex && w.targetSkill === cycle.source.skill,
      );
      const shotFrames = cycleShotFrames(shots[slotIndex], cycle.trigger);
      for (const fire of cycleFires(cycle.trigger.every, cycle.steps.length, shotFrames, windows)) {
        push(fire.frame, cycle.steps[fire.step]!, false);
      }
    }
  });
  // フレーム順（同じフレームは枠順・定義順。sort は安定）
  return hits.sort((a, b) => a.frame - b.frame || a.slotIndex - b.slotIndex);
}

/**
 * クルミ S2 編（plan/design-kurumi-s2.md 2.3 節）: 編成の全枠の status つきの dot について、status ごとの「付いている」区間の列。
 * 発火は planSkillHits の tick と同じ（同じ status の効果の発火をまとめる）。別の枠の同じ名前は同じ状態とみなして区間を並べる
 */
function dotStatusSpans(
  slots: readonly (TeamSlotInput | null)[],
  schedule: BurstSchedule | null,
  frames: number,
  shots: readonly (ShotLog | null)[],
): Map<string, { start: number; end: number }[]> {
  const out = new Map<string, { start: number; end: number }[]>();
  slots.forEach((slot, slotIndex) => {
    const definition = slot?.skills?.definition;
    if (!slot || !definition) return;
    const levels = slot.skills?.levels ?? MAX_SKILL_LEVELS;
    for (const group of groupDotsByStatus(resolveDotEffects(definition, slot.character, levels))) {
      const status = group[0]!.dot!.status;
      if (status === undefined) continue;
      const fires = group
        .flatMap((effect) => triggerFrames(effect.trigger, schedule, slotIndex, frames, shots))
        .sort((a, b) => a - b);
      const { intervalSeconds, durationSeconds, firstTick } = group[0]!.dot!;
      const spans = dotActiveSpans(fires, intervalSeconds, durationSeconds, firstTick);
      out.set(status, [...(out.get(status) ?? []), ...spans]);
    }
  });
  return out;
}

/** クルミ S2 編: damage の発火の条件（plan/design-kurumi-s2.md 2.2・2.3 節）。条件が無ければ true。キーはすべてを満たすこと */
function damageConditionHolds(
  condition: DamageCondition | undefined,
  frame: number,
  schedule: BurstSchedule | null,
  statusSpans: ReadonlyMap<string, readonly { start: number; end: number }[]>,
): boolean {
  if (condition === undefined) return true;
  if (condition.fullBurst === true && (schedule === null || !isInFullBurst(schedule, frame))) return false;
  if (condition.targetStatus !== undefined) {
    const spans = statusSpans.get(condition.targetStatus) ?? [];
    if (!spans.some((s) => s.start <= frame && frame <= s.end)) return false;
  }
  return true;
}

/**
 * 着弾編（plan/design-burst-landing.md 3.2 節）: 「下位効果のスタック適用」（sequential）の damage が見るバフ。
 * 発動の直前のバフに、同じ枠の同じスロットで前に書いた timed のうち、start（同じ発動の効果の窓の始まり）に始まって
 * この枠に掛かる窓の値を足す（イサベルの段階 2・3 の追加ダメージに、同じ発動の段階 1 の受けるダメージ▲が乗る。C-0163）。
 * 前の発動の窓が続いていれば、直前のバフにもう入っている（窓が和集合で、start に始まらない）。
 * ルドミラ：ウィンターオーナー編: スキルのスロットでは、射撃の回数トリガーの窓の始まり（発火の次のフレーム）を start に渡す
 */
function withEarlierSequentialEffects(
  timeline: BuffTimeline,
  buffs: BuffTotals,
  start: number,
  slotIndex: number,
  skill: SkillSlot,
  effectIndex: number,
): BuffTotals {
  let out = buffs;
  for (const w of timeline.windows) {
    if (w.start !== start || w.slotIndex !== slotIndex || w.sourceSlotIndex !== slotIndex) continue;
    if (w.effect.source.skill !== skill || w.effect.effectIndex >= effectIndex) continue;
    if (w.stack !== undefined || w.effect.scaling === 'casterAttack' || w.effect.stat === 'weapon') {
      throw new RangeError('a sequential burst supports only plain timed effects (no stacks, casterAttack or weapon)');
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
 * 撃つ側のバフは発動のフレーム activationFrame の時点（preActivation なら直前）で固定し、敵の側のデバフ（damageTaken）だけ
 * ヒットのフレーム hitFrame の時点の値を使う。ヘルムのヒットは発動から 59f 後でフルバーストの中に入るが、フルバーストの始まりで
 * 付く S2 の攻撃ダメージ▲は乗らない（`079-07`）。遅れの無いキャラ（hitFrame = activationFrame）は burstSnapshotState と同じ
 */
export function burstHitBuffs(
  timeline: BuffTimeline,
  activationFrame: number,
  hitFrame: number,
  slotIndex: number,
  preActivation: boolean,
): BuffTotals {
  const atActivation = burstSnapshotState(timeline, activationFrame, slotIndex, preActivation).buffs;
  if (hitFrame === activationFrame) return atActivation;
  const atHit = burstSnapshotState(timeline, hitFrame, slotIndex, preActivation).buffs;
  return { ...atActivation, damageTaken: atHit.damageTaken };
}

/**
 * バーストヒットに「発動直前」のバフを使うか。false なら発動フレームの区間（その発動で付くバフ込み）を使う。
 * **2026-09-22 の射撃場実測で true と確定**（plan/verification.md Stage 6 節、録画 18）:
 * ラピのバーストは自分に攻撃力 +60.75%（10 秒）を付けるが、そのバーストのダメージは 208,131 × 3 = 624,393 で
 * 素の攻撃力基準だった（バフ込みなら 1 発 334,704 になるはず）。
 */
export const BURST_HIT_USES_PRE_ACTIVATION_BUFFS = true;
