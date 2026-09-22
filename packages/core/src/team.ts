// Stage 3: 5 人編成の合算。Stage 4 で常時発動パッシブ（自分・味方全体）を枠間で配ってから computeDamage に渡すようにした。
// Stage 5: 固定 20 秒サイクルのバースト（burst: true）を「通常区間 / フルバースト区間」の 2 区間の期待値と、
// サイクルごとのバーストスキルダメージで足す。
// Stage 6: 持続バフ（timed）を skills/timeline.ts の区間分割に載せた。calc は「同じバフ状態の区間」をまとめた
// グループ単位で computeDamage を呼ぶ。timed 効果がなければグループは 2 つに退化し、Stage 5 と同じ計算になる。
// Stage 7: burst の時刻表を動的サイクル（ゲージ蓄積・CT・チェーン。burst/dynamic.ts）にした。固定 20 秒サイクルは burstModel: 'fixed'。
// sim（sim/engine.ts）とは時刻表・区間・式をすべて共有し、違いは「発射をフレームで数えるか、平均レートで置くか」だけ。
import { durationToFrames, planFixedCycle } from './burst/fixedCycle.ts';
import { planDynamicSchedule } from './burst/dynamic.ts';
import {
  activationFramesOfSlot,
  summarizeSchedule,
  type BurstSchedule,
  type BurstScheduleModel,
  type BurstSummary,
} from './burst/schedule.ts';
import {
  baseAttackOf,
  computeDamage,
  computeTriggerDamage,
  modelNotes,
  type EnemyInput,
  type ModelNote,
  type TriggerCondition,
  type TriggerDamage,
} from './damage.ts';
import { computeCadence, type CadenceResult } from './cadence.ts';
import { slotBurstHit, type BurstHitResult } from './skills/burstDamage.ts';
import type { BuffTotals } from './skills/buffs.ts';
import { MAX_SKILL_LEVELS, type AppliedEffect, type AppliedTimedEffect, type SkillLevels } from './skills/resolve.ts';
import {
  EMPTY_BUFF_STATE,
  groupTimeline,
  mergeAdjacentRanges,
  planBuffTimeline,
  resolvePassiveStates,
  segmentIndexAt,
  type BuffTimeline,
  type BuffWindow,
  type SlotBuffState,
  type TimelineSlot,
} from './skills/timeline.ts';
import { SKILL_SLOTS, type SkillDefinition, type SkillSlot, type SkillSupport } from './skills/types.ts';
import type { GrowthInput } from './stats.ts';
import type { CharacterData } from './types.ts';
import { FPS, type WeaponModel } from './weapons.ts';

export const TEAM_SIZE = 5;

/** 枠ごとの条件。戦闘時間とフルバースト区間の別は編成側で決めるので含まない */
export type SlotCondition = Omit<TriggerCondition, 'fullBurst'>;

export type TeamSlotSkills = {
  /** null = 定義ファイルなし（未定義）。自分のスキルは発動しないが、味方からの allies 効果は受ける */
  definition: SkillDefinition | null;
  levels: SkillLevels;
};

export type TeamSlotInput = {
  character: CharacterData;
  growth: GrowthInput;
  condition: SlotCondition;
  /** 戦闘中の攻撃力（バフ前）を直接指定する（射撃場スペック固定など）。指定時は growth からの算出をしない */
  attackOverride?: number;
  /** 省略は { definition: null, levels: 全部 10 } と同じ（自分のスキルなし、味方の効果は受ける） */
  skills?: TeamSlotSkills;
};

export type TeamInput = {
  /** 長さ 1..TEAM_SIZE。null は空枠 */
  slots: (TeamSlotInput | null)[];
  enemy: EnemyInput;
  durationSeconds: number;
  model?: WeaponModel;
  /** バーストを回すか。省略 false = Stage 4 と同一（バーストなし・フルバーストなし） */
  burst?: boolean;
  /**
   * burst が true のときの時刻表の作り方。省略 'dynamic'（ゲージ蓄積・CT・チェーン。Stage 7）。
   * 'fixed' は Stage 5 / 6 の固定 20 秒サイクル（比較・退化テスト用。UI には出さない）
   */
  burstModel?: BurstScheduleModel;
};

export type { AppliedEffect, AppliedTimedEffect };

/** 1 つのバフ状態でいた区間の結果。calc はグループ単位、sim は区間単位で埋める */
export type SlotSegmentResult = {
  /** 含まれる区間 [start, end) の列（フレーム）。グループは離れた複数区間を含みうる */
  ranges: { start: number; end: number }[];
  seconds: number;
  fullBurst: boolean;
  buffs: BuffTotals;
  passiveEffects: AppliedEffect[];
  timedEffects: AppliedTimedEffect[];
  trigger: TriggerDamage;
  /** calc: triggersPerSecond × seconds（小数） / sim: 実際に撃った数（整数） */
  triggers: number;
  damage: number;
};

export type SlotBurstResult = {
  /** 発動ごとの内訳（時刻は秒）。定義がない・unsupported・倍率ダメージなしなら空 */
  activations: { seconds: number; hit: BurstHitResult }[];
  /** 1 回目の内訳（UI の代表値）。定義がない・unsupported・倍率ダメージなしなら null */
  hit: BurstHitResult | null;
  totalDamage: number;
};

export type TeamSlotResult = {
  /** slots 内の位置 */
  index: number;
  character: CharacterData;
  /** バフ前の攻撃力（素、またはスペック固定値）。区間に依らない */
  baseAttack: number;
  /** 発射サイクル。Stage 6 では弾数・リロードのバフがないので区間に依らない */
  cadence: CadenceResult;
  notes: ModelNote[];
  /** 常時パッシブだけのバフ合計（Stage 4 互換の表示用） */
  passiveBuffs: BuffTotals;
  passiveEffects: AppliedEffect[];
  /** この枠に掛かった持続バフの窓（発生順） */
  windows: BuffWindow[];
  /** バフ状態ごとにまとめた通常攻撃の結果（groupTimeline の順） */
  segments: SlotSegmentResult[];
  /** Σ segments.damage */
  normalDamage: number;
  burst: SlotBurstResult;
  /** normalDamage + burst.totalDamage */
  totalDamage: number;
  /** totalDamage / durationSeconds（0 秒なら 0） */
  dps: number;
  /** 編成の総ダメージに対する寄与率 0..1（合計 0 のときは 0） */
  share: number;
  /** null = 定義ファイルなし（未定義） */
  skillSupport: Record<SkillSlot, SkillSupport> | null;
};

export type TeamResult = {
  slots: (TeamSlotResult | null)[];
  filledCount: number;
  totalDps: number;
  totalDamage: number;
  /** burst なしなら null */
  schedule: BurstSchedule | null;
  /** 時刻表の集計（フルバースト回数・稼働率・平均サイクル）。burst なしなら null */
  burstSummary: BurstSummary | null;
  timeline: BuffTimeline;
};

/** 枠数と重複を検証する。sim と calc で共通 */
export function validateTeamSlots(slots: readonly (TeamSlotInput | null)[]): void {
  if (slots.length < 1 || slots.length > TEAM_SIZE) {
    throw new RangeError(`slots must have 1..${TEAM_SIZE} entries, got ${slots.length}`);
  }
  const seen = new Set<number>();
  for (const slot of slots) {
    if (slot === null) continue;
    const id = slot.character.resourceId;
    if (seen.has(id)) throw new RangeError(`character ${id} appears in more than one slot`);
    seen.add(id);
  }
}

/** TeamSlotInput を timeline.ts の入力に落とす（sim と calc で共通） */
export function toTimelineSlots(slots: readonly (TeamSlotInput | null)[]): TimelineSlot[] {
  return slots.map((slot) =>
    slot === null
      ? null
      : {
          character: slot.character,
          definition: slot.skills?.definition ?? null,
          levels: slot.skills?.levels ?? MAX_SKILL_LEVELS,
          // 循環参照を避けるため、発動者自身のバフは乗せない値（バフ前攻撃力）を使う
          casterBaseAttack: baseAttackOf(slot),
        },
  );
}

export type SlotBuffs = { buffs: BuffTotals; appliedEffects: AppliedEffect[] };

/**
 * 常時発動パッシブを枠間で配り、枠ごとの BuffTotals を作る（Stage 4 の API。持続バフは含まない）。
 * 中身は skills/timeline.ts の resolvePassiveStates に移した。
 */
export function resolveTeamBuffs(slots: readonly (TeamSlotInput | null)[]): (SlotBuffs | null)[] {
  return resolvePassiveStates(toTimelineSlots(slots)).map((state) =>
    state === null ? null : { buffs: state.buffs, appliedEffects: state.passiveEffects },
  );
}

/** バーストの時刻表（sim と calc で共通）。burst が false なら null */
export function planTeamSchedule(
  slots: readonly (TeamSlotInput | null)[],
  frames: number,
  burst: boolean | undefined,
  burstModel: BurstScheduleModel = 'dynamic',
  model?: WeaponModel,
): BurstSchedule | null {
  if (!burst) return null;
  if (burstModel === 'fixed') {
    return planFixedCycle(
      slots.map((s) => (s === null ? null : { burstStep: s.character.burstStep })),
      frames,
    );
  }
  return planDynamicSchedule(slots, frames, model);
}

function skillSupportOf(slot: TeamSlotInput): Record<SkillSlot, SkillSupport> | null {
  const definition = slot.skills?.definition;
  if (!definition) return null;
  const support = {} as Record<SkillSlot, SkillSupport>;
  for (const s of SKILL_SLOTS) support[s] = definition.skills[s].support;
  return support;
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

export function computeTeamDamage(input: TeamInput): TeamResult {
  const { slots, enemy, durationSeconds, model } = input;
  validateTeamSlots(slots);
  if (durationSeconds < 0) throw new RangeError('durationSeconds must be >= 0');

  const frames = durationToFrames(durationSeconds);
  const schedule = planTeamSchedule(slots, frames, input.burst, input.burstModel, model);
  const timelineSlots = toTimelineSlots(slots);
  const timeline = planBuffTimeline(timelineSlots, schedule, frames);

  const computed = slots.map((slot, index) => {
    if (slot === null) return null;
    const base = {
      character: slot.character,
      growth: slot.growth,
      enemy,
      model,
      attackOverride: slot.attackOverride,
    };
    const passive = timeline.passive[index] ?? EMPTY_BUFF_STATE;

    const segments: SlotSegmentResult[] = [];
    let normalDamage = 0;
    for (const group of groupTimeline(timeline, index)) {
      const state = group.state;
      const result = computeDamage({
        ...base,
        buffs: state.buffs,
        condition: { ...slot.condition, fullBurst: group.fullBurst, durationSeconds: group.seconds },
      });
      segments.push({
        ranges: mergeAdjacentRanges(group.segments.map((s) => ({ start: s.start, end: s.end }))),
        seconds: group.seconds,
        fullBurst: group.fullBurst,
        buffs: state.buffs,
        passiveEffects: state.passiveEffects,
        timedEffects: state.timedEffects,
        trigger: result,
        triggers: result.cadence.triggersPerSecond * group.seconds,
        damage: result.totalDamage,
      });
      normalDamage += result.totalDamage;
    }

    // バーストスキルは発動ごとに（その時点のバフで）計算する。撃つのは時刻表でこの枠が発動したフレームだけ
    const activations: { seconds: number; hit: BurstHitResult }[] = [];
    let burstDamage = 0;
    if (schedule !== null) {
      for (const frame of activationFramesOfSlot(schedule, index)) {
        const state = burstSnapshotState(timeline, frame, index, BURST_HIT_USES_PRE_ACTIVATION_BUFFS);
        const trigger = computeTriggerDamage({
          ...base,
          buffs: state.buffs,
          condition: { ...slot.condition, fullBurst: false },
        });
        const hit = slotBurstHit(
          slot.skills?.definition,
          slot.skills?.levels ?? MAX_SKILL_LEVELS,
          slot.character,
          enemy,
          trigger,
          state.buffs,
        );
        if (hit === null) break;
        activations.push({ seconds: frame / FPS, hit });
        burstDamage += hit.perActivation;
      }
    }
    // 代表値（1 発動の内訳）は割当に関係なく出す。UI で「1 発動 X × 0 回」と見せられるようにする
    const representative =
      activations[0]?.hit ??
      slotBurstHit(
        slot.skills?.definition,
        slot.skills?.levels ?? MAX_SKILL_LEVELS,
        slot.character,
        enemy,
        computeTriggerDamage({ ...base, buffs: passive.buffs, condition: { ...slot.condition, fullBurst: false } }),
        passive.buffs,
      );

    const totalDamage = normalDamage + burstDamage;
    return {
      index,
      character: slot.character,
      baseAttack: baseAttackOf(slot),
      cadence: computeCadence(slot.character.shot, model),
      notes: modelNotes(slot.character.shot),
      passiveBuffs: passive.buffs,
      passiveEffects: passive.passiveEffects,
      windows: timeline.windows.filter((w) => w.slotIndex === index),
      segments,
      normalDamage,
      burst: { activations, hit: representative, totalDamage: burstDamage },
      totalDamage,
      dps: durationSeconds > 0 ? totalDamage / durationSeconds : 0,
      skillSupport: skillSupportOf(slot),
    };
  });

  // 枠 0 から順に加算する（加算順を固定し、個別計算の和と一致させる）
  let totalDps = 0;
  let totalDamage = 0;
  let filledCount = 0;
  for (const c of computed) {
    if (c === null) continue;
    totalDps += c.dps;
    totalDamage += c.totalDamage;
    filledCount += 1;
  }

  return {
    slots: computed.map((c) =>
      c === null ? null : { ...c, share: totalDamage > 0 ? c.totalDamage / totalDamage : 0 },
    ),
    filledCount,
    totalDps,
    totalDamage,
    schedule,
    burstSummary: schedule === null ? null : summarizeSchedule(schedule, frames),
    timeline,
  };
}
