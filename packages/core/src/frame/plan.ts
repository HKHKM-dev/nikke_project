// 1 パス目（calc と sim で共通）。射撃の列 → 時刻表 → バフの区間 → 倍率ダメージの発動。
// Stage 8: 1 パス目を planTeamRun にまとめ、sim と calc が同じものを使う。
// 射撃の回数トリガーの窓と倍率ダメージ（damage）の発動は sim と厳密一致し、calc が期待値で置くのは通常攻撃のトリガー数だけ。
// Stage 10: 射撃に効くバフと CT 短縮で射撃の列と時刻表が循環するので、1 パス目の射撃の列と時刻表は frame/firstPass.ts の
// フレームループで作る。バフの区間と倍率ダメージは Stage 8 のまま、確定した射撃の列と時刻表から作る。
// Stage 16（plan/design-stage16.md 2 節）: team.ts から分けた。
import { durationToFrames, planFixedCycle } from '../burst/fixedCycle.ts';
import { planDynamicSchedule, type DynamicScheduleOptions } from '../burst/dynamic.ts';
import { isInFullBurst, type BurstSchedule, type BurstScheduleModel } from '../burst/schedule.ts';
import { computeTriggerDamage, type EnemyInput } from '../damage.ts';
import {
  SKILL_HIT_FULL_BURST_BONUS,
  computeSkillHit,
  resolveDamageEffects,
  resolvePerShotDamage,
  type ResolvedDamageEffect,
  type ResolvedSkillDamage,
  type SkillHitResult,
} from '../skills/burstDamage.ts';
import { cycleFires, cycleShotFrames, resolveCycles } from '../skills/cycles.ts';
import { MAX_SKILL_LEVELS, isResolvedEventCount, type ResolvedTrigger } from '../skills/resolve.ts';
import {
  EMPTY_BUFF_STATE,
  planBuffTimeline,
  resolvePassiveStates,
  segmentIndexAt,
  triggerFrames,
  type BuffTimeline,
  type SlotBuffState,
} from '../skills/timeline.ts';
import { applyTreasureToTeam } from '../skills/treasure.ts';
import {
  toTimelineSlots,
  validateControlledSlot,
  validateTeamSlots,
  type TeamInput,
  type TeamSlotInput,
} from '../team.ts';
import type { WeaponModel } from '../weapons.ts';
import { untargetableRanges } from './events.ts';
import type { FrameRange } from '../skills/timeline.ts';
import { runFirstPass, type InstantApplication } from './firstPass.ts';
import { hitRateSpansOf, planLandings, type LandingPlan } from './landing.ts';
import type { ShotLog } from './shots.ts';

/** Stage 8: 倍率ダメージ 1 回の発動（1 パス目で決まる。sim と calc で共通） */
export type SkillHitEvent = {
  frame: number;
  slotIndex: number;
  effect: ResolvedDamageEffect;
  hit: SkillHitResult;
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
      slots.map((s) => (s === null ? null : { burstStep: s.character.burstStep })),
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
};

/**
 * Stage 8: 1 パス目。射撃の列 → 時刻表（常時のゲージ速度込み）→ バフの区間（射撃の回数トリガー込み）→ 倍率ダメージの発動。
 * Stage 10: 射撃の列と時刻表は runFirstPass のフレームループで同時に作る（射撃に効くバフ・CT 短縮・弾丸チャージ込み）。
 * バフの区間と倍率ダメージは、確定した射撃の列と時刻表から作る。
 */
export function planTeamRun(teamInput: TeamInput): TeamPlan {
  // Stage 9: 直接呼ばれても宝物の段階が効くように。最上位で適用済みなら何もしない（同じオブジェクト）
  const input = applyTreasureToTeam(teamInput);
  const { slots, enemy, model } = input;
  validateTeamSlots(slots);
  validateControlledSlot(slots, input.controlledSlot);
  const frames = durationToFrames(input.durationSeconds);
  const timelineSlots = toTimelineSlots(slots);
  const untargetable = untargetableRanges(enemy.events, frames);
  // Stage 18-C: 条件が自動の枠の着地点（敵の出来事だけで決まるので、射撃より前に決まる）
  const landing = planLandings(slots, enemy, frames, resolvePassiveStates(timelineSlots));
  const { shots, schedule, instants } = runFirstPass(timelineSlots, {
    frames,
    model,
    burst: input.burst ?? false,
    burstModel: input.burstModel ?? 'dynamic',
    controlledSlot: input.controlledSlot ?? null,
    untargetable,
    hitRates: landing === null ? undefined : hitRateSpansOf(landing, slots.length),
  });
  const timeline = planBuffTimeline(timelineSlots, schedule, frames, shots, landing);
  const skillHits = planSkillHits(slots, enemy, timeline, schedule, frames, shots);
  return { frames, shots, schedule, timeline, skillHits, instants, untargetable, landing };
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
): SkillHitEvent[] {
  const hits: SkillHitEvent[] = [];
  slots.forEach((slot, slotIndex) => {
    const definition = slot?.skills?.definition;
    if (!slot || !definition) return;
    const levels = slot.skills?.levels ?? MAX_SKILL_LEVELS;
    const push = (frame: number, effect: ResolvedDamageEffect, pre: boolean): void => {
      const state = burstSnapshotState(timeline, frame, slotIndex, pre);
      const trigger = computeTriggerDamage({
        character: slot.character,
        growth: slot.growth,
        enemy,
        attackOverride: slot.attackOverride,
        buffs: state.buffs,
        condition: { ...slot.condition, fullBurst: false },
      });
      // フルバースト補正はフルバースト中に出た倍率ダメージにだけ乗る（2026-09-23 実測）
      const fullBurst = SKILL_HIT_FULL_BURST_BONUS && schedule !== null && isInFullBurst(schedule, frame);
      const hit = computeSkillHit([effect], slot.character, enemy, trigger, state.buffs, fullBurst);
      hits.push({ frame, slotIndex, effect, hit });
    };
    for (const effect of resolveDamageEffects(definition, slot.character, levels)) {
      const pre = isBurstUseTrigger(effect.trigger) && BURST_HIT_USES_PRE_ACTIVATION_BUFFS;
      for (const frame of triggerFrames(effect.trigger, schedule, slotIndex, frames, shots)) push(frame, effect, pre);
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
 * バーストヒットに「発動直前」のバフを使うか。false なら発動フレームの区間（その発動で付くバフ込み）を使う。
 * **2026-09-22 の射撃場実測で true と確定**（plan/verification.md Stage 6 節、録画 18）:
 * ラピのバーストは自分に攻撃力 +60.75%（10 秒）を付けるが、そのバーストのダメージは 208,131 × 3 = 624,393 で
 * 素の攻撃力基準だった（バフ込みなら 1 発 334,704 になるはず）。
 */
export const BURST_HIT_USES_PRE_ACTIVATION_BUFFS = true;
