// Stage 5: バーストスロットの倍率ダメージ（burstDamage）を Lv の数値に解決し、1 発動あたりの期待ダメージを出す。
// 式（2026-09-22 の射撃場実測で確認。plan/design-stage5.md 1 節、plan/verification.md Stage 5 節）:
//   burstHit = max(1, 攻撃力(バフ後) − 防御力) × X/100 × (1 + 会心期待値 [+ 0.5]) × (1 + Σ attackDamage) × 属性有利
// 武器倍率・チャージ倍率・コア・距離は掛けない。
// Stage 8: トリガー付きの倍率ダメージ（damage。「10 回攻撃した時 X% のダメージ」など）も同じ式で計算する（computeSkillHit）。
// 分配ダメージには (1 + Σ distributedDamage) を別の乗数で掛ける（録画 21 のクイーン（真）の 1.9001 倍。plan/design-stage8.md 2.4 節）。
import type { EnemyInput, TriggerDamage } from '../damage.ts';
import { FULL_BURST_BOOST } from '../damage.ts';
import { elementMultiplier } from '../element.ts';
import type { CharacterData, LocalizedText } from '../types.ts';
import { applyCritBuffs, type BuffTotals } from './buffs.ts';
import { SKILL_SLOTS, type SkillDamageType, type SkillDefinition, type SkillSlot } from './types.ts';
import { resolveTrigger, skillValue, type ResolvedTrigger, type SkillLevels } from './resolve.ts';

/**
 * バースト発動時の即時ダメージにフルバースト補正 +0.5 を乗せるか。
 * **2026-09-22 の射撃場実測で「乗せない」と確定**（plan/verification.md Stage 5 節、録画 18・19）:
 * ラピのバースト 657.72% が 208,131 × 3 = 624,393 =（素の攻撃力 − 防御）× 6.5772、
 * ノワールのバースト 351.64% が 480,611 =（バフ後 136,777 − 100）× 3.5164 で、どちらも +0.5 が乗っていない。
 * コア・距離も乗らないことを同時に確認した。
 */
export const BURST_SKILL_FULL_BURST_BONUS = false;

/**
 * Stage 8: バースト以外の倍率ダメージ（damage）が**フルバースト中に出たとき**、フルバースト補正 +0.5 を乗せるか。
 * **2026-09-23 の射撃場実測で「乗せる」と確定**（plan/verification.md Stage 8 節、録画 36〜38）:
 * ドレイク S2 は通常時 118,059 = (攻撃力 − 防御力) × 98.55%、フルバースト中 409,932 で、どちらもペレットとの比が 4.5987 と同じ
 * （ペレットの倍率グループは 1.0 → 1.5）。イサベルの段階 2 の追加ダメージ 758,766 = 299.7% × 1.5 × 受けるダメージ 1.3996。
 * バーストスキルダメージ（burstDamage）には乗らない（BURST_SKILL_FULL_BURST_BONUS）のと違う。
 */
export const SKILL_HIT_FULL_BURST_BONUS = true;

/** 解決済みの倍率ダメージ 1 件。burstDamage（burst スロット）と damage（Stage 8）で共通 */
export type ResolvedSkillDamage = {
  source: { resourceId: number; skill: SkillSlot; name: LocalizedText };
  damageType: SkillDamageType;
  /** X/100。3.5164 など */
  multiplier: number;
  assumes?: LocalizedText;
};

export type ResolvedBurstDamage = ResolvedSkillDamage;

/** Stage 8: トリガー付きの倍率ダメージ。いつ出るかが付いた形 */
export type ResolvedDamageEffect = ResolvedSkillDamage & {
  trigger: ResolvedTrigger;
  /** 同じスロットの何番目の効果か（表示・識別用） */
  effectIndex: number;
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

/** Stage 8: 定義の各 damage 効果を Lv の数値に解決する。support が 'unsupported' のスキルは空 */
export function resolveDamageEffects(
  def: SkillDefinition,
  character: CharacterData,
  levels: SkillLevels,
): ResolvedDamageEffect[] {
  if (def.resourceId !== character.resourceId) {
    throw new RangeError(`skill definition is for ${def.resourceId}, character is ${character.resourceId}`);
  }
  const resolved: ResolvedDamageEffect[] = [];
  for (const slot of SKILL_SLOTS) {
    const entry = def.skills[slot];
    if (entry.support === 'unsupported') continue;
    const skill = character.skills[slot];
    entry.effects.forEach((effect, effectIndex) => {
      if (effect.kind !== 'damage') return;
      const trigger = resolveTrigger(effect.trigger, skill, levels[slot]);
      if (typeof trigger === 'object' && 'every' in trigger && trigger.every < 2 && trigger.count !== 'lastShot') {
        throw new RangeError(`skill ${skill.id}: damage on every shot is not supported yet`);
      }
      const r: ResolvedDamageEffect = {
        source: { resourceId: character.resourceId, skill: slot, name: skill.name },
        damageType: effect.damageType,
        multiplier: skillValue(skill, effect.ref, levels[slot]) / 100,
        trigger,
        effectIndex,
      };
      if (effect.assumes) r.assumes = effect.assumes;
      resolved.push(r);
    });
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
  effects: readonly ResolvedSkillDamage[];
  /** 省略時は BURST_SKILL_FULL_BURST_BONUS */
  fullBurstBonus?: boolean;
  /** Stage 8: 1 + Σ distributedDamage。distributed の効果にだけ掛ける。省略 1 */
  distributedDamageMultiplier?: number;
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
  /** 1 + Σ distributedDamage（distributed の効果にだけ掛かる） */
  distributedDamageMultiplier: number;
  /** 効果ごとの 1 発動あたり期待ダメージ */
  perEffect: { effect: ResolvedSkillDamage; expected: number }[];
  /** 1 発動あたりの合計 */
  perActivation: number;
};

export type SkillHitResult = BurstHitResult;

export function computeBurstHit(input: BurstHitInput): BurstHitResult {
  const fullBurstBonus = input.fullBurstBonus ?? BURST_SKILL_FULL_BURST_BONUS;
  const distributed = input.distributedDamageMultiplier ?? 1;
  const baseHit = Math.max(1, input.attack - input.enemy.defence);
  const boostCrit = input.crit.rate * (input.crit.damage - 1);
  const boostFullBurst = fullBurstBonus ? FULL_BURST_BOOST : 0;
  const boostTotal = 1 + boostCrit + boostFullBurst;
  const common = baseHit * boostTotal * input.attackDamageMultiplier * input.elementMultiplier;
  const perEffect = input.effects.map((effect) => ({
    effect,
    expected: common * effect.multiplier * (effect.damageType === 'distributed' ? distributed : 1),
  }));
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
    distributedDamageMultiplier: distributed,
    perEffect,
    perActivation,
  };
}

/**
 * 倍率ダメージ 1 回ぶん（effects をまとめて）。攻撃力・会心・攻撃ダメージ・分配ダメージは通常攻撃と同じバフ後の値を使う。
 * burstDamage（slotBurstHit）と damage（Stage 8）で共通。
 */
export function computeSkillHit(
  effects: readonly ResolvedSkillDamage[],
  character: CharacterData,
  enemy: EnemyInput,
  trigger: Pick<TriggerDamage, 'attack' | 'attackDamageMultiplier'>,
  buffs: BuffTotals,
  fullBurstBonus: boolean,
): SkillHitResult {
  return computeBurstHit({
    attack: trigger.attack,
    enemy,
    crit: applyCritBuffs(character.crit, buffs),
    attackDamageMultiplier: trigger.attackDamageMultiplier,
    elementMultiplier: elementMultiplier(character.element, enemy.element),
    effects,
    fullBurstBonus,
    distributedDamageMultiplier: 1 + buffs.distributedDamage,
  });
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
  return computeSkillHit(effects, character, enemy, trigger, buffs, BURST_SKILL_FULL_BURST_BONUS);
}
