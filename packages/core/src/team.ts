// Stage 3: 5 人編成の合算。各枠に Stage 2 の computeDamage を適用して足すだけで、味方間の相互作用（スキル・バフ）は扱わない。
import { computeDamage, type ConditionInput, type DamageResult, type EnemyInput } from './damage.ts';
import type { GrowthInput } from './stats.ts';
import type { CharacterData } from './types.ts';
import type { WeaponModel } from './weapons.ts';

export const TEAM_SIZE = 5;

/** 枠ごとの条件。戦闘時間は編成共通なので含まない */
export type SlotCondition = Omit<ConditionInput, 'durationSeconds'>;

export type TeamSlotInput = {
  character: CharacterData;
  growth: GrowthInput;
  condition: SlotCondition;
  /** 戦闘中の攻撃力を直接指定する（射撃場スペック固定など）。指定時は growth からの算出をしない */
  attackOverride?: number;
};

export type TeamInput = {
  /** 長さ 1..TEAM_SIZE。null は空枠 */
  slots: (TeamSlotInput | null)[];
  enemy: EnemyInput;
  durationSeconds: number;
  model?: WeaponModel;
};

export type TeamSlotResult = {
  /** slots 内の位置 */
  index: number;
  character: CharacterData;
  result: DamageResult;
  /** 編成の総ダメージに対する寄与率 0..1（合計 0 のときは 0） */
  share: number;
};

export type TeamResult = {
  slots: (TeamSlotResult | null)[];
  filledCount: number;
  totalDps: number;
  totalDamage: number;
};

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

  const computed = slots.map((slot, index) => {
    if (slot === null) return null;
    const result = computeDamage({
      character: slot.character,
      growth: slot.growth,
      enemy,
      condition: { ...slot.condition, durationSeconds },
      model,
      attackOverride: slot.attackOverride,
    });
    return { index, character: slot.character, result };
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
