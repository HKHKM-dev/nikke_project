// ユニオン射撃場「スペック固定」時の戦闘中攻撃力。
// 仕様は plan/verification.md（2026-09-23 確定、9 体の実測で誤差ゼロ〜0.01%）:
//   Lv400、限界突破・コアはレア度上限、好感度 rank30（corporation_sub_type が OVERSPEC の SSR は rank40、R は rank10）、
//   装備は T9 Lv5 のクラス別固定値、キューブ・コンソールなし。
//   コア強化の +2%/段は「突破後の素の攻撃力 + 好感度」に掛かり、装備には掛からない。
import { CORE_MAX, GRADE_MAX, applyCoreRatio, computeStat, type GrowthInput } from './stats.ts';
import type { CharacterData, NikkeClass } from './types.ts';

export const FIXED_SPEC_LEVEL = 400;
/** 射撃場の的（BigArms）の防御力 */
export const FIXED_SPEC_ENEMY_DEFENCE = 100;

/** T9 Lv5 装備 4 部位の攻撃力合計（クラス別固定値） */
export const FIXED_SPEC_GEAR_ATTACK: Record<NikkeClass, number> = {
  Supporter: 7349,
  Defender: 5879,
  Attacker: 8818,
};

export type AffectionRank = 10 | 30 | 40;

/** 好感度ランクによる攻撃力加算（クラス別固定値） */
export const AFFECTION_ATTACK: Record<NikkeClass, Record<AffectionRank, number>> = {
  Supporter: { 10: 336, 30: 1367, 40: 1950 },
  Defender: { 10: 269, 30: 1094, 40: 1560 },
  Attacker: { 10: 403, 30: 1640, 40: 2340 },
};

/**
 * 好感度上限は凸段階に紐づく: 無凸 rank10、2 凸以上 rank30、CDN の corporation_sub_type が OVERSPEC の SSR は 3 凸以降 rank40。
 * OVERSPEC はピルグリム全員と、ピルグリムでない 4 体（ラピ：レッドフード・ミハラ：ボンディングチェーン・ネオン：ビジョンアイ・アニス：スター）。
 * 非ピルグリムの rank40 は C-0169（ラピ：レッドフード・ミハラ：ボンディングチェーン・ネオン：ビジョンアイで実測。アニス：スターは未実測）
 */
export function fixedSpecAffectionRank(character: Pick<CharacterData, 'rarity' | 'corporationSubType'>): AffectionRank {
  if (character.rarity === 'R') return 10;
  if (character.rarity === 'SSR' && character.corporationSubType === 'OVERSPEC') return 40;
  return 30;
}

export function fixedSpecGrowth(character: Pick<CharacterData, 'rarity'>): GrowthInput {
  return { level: FIXED_SPEC_LEVEL, grade: GRADE_MAX[character.rarity], core: CORE_MAX[character.rarity] };
}

export type FixedSpecAttack = {
  attack: number;
  growth: GrowthInput;
  affectionRank: AffectionRank;
  /** 突破のみ（コアなし）の素の攻撃力 */
  gradeBase: number;
  affection: number;
  /** (gradeBase + affection) × (1 + コア%) を四捨五入した値 */
  withCore: number;
  gear: number;
};

export function computeFixedSpecAttack(
  character: Pick<CharacterData, 'rarity' | 'class' | 'corporationSubType' | 'levelCurve' | 'statEnhance'>,
): FixedSpecAttack {
  const growth = fixedSpecGrowth(character);
  const gradeBase = computeStat(character, 'attack', { ...growth, core: 0 });
  const affectionRank = fixedSpecAffectionRank(character);
  const affection = AFFECTION_ATTACK[character.class][affectionRank];
  const withCore = applyCoreRatio(gradeBase + affection, growth.core, character.statEnhance.coreAttack);
  const gear = FIXED_SPEC_GEAR_ATTACK[character.class];
  return { attack: withCore + gear, growth, affectionRank, gradeBase, affection, withCore, gear };
}
