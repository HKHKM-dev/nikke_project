// Stage 5: バーストスロットの倍率ダメージ（burstDamage）を Lv の数値に解決し、1 発動あたりの期待ダメージを出す。
// 式（2026-09-22 の射撃場実測で確認。plan/design-stage5.md 1 節、plan/verification.md Stage 5 節）:
//   burstHit = max(1, 攻撃力(バフ後) − 防御力) × X/100 × (1 + 会心期待値 [+ 0.5]) × (1 + Σ attackDamage) × 属性有利
// 武器倍率・チャージ倍率・コア・距離は掛けない。
import type { EnemyInput, TriggerDamage } from '../damage.ts';
import { FULL_BURST_BOOST } from '../damage.ts';
import { elementMultiplier } from '../element.ts';
import type { CharacterData, LocalizedText } from '../types.ts';
import { applyCritBuffs, type BuffTotals } from './buffs.ts';
import { skillValue, type SkillLevels } from './resolve.ts';
import type { BurstDamageType, SkillDefinition } from './types.ts';

/**
 * バースト発動時の即時ダメージにフルバースト補正 +0.5 を乗せるか。
 * **2026-09-22 の射撃場実測で「乗せない」と確定**（plan/verification.md Stage 5 節、録画 18・19）:
 * ラピのバースト 657.72% が 208,131 × 3 = 624,393 =（素の攻撃力 − 防御）× 6.5772、
 * ノワールのバースト 351.64% が 480,611 =（バフ後 136,777 − 100）× 3.5164 で、どちらも +0.5 が乗っていない。
 * コア・距離も乗らないことを同時に確認した。
 */
export const BURST_SKILL_FULL_BURST_BONUS = false;

export type ResolvedBurstDamage = {
  source: { resourceId: number; skill: 'burst'; name: LocalizedText };
  damageType: BurstDamageType;
  /** X/100。3.5164 など */
  multiplier: number;
  assumes?: LocalizedText;
};

/** burst スロットの burstDamage 効果を Lv の数値に解決する。unsupported・効果なしなら空 */
export function resolveBurstDamage(
  def: SkillDefinition,
  character: CharacterData,
  levels: SkillLevels,
): ResolvedBurstDamage[] {
  if (def.resourceId !== character.resourceId) {
    throw new RangeError(`skill definition is for ${def.resourceId}, character is ${character.resourceId}`);
  }
  const entry = def.skills.burst;
  if (entry.support === 'unsupported') return [];
  const skill = character.skills.burst;
  const resolved: ResolvedBurstDamage[] = [];
  for (const effect of entry.effects) {
    if (effect.kind !== 'burstDamage') continue;
    const r: ResolvedBurstDamage = {
      source: { resourceId: character.resourceId, skill: 'burst', name: skill.name },
      damageType: effect.damageType,
      multiplier: skillValue(skill, effect.ref, levels.burst) / 100,
    };
    if (effect.assumes) r.assumes = effect.assumes;
    resolved.push(r);
  }
  return resolved;
}

export type BurstHitInput = {
  /** バフ後の攻撃力 */
  attack: number;
  enemy: EnemyInput;
  /** バフ後の会心 */
  crit: CharacterData['crit'];
  attackDamageMultiplier: number;
  elementMultiplier: number;
  effects: readonly ResolvedBurstDamage[];
  /** 省略時は BURST_SKILL_FULL_BURST_BONUS */
  fullBurstBonus?: boolean;
};

export type BurstHitResult = {
  /** max(1, 攻撃力 − 防御力) */
  baseHit: number;
  /** 効果の倍率の合計（X/100 の和） */
  multiplier: number;
  /** 1 + 会心期待値 + フルバースト補正（乗せる設定のときだけ 0.5）。コア・距離は入らない */
  boost: { crit: number; fullBurst: number; total: number };
  attackDamageMultiplier: number;
  elementMultiplier: number;
  /** 効果ごとの 1 発動あたり期待ダメージ */
  perEffect: { effect: ResolvedBurstDamage; expected: number }[];
  /** 1 発動あたりの合計 */
  perActivation: number;
};

export function computeBurstHit(input: BurstHitInput): BurstHitResult {
  const fullBurstBonus = input.fullBurstBonus ?? BURST_SKILL_FULL_BURST_BONUS;
  const baseHit = Math.max(1, input.attack - input.enemy.defence);
  const boostCrit = input.crit.rate * (input.crit.damage - 1);
  const boostFullBurst = fullBurstBonus ? FULL_BURST_BOOST : 0;
  const boostTotal = 1 + boostCrit + boostFullBurst;
  const common = baseHit * boostTotal * input.attackDamageMultiplier * input.elementMultiplier;
  const perEffect = input.effects.map((effect) => ({ effect, expected: common * effect.multiplier }));
  let multiplier = 0;
  let perActivation = 0;
  for (const p of perEffect) {
    multiplier += p.effect.multiplier;
    perActivation += p.expected;
  }
  return {
    baseHit,
    multiplier,
    boost: { crit: boostCrit, fullBurst: boostFullBurst, total: boostTotal },
    attackDamageMultiplier: input.attackDamageMultiplier,
    elementMultiplier: input.elementMultiplier,
    perEffect,
    perActivation,
  };
}

/**
 * 枠のバーストヒット。定義がない・unsupported・倍率ダメージなしなら null。
 * 攻撃力・会心・攻撃ダメージは通常攻撃と同じバフ後の値（trigger / buffs）を使う。
 */
export function slotBurstHit(
  definition: SkillDefinition | null | undefined,
  levels: SkillLevels,
  character: CharacterData,
  enemy: EnemyInput,
  trigger: Pick<TriggerDamage, 'attack' | 'attackDamageMultiplier'>,
  buffs: BuffTotals,
): BurstHitResult | null {
  if (!definition) return null;
  const effects = resolveBurstDamage(definition, character, levels);
  if (effects.length === 0) return null;
  return computeBurstHit({
    attack: trigger.attack,
    enemy,
    crit: applyCritBuffs(character.crit, buffs),
    attackDamageMultiplier: trigger.attackDamageMultiplier,
    elementMultiplier: elementMultiplier(character.element, enemy.element),
    effects,
  });
}
