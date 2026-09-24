// Stage 3: 5 人編成の合算。Stage 4 で常時発動パッシブ（自分・味方全体）を枠間で配ってから computeDamage に渡すようにした。
// Stage 5: 固定 20 秒サイクルのバースト（burst: true）を「通常区間 / フルバースト区間」の 2 区間の期待値と、
// サイクルごとのバーストスキルダメージで足す。
// Stage 6: 持続バフ（timed）を skills/timeline.ts の区間分割に載せた。calc は「同じバフ状態の区間」をまとめた
// グループ単位で computeDamage を呼ぶ。timed 効果がなければグループは 2 つに退化し、Stage 5 と同じ計算になる。
// Stage 7: burst の時刻表を動的サイクル（ゲージ蓄積・CT・チェーン。burst/dynamic.ts）にした。固定 20 秒サイクルは burstModel: 'fixed'。
// sim（sim/engine.ts）とは時刻表・区間・式をすべて共有し、違いは「発射をフレームで数えるか、平均レートで置くか」だけ。
// Stage 8: 1 パス目（射撃の列 → 時刻表 → バフの区間 → 倍率ダメージの発動）を planTeamRun にまとめ、sim と calc が同じものを使う。
// 射撃の回数トリガーの窓と倍率ダメージ（damage）の発動は sim と厳密一致し、calc が期待値で置くのは通常攻撃のトリガー数だけ。
// Stage 9: 宝物の段階（skills.treasurePhase）を、最上位で applyTreasureToTeam により基礎版 → 宝物版に差し替えてから計算する。
// Stage 10: 射撃に効くバフと CT 短縮で射撃の列と時刻表が循環するので、1 パス目の射撃の列と時刻表は sim/firstPass.ts の
// フレームループで作る。バフの区間と倍率ダメージは Stage 8 のまま、確定した射撃の列と時刻表から作る。
import { durationToFrames, planFixedCycle } from './burst/fixedCycle.ts';
import { planDynamicSchedule, type DynamicScheduleOptions } from './burst/dynamic.ts';
import {
  activationFramesOfSlot,
  isInFullBurst,
  summarizeSchedule,
  type BurstSchedule,
  type BurstScheduleModel,
  type BurstSummary,
} from './burst/schedule.ts';
import { runFirstPass, type InstantApplication } from './sim/firstPass.ts';
import type { ShotLog } from './sim/shots.ts';
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
import {
  SKILL_HIT_FULL_BURST_BONUS,
  computeSkillHit,
  resolveDamageEffects,
  resolvePerShotDamage,
  slotBurstHit,
  type BurstHitResult,
  type ResolvedDamageEffect,
  type ResolvedSkillDamage,
  type SkillHitResult,
} from './skills/burstDamage.ts';
import { cycleFires, cycleShotFrames, resolveCycles, type CycleWindow } from './skills/cycles.ts';
import type { BuffTotals } from './skills/buffs.ts';
import type { BuildEffect } from './buildEffects.ts';
import {
  MAX_SKILL_LEVELS,
  isResolvedEventCount,
  type AppliedEffect,
  type AppliedTimedEffect,
  type ResolvedTrigger,
  type SkillLevels,
} from './skills/resolve.ts';
import {
  EMPTY_BUFF_STATE,
  groupTimeline,
  mergeAdjacentRanges,
  planBuffTimeline,
  resolvePassiveStates,
  segmentIndexAt,
  triggerFrames,
  type BuffTimeline,
  type BuffWindow,
  type ConditionSkip,
  type SlotBuffState,
  type TimelineSlot,
} from './skills/timeline.ts';
import { applyTreasureToTeam, treasureSlots, type TreasurePhase } from './skills/treasure.ts';
import { SKILL_SLOTS, isFiringStat, type SkillDefinition, type SkillSlot, type SkillSupport } from './skills/types.ts';
import { firingParams } from './sim/firing.ts';
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
  /**
   * Stage 9: 宝物の段階（0..3）。省略 0 = 宝物なし。character.treasure が null なら 0 だけ許す。
   * スペック固定でも上書きしない（所持状況がそのまま反映される）
   */
  treasurePhase?: TreasurePhase;
};

export type TeamSlotInput = {
  character: CharacterData;
  growth: GrowthInput;
  condition: SlotCondition;
  /** 戦闘中の攻撃力（バフ前）を直接指定する（射撃場スペック固定など）。指定時は growth からの算出をしない */
  attackOverride?: number;
  /** 省略は { definition: null, levels: 全部 10 } と同じ（自分のスキルなし、味方の効果は受ける） */
  skills?: TeamSlotSkills;
  /**
   * Stage 13: 育成入力の効果層（OL・キューブ・コレクション。resolveBuildEffects の effects）。自分だけの常時バフ。
   * 省略は無し。マスタは呼び出し側が引く（attackOverride と同じ）
   */
  buildEffects?: readonly BuildEffect[];
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
  /**
   * 操作キャラの枠（Stage 7）。チャージ武器のフルチャージ倍率がゲージに乗るのは操作キャラだけ（AI の SR は倍率なし）。
   * 省略・null は全員 AI 扱い。ダメージには影響しない（ゲージと時刻表だけ）
   */
  controlledSlot?: number | null;
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
  /** calc: triggersPerSecond × seconds（小数）か射撃の列の発数（triggerSource）/ sim: 実際に撃った数（整数） */
  triggers: number;
  /**
   * Stage 10: トリガー数の出どころ。'average' = 平均レート × 秒数（常時分の射撃バフは平均レートに畳み込む）、
   * 'shots' = 持続の射撃バフ（最大装弾数・リロード速度・チャージ速度の timed）が掛かっているので、射撃の列の発数を数えた
   */
  triggerSource: 'average' | 'shots';
  damage: number;
};

export type SlotBurstResult = {
  /** 発動ごとの内訳（時刻は秒）。定義がない・unsupported・倍率ダメージなしなら空 */
  activations: { seconds: number; hit: BurstHitResult }[];
  /** 1 回目の内訳（UI の代表値）。定義がない・unsupported・倍率ダメージなしなら null */
  hit: BurstHitResult | null;
  totalDamage: number;
};

/** Stage 8: 倍率ダメージ 1 回の発動（1 パス目で決まる。sim と calc で共通） */
export type SkillHitEvent = {
  frame: number;
  slotIndex: number;
  effect: ResolvedDamageEffect;
  hit: SkillHitResult;
};

export type SlotSkillHitsResult = {
  /** 発生順。時刻は秒 */
  activations: { seconds: number; effect: ResolvedDamageEffect; hit: SkillHitResult }[];
  totalDamage: number;
};

export type TeamSlotResult = {
  /** slots 内の位置 */
  index: number;
  character: CharacterData;
  /** バフ前の攻撃力（素、またはスペック固定値）。区間に依らない */
  baseAttack: number;
  /** 発射サイクル（平均レート）。Stage 10: 常時分の射撃バフを畳み込んだもの（持続分は含まない。表示用） */
  cadence: CadenceResult;
  notes: ModelNote[];
  /** 常時パッシブだけのバフ合計（Stage 4 互換の表示用） */
  passiveBuffs: BuffTotals;
  passiveEffects: AppliedEffect[];
  /** Stage 13: 育成入力の効果層（OL・キューブ・コレクション）。passiveBuffs に含まれている */
  buildEffects: readonly BuildEffect[];
  /** この枠に掛かった持続バフの窓（発生順） */
  windows: BuffWindow[];
  /** Stage 11 モダニア: この枠に掛かった状態だけの stat（命中率）の窓（区間には入らない。表示用） */
  stateWindows: BuffWindow[];
  /** Stage 11 モダニア: この枠の条件付きの効果が、条件を満たさずに発火しなかった記録 */
  conditionSkips: ConditionSkip[];
  /** Stage 11 紅蓮BS: この枠の循環の間隔の変更（cycleEvery）の窓（区間には入らない。表示用） */
  cycleWindows: CycleWindow[];
  /** バフ状態ごとにまとめた通常攻撃の結果（groupTimeline の順） */
  segments: SlotSegmentResult[];
  /** Σ segments.damage */
  normalDamage: number;
  burst: SlotBurstResult;
  /** Stage 8: トリガー付きの倍率ダメージ（damage）。発動ごとの内訳と合計。sim と同じ発動列 */
  skillHits: SlotSkillHitsResult;
  /** Stage 10: この枠が受けた即時効果（CT 短縮・弾丸チャージ）。発生順 */
  instants: InstantApplication[];
  /** normalDamage + burst.totalDamage + skillHits.totalDamage */
  totalDamage: number;
  /** totalDamage / durationSeconds（0 秒なら 0） */
  dps: number;
  /** 編成の総ダメージに対する寄与率 0..1（合計 0 のときは 0） */
  share: number;
  /** null = 定義ファイルなし（未定義） */
  skillSupport: Record<SkillSlot, SkillSupport> | null;
  /** Stage 9: 入力の宝物の段階（省略は 0） */
  treasurePhase: TreasurePhase;
  /** Stage 9: 宝物版で計算したスロット（unlockOrder の先頭 treasurePhase 個）。character はこれらを差し替え済み */
  treasureSlots: SkillSlot[];
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

/** 操作キャラの枠が編成の範囲内の埋まった枠か検証する。sim と calc で共通 */
export function validateControlledSlot(
  slots: readonly (TeamSlotInput | null)[],
  controlledSlot: number | null | undefined,
): void {
  if (controlledSlot === null || controlledSlot === undefined) return;
  if (!Number.isInteger(controlledSlot) || controlledSlot < 0 || controlledSlot >= slots.length) {
    throw new RangeError(`controlledSlot must be a slot index, got ${controlledSlot}`);
  }
}

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
          buildEffects: slot.buildEffects,
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
  const { shots, schedule, instants } = runFirstPass(timelineSlots, {
    frames,
    model,
    burst: input.burst ?? false,
    burstModel: input.burstModel ?? 'dynamic',
    controlledSlot: input.controlledSlot ?? null,
  });
  const timeline = planBuffTimeline(timelineSlots, schedule, frames, shots);
  const skillHits = planSkillHits(slots, enemy, timeline, schedule, frames, shots);
  return { frames, shots, schedule, timeline, skillHits, instants };
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
 * Stage 10: 射撃の列 frames（昇順）のうち、区間の列 ranges（[start, end)、昇順・重なりなし）に入る発数。
 * 区間は planBuffTimeline の [0, frames) を隙間・重なりなく覆う区間から作るので、どの射撃もちょうど 1 つの区間に入る
 */
export function countShotsInRanges(
  frames: readonly number[],
  ranges: readonly { start: number; end: number }[],
): number {
  let count = 0;
  for (const r of ranges) count += lowerBound(frames, r.end) - lowerBound(frames, r.start);
  return count;
}

/** frames の中で value 以上の最初の添字 */
function lowerBound(frames: readonly number[], value: number): number {
  let lo = 0;
  let hi = frames.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (frames[mid]! < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Stage 9: 結果に添える宝物の段階。適用前の入力（元のキャラデータ）から取る */
function treasureOf(slot: TeamSlotInput | null): { treasurePhase: TreasurePhase; treasureSlots: SkillSlot[] } {
  const treasurePhase = slot?.skills?.treasurePhase ?? 0;
  return { treasurePhase, treasureSlots: slot === null ? [] : treasureSlots(slot.character, treasurePhase) };
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

export function computeTeamDamage(teamInput: TeamInput): TeamResult {
  validateTeamSlots(teamInput.slots);
  // Stage 9: 宝物版への差し替えは最上位で 1 回だけ（planTeamRun の外でも definition と character を読むため）
  const input = applyTreasureToTeam(teamInput);
  const { slots, enemy, durationSeconds, model } = input;
  if (durationSeconds < 0) throw new RangeError('durationSeconds must be >= 0');

  const { frames, shots, schedule, timeline, skillHits, instants } = planTeamRun(input);

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
    const perShot = perShotDamageOf(slot);

    const segments: SlotSegmentResult[] = [];
    let normalDamage = 0;
    const shotFrames = shots[index]?.frames ?? [];
    for (const group of groupTimeline(timeline, index)) {
      const state = group.state;
      const ranges = mergeAdjacentRanges(group.segments.map((s) => ({ start: s.start, end: s.end })));
      const common = {
        ranges,
        seconds: group.seconds,
        fullBurst: group.fullBurst,
        buffs: state.buffs,
        passiveEffects: state.passiveEffects,
        timedEffects: state.timedEffects,
      };
      // Stage 10: 持続の射撃バフが掛かっているグループは、射撃の列の発数を数える（plan/design-stage10.md 5 節）
      if (state.timedEffects.some((e) => isFiringStat(e.stat))) {
        const trigger = computeTriggerDamage({
          ...base,
          buffs: state.buffs,
          perShot,
          condition: { ...slot.condition, fullBurst: group.fullBurst },
        });
        const triggers = countShotsInRanges(shotFrames, ranges);
        const damage = trigger.perTrigger * triggers;
        segments.push({ ...common, trigger, triggers, triggerSource: 'shots', damage });
        normalDamage += damage;
        continue;
      }
      const result = computeDamage({
        ...base,
        buffs: state.buffs,
        perShot,
        firing: firingParams(slot.character.shot, state.buffs),
        condition: { ...slot.condition, fullBurst: group.fullBurst, durationSeconds: group.seconds },
      });
      segments.push({
        ...common,
        trigger: result,
        triggers: result.cadence.triggersPerSecond * group.seconds,
        triggerSource: 'average',
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

    // Stage 8: 倍率ダメージは 1 パス目の発動列をそのまま足す（sim と同じ値）
    const skillHitActivations: SlotSkillHitsResult['activations'] = [];
    let skillHitDamage = 0;
    for (const h of skillHits) {
      if (h.slotIndex !== index) continue;
      skillHitActivations.push({ seconds: h.frame / FPS, effect: h.effect, hit: h.hit });
      skillHitDamage += h.hit.perActivation;
    }

    const totalDamage = normalDamage + burstDamage + skillHitDamage;
    return {
      index,
      character: slot.character,
      baseAttack: baseAttackOf(slot),
      cadence: computeCadence(slot.character.shot, model, firingParams(slot.character.shot, passive.buffs)),
      notes: modelNotes(slot.character.shot),
      passiveBuffs: passive.buffs,
      passiveEffects: passive.passiveEffects,
      buildEffects: passive.buildEffects,
      windows: timeline.windows.filter((w) => w.slotIndex === index),
      stateWindows: timeline.stateWindows.filter((w) => w.slotIndex === index),
      conditionSkips: timeline.conditionSkips.filter((x) => x.sourceSlotIndex === index),
      cycleWindows: timeline.cycleWindows.filter((w) => w.slotIndex === index),
      segments,
      normalDamage,
      burst: { activations, hit: representative, totalDamage: burstDamage },
      skillHits: { activations: skillHitActivations, totalDamage: skillHitDamage },
      instants: instants.filter((x) => x.slotIndex === index),
      totalDamage,
      dps: durationSeconds > 0 ? totalDamage / durationSeconds : 0,
      skillSupport: skillSupportOf(slot),
      ...treasureOf(teamInput.slots[index] ?? null),
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
