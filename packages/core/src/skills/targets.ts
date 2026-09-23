// 効果の対象判定。段階 B 以降で「自分以外の味方」「最終攻撃力が最も高い味方 N 機」などを足すときはここに述語を増やし、
// computeTeamDamage 側は触らない。
// Stage 11: 発火のたびに対象が変わるもの（「直前にバーストスキルを使用した味方」）のために、発火の文脈を受ける。
import type { WeaponType } from '../types.ts';
import type { BuffTarget } from './types.ts';

/**
 * 発火の文脈。burstUsers = そのフルバーストを開いたチェーンでバーストを撃った枠（FullBurstWindow.burstUsers）。
 * フルバーストの開始・終了以外の発火では null
 */
export type FireContext = { burstUsers: readonly number[] } | null;

/**
 * sourceSlotIndex の枠が発動した効果が、targetSlotIndex の枠（武器種 targetSlotWeapon）に掛かるか。
 * Stage 9: targetWeapon（「〈武器〉を所持する味方」）があれば武器種の一致する枠だけ。
 * targetSlotWeapon を省略可能にしないのは、渡し忘れたときに黙って全員へ掛かるのを防ぐため。
 * Stage 11: burstUsers は context の枠だけ（context が null なら誰にも掛からない。検証でフルバーストのトリガーに限っている）
 */
export function isEffectTarget(
  effect: { target: BuffTarget; targetWeapon?: WeaponType },
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
      return weaponOk && context !== null && context.burstUsers.includes(targetSlotIndex);
  }
}

/** 対象が発火の文脈で変わるか（変わらなければ効果ごとに 1 回だけ対象を決めてよい） */
export function dependsOnContext(effect: { target: BuffTarget }): boolean {
  return effect.target === 'burstUsers';
}
