// 効果の対象判定。段階 B 以降で「自分以外の味方」「最終攻撃力が最も高い味方 N 機」などを足すときはここに述語を増やし、
// computeTeamDamage 側は触らない。
import type { BuffTarget } from './types.ts';

/** sourceSlotIndex の枠が発動した target の効果が、targetSlotIndex の枠に掛かるか */
export function isEffectTarget(target: BuffTarget, sourceSlotIndex: number, targetSlotIndex: number): boolean {
  switch (target) {
    case 'self':
      return sourceSlotIndex === targetSlotIndex;
    case 'allies':
      return true;
  }
}
