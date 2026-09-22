// Stage 3: 5 人編成の合算。Stage 4 で常時発動パッシブ（自分・味方全体）を枠間で配ってから computeDamage に渡すようにした。
// バースト・時間変化するバフはまだ扱わない。
import { computeDamage, type ConditionInput, type DamageResult, type EnemyInput } from './damage.ts';
import { ZERO_BUFFS, addBuff, type BuffTotals } from './skills/buffs.ts';
import { resolvePassives, type ResolvedEffect, type SkillLevels } from './skills/resolve.ts';
import { SKILL_SLOTS, type SkillDefinition, type SkillSlot, type SkillSupport } from './skills/types.ts';
import { computeStat, type GrowthInput } from './stats.ts';
import type { CharacterData } from './types.ts';
import type { WeaponModel } from './weapons.ts';

export const TEAM_SIZE = 5;

/** 枠ごとの条件。戦闘時間は編成共通なので含まない */
export type SlotCondition = Omit<ConditionInput, 'durationSeconds'>;

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
};

export type AppliedEffect = ResolvedEffect & {
  /** 発動元の枠（slots 内の位置） */
  sourceSlotIndex: number;
  /** 実際に BuffTotals へ足した量。ratio なら value そのもの（0.1535）、casterAttack なら攻撃力の実数 */
  appliedAmount: number;
};

export type TeamSlotResult = {
  /** slots 内の位置 */
  index: number;
  character: CharacterData;
  result: DamageResult;
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
};

type Source = { slotIndex: number; effect: ResolvedEffect };

export function computeTeamDamage(input: TeamInput): TeamResult {
  const { slots, enemy, durationSeconds, model } = input;
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

  // 発動者基準の固定加算に使う「バフ前攻撃力」。循環参照を避けるため、発動者自身のバフは乗せない
  const baseAttacks = slots.map((slot) =>
    slot === null ? 0 : (slot.attackOverride ?? computeStat(slot.character, 'attack', slot.growth)),
  );

  // 全枠の常時効果を発動元の枠順に集める
  const sources: Source[] = [];
  slots.forEach((slot, slotIndex) => {
    const definition = slot?.skills?.definition;
    if (!slot || !definition) return;
    for (const effect of resolvePassives(definition, slot.character, slot.skills!.levels)) {
      sources.push({ slotIndex, effect });
    }
  });

  const computed = slots.map((slot, index) => {
    if (slot === null) return null;
    let buffs: BuffTotals = { ...ZERO_BUFFS };
    const appliedEffects: AppliedEffect[] = [];
    for (const { slotIndex, effect } of sources) {
      if (effect.target === 'self' && slotIndex !== index) continue;
      const appliedAmount = effect.scaling === 'casterAttack' ? baseAttacks[slotIndex]! * effect.value : effect.value;
      buffs = addBuff(buffs, effect.stat, effect.scaling, appliedAmount);
      appliedEffects.push({ ...effect, sourceSlotIndex: slotIndex, appliedAmount });
    }
    const result = computeDamage({
      character: slot.character,
      growth: slot.growth,
      enemy,
      condition: { ...slot.condition, durationSeconds },
      model,
      attackOverride: slot.attackOverride,
      buffs,
    });
    const definition = slot.skills?.definition ?? null;
    const skillSupport =
      definition === null
        ? null
        : (Object.fromEntries(SKILL_SLOTS.map((s) => [s, definition.skills[s].support])) as Record<
            SkillSlot,
            SkillSupport
          >);
    return { index, character: slot.character, result, buffs, appliedEffects, skillSupport };
  });

  // 枠 0 から順に加算する（加算順を固定し、個別計算の和と一致させる）
  let totalDps = 0;
  let totalDamage = 0;
  let filledCount = 0;
  for (const c of computed) {
    if (c === null) continue;
    totalDps += c.result.dps;
    totalDamage += c.result.totalDamage;
    filledCount += 1;
  }

  return {
    slots: computed.map((c) =>
      c === null ? null : { ...c, share: totalDamage > 0 ? c.result.totalDamage / totalDamage : 0 },
    ),
    filledCount,
    totalDps,
    totalDamage,
  };
}
