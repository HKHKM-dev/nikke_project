// Stage 3: 5 人編成の合算。Stage 4 で常時発動パッシブ（自分・味方全体）を枠間で配ってから computeDamage に渡すようにした。
// Stage 5: 固定 20 秒サイクルのバースト（burst: true）を「通常区間 / フルバースト区間」の 2 区間の期待値と、
// サイクルごとのバーストスキルダメージで足す。sim（sim/engine.ts）の期待値モデルで、時刻表・式は sim と共有する。
import { planFixedCycle, durationToFrames, type FixedCycleSchedule } from './burst/fixedCycle.ts';
import {
  baseAttackOf,
  computeDamage,
  type ConditionInput,
  type DamageResult,
  type EnemyInput,
  type TriggerCondition,
} from './damage.ts';
import { slotBurstHit, type BurstHitResult } from './skills/burstDamage.ts';
import { ZERO_BUFFS, applyResolvedEffect, type BuffTotals } from './skills/buffs.ts';
import { MAX_SKILL_LEVELS, resolvePassives, type ResolvedEffect, type SkillLevels } from './skills/resolve.ts';
import { isEffectTarget } from './skills/targets.ts';
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
  /** 固定 20 秒サイクルのバーストを回すか。省略 false = Stage 4 と同一（バーストなし・フルバーストなし） */
  burst?: boolean;
};

export type AppliedEffect = ResolvedEffect & {
  /** 発動元の枠（slots 内の位置） */
  sourceSlotIndex: number;
  /** 実際に BuffTotals へ足した量。ratio なら value そのもの（0.1535）、casterAttack なら攻撃力の実数 */
  appliedAmount: number;
};

export type SlotBurstResult = {
  /** 発動時刻（秒）。schedule.activationFrames / 60 */
  activations: number[];
  /** 1 発動あたりの内訳。定義がない・unsupported・倍率ダメージなしなら null */
  hit: BurstHitResult | null;
  /** activations.length × hit.perActivation */
  totalDamage: number;
};

export type TeamSlotResult = {
  /** slots 内の位置 */
  index: number;
  character: CharacterData;
  /** 通常区間の通常攻撃（burst なしなら戦闘時間すべて）。durationSeconds = duration − フルバースト時間 */
  result: DamageResult;
  /** フルバースト区間の通常攻撃（fullBurst: true）。burst なしなら null */
  fullBurstResult: DamageResult | null;
  burst: SlotBurstResult;
  /** 通常攻撃（両区間）+ バーストスキル */
  totalDamage: number;
  /** totalDamage / durationSeconds（0 秒なら 0） */
  dps: number;
  /** 編成の総ダメージに対する寄与率 0..1（合計 0 のときは 0） */
  share: number;
  /** この枠が受けたバフの合計 */
  buffs: BuffTotals;
  /** この枠に掛かった効果（発動元の枠順） */
  appliedEffects: AppliedEffect[];
  /** null = 定義ファイルなし（未定義） */
  skillSupport: Record<SkillSlot, SkillSupport> | null;
};

export type TeamResult = {
  slots: (TeamSlotResult | null)[];
  filledCount: number;
  totalDps: number;
  totalDamage: number;
  /** burst なしなら null */
  schedule: FixedCycleSchedule | null;
};

type Source = { slotIndex: number; casterBaseAttack: number; effect: ResolvedEffect };

/** 全枠の常時効果を発動元の枠順に集める。発動者基準の固定加算に使うバフ前攻撃力も添える */
function collectPassiveSources(slots: readonly (TeamSlotInput | null)[]): Source[] {
  const sources: Source[] = [];
  slots.forEach((slot, slotIndex) => {
    if (slot === null || !slot.skills?.definition) return;
    // 循環参照を避けるため、発動者自身のバフは乗せない
    const casterBaseAttack = baseAttackOf(slot);
    for (const effect of resolvePassives(slot.skills.definition, slot.character, slot.skills.levels)) {
      sources.push({ slotIndex, casterBaseAttack, effect });
    }
  });
  return sources;
}

export type SlotBuffs = { buffs: BuffTotals; appliedEffects: AppliedEffect[] };

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

/**
 * 常時発動パッシブを枠間で配り、枠ごとの BuffTotals を作る（純関数。sim と calc で共通）。
 * 自分の self 効果 + 全枠（自分を含む）の allies 効果。空枠は null
 */
export function resolveTeamBuffs(slots: readonly (TeamSlotInput | null)[]): (SlotBuffs | null)[] {
  const sources = collectPassiveSources(slots);
  return slots.map((slot, index) => {
    if (slot === null) return null;
    let buffs: BuffTotals = { ...ZERO_BUFFS };
    const appliedEffects: AppliedEffect[] = [];
    for (const { slotIndex, casterBaseAttack, effect } of sources) {
      if (!isEffectTarget(effect.target, slotIndex, index)) continue;
      const applied = applyResolvedEffect(buffs, effect, casterBaseAttack);
      buffs = applied.totals;
      appliedEffects.push({ ...effect, sourceSlotIndex: slotIndex, appliedAmount: applied.appliedAmount });
    }
    return { buffs, appliedEffects };
  });
}

function skillSupportOf(slot: TeamSlotInput): Record<SkillSlot, SkillSupport> | null {
  const definition = slot.skills?.definition;
  if (!definition) return null;
  const support = {} as Record<SkillSlot, SkillSupport>;
  for (const s of SKILL_SLOTS) support[s] = definition.skills[s].support;
  return support;
}

export function computeTeamDamage(input: TeamInput): TeamResult {
  const { slots, enemy, durationSeconds, model } = input;
  validateTeamSlots(slots);
  if (durationSeconds < 0) throw new RangeError('durationSeconds must be >= 0');

  const schedule = input.burst
    ? planFixedCycle(
        slots.map((s) => (s === null ? null : { burstStep: s.character.burstStep })),
        durationToFrames(durationSeconds),
      )
    : null;
  const fullBurstSeconds = schedule === null ? 0 : schedule.fullBurstFramesTotal / FPS;
  const normalSeconds = Math.max(0, durationSeconds - fullBurstSeconds);
  const activationSeconds = schedule === null ? [] : schedule.activationFrames.map((f) => f / FPS);
  const teamBuffs = resolveTeamBuffs(slots);

  const computed = slots.map((slot, index) => {
    if (slot === null) return null;
    const { buffs, appliedEffects } = teamBuffs[index]!;
    const base = {
      character: slot.character,
      growth: slot.growth,
      enemy,
      model,
      attackOverride: slot.attackOverride,
      buffs,
    };
    const normalCondition: ConditionInput = { ...slot.condition, fullBurst: false, durationSeconds: normalSeconds };
    const result = computeDamage({ ...base, condition: normalCondition });
    const fullBurstResult =
      schedule === null
        ? null
        : computeDamage({
            ...base,
            condition: { ...slot.condition, fullBurst: true, durationSeconds: fullBurstSeconds },
          });
    const hit = slotBurstHit(
      slot.skills?.definition,
      slot.skills?.levels ?? MAX_SKILL_LEVELS,
      slot.character,
      enemy,
      result,
      buffs,
    );
    const assigned = schedule !== null && Object.values(schedule.assignment).includes(index);
    const activations = hit !== null && assigned ? activationSeconds : [];
    const burst: SlotBurstResult = {
      activations,
      hit,
      totalDamage: hit === null ? 0 : activations.length * hit.perActivation,
    };
    const totalDamage = result.totalDamage + (fullBurstResult?.totalDamage ?? 0) + burst.totalDamage;
    return {
      index,
      character: slot.character,
      result,
      fullBurstResult,
      burst,
      totalDamage,
      dps: durationSeconds > 0 ? totalDamage / durationSeconds : 0,
      buffs,
      appliedEffects,
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
  };
}
