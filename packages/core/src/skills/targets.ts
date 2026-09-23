// 効果の対象判定。段階 B 以降で「自分以外の味方」「最終攻撃力が最も高い味方 N 機」などを足すときはここに述語を増やし、
// computeTeamDamage 側は触らない。
// Stage 11: 発火のたびに対象が変わるもの（「直前にバーストスキルを使用した味方」）のために、発火の文脈を受ける。
// Stage 11 アリス編: 「最終攻撃力が最も高い味方 N 機」（topAttack）も文脈（攻撃力の順位）で決める（skills/ranking.ts）。
import type { WeaponType } from '../types.ts';
import type { BuffTarget } from './types.ts';

/**
 * 発火の文脈。
 * burstUsers = そのフルバーストを開いたチェーンでバーストを撃った枠（FullBurstWindow.burstUsers）。フルバーストの開始・終了のときだけ。
 * attackRank = 対象になりうる枠（効果の targetWeapon で絞った後）を発火のフレームの最終攻撃力の高い順に並べたもの。
 * topAttack の効果のときだけ（skills/ranking.ts の attackRankFor）。
 * どちらも無い発火では null
 */
export type FireContext = { burstUsers?: readonly number[]; attackRank?: readonly number[] } | null;

/** isEffectTarget が見る効果の項目 */
export type TargetedEffect = { target: BuffTarget; targetWeapon?: WeaponType; targetCount?: number };

/**
 * sourceSlotIndex の枠が発動した効果が、targetSlotIndex の枠（武器種 targetSlotWeapon）に掛かるか。
 * Stage 9: targetWeapon（「〈武器〉を所持する味方」）があれば武器種の一致する枠だけ。
 * targetSlotWeapon を省略可能にしないのは、渡し忘れたときに黙って全員へ掛かるのを防ぐため。
 * Stage 11: burstUsers は context の枠だけ（context に無ければ誰にも掛からない。検証でフルバーストのトリガーに限っている）。
 * topAttack は context.attackRank の先頭 targetCount 枠だけ（attackRank が無ければ誰にも掛からない）
 */
export function isEffectTarget(
  effect: TargetedEffect,
  sourceSlotIndex: number,
  targetSlotIndex: number,
  targetSlotWeapon: WeaponType,
  context: FireContext = null,
): boolean {
  const weaponOk = effect.targetWeapon === undefined || effect.targetWeapon === targetSlotWeapon;
  switch (effect.target) {
    case 'self':
      return sourceSlotIndex === targetSlotIndex;
    case 'allies':
      return weaponOk;
    case 'burstUsers':
      return weaponOk && context?.burstUsers?.includes(targetSlotIndex) === true;
    case 'topAttack': {
      const rank = context?.attackRank;
      if (!weaponOk || rank === undefined) return false;
      return rank.slice(0, effect.targetCount ?? 1).includes(targetSlotIndex);
    }
  }
}

/** 文脈しだいで掛かりうるか（burstUsers・topAttack は武器種の条件だけで見る）。1 パス目で「窓を持ちうる枠」を決めるのに使う */
export function canEverTarget(
  effect: TargetedEffect,
  sourceSlotIndex: number,
  targetSlotIndex: number,
  targetSlotWeapon: WeaponType,
): boolean {
  if (effect.target === 'self') return sourceSlotIndex === targetSlotIndex;
  return effect.targetWeapon === undefined || effect.targetWeapon === targetSlotWeapon;
}

/** 対象が発火の文脈で変わるか（変わらなければ効果ごとに 1 回だけ対象を決めてよい） */
export function dependsOnContext(effect: { target: BuffTarget }): boolean {
  return effect.target === 'burstUsers' || effect.target === 'topAttack';
}

/** Stage 11 アリス編: 対象を決めるのに攻撃力の順位が要るか */
export function dependsOnRank(effect: { target: BuffTarget }): boolean {
  return effect.target === 'topAttack';
}
