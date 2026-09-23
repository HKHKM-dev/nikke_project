// 効果の対象判定。段階 B 以降で「自分以外の味方」「最終攻撃力が最も高い味方 N 機」などを足すときはここに述語を増やし、
// computeTeamDamage 側は触らない。
import type { WeaponType } from '../types.ts';
import type { BuffTarget } from './types.ts';

/**
 * sourceSlotIndex の枠が発動した効果が、targetSlotIndex の枠（武器種 targetSlotWeapon）に掛かるか。
 * Stage 9: targetWeapon（「〈武器〉を所持する味方」）があれば武器種の一致する枠だけ。
 * targetSlotWeapon を省略可能にしないのは、渡し忘れたときに黙って全員へ掛かるのを防ぐため
 */
export function isEffectTarget(
  effect: { target: BuffTarget; targetWeapon?: WeaponType },
  sourceSlotIndex: number,
  targetSlotIndex: number,
  targetSlotWeapon: WeaponType,
): boolean {
  switch (effect.target) {
    case 'self':
      return sourceSlotIndex === targetSlotIndex;
    case 'allies':
      return effect.targetWeapon === undefined || effect.targetWeapon === targetSlotWeapon;
  }
}
