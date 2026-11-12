// モダン UI のスロットの絵に出す印（限界突破・コア強化と、コレクションのバッジ）。スロットの描画と、スロットから持ち上げた絵が使う
import type { BuildSnapshot } from '@nikke/core';
import type { CalcView } from '../../calcView.ts';
import type { TeamState } from '../../team.ts';
import { collectionBadge, type Badge } from './badges.ts';
import { growthMarksOf, type GrowthMarks } from './GrowthMarks.tsx';

/**
 * スロットの名前の上の限界突破・コア強化。育成状況にいるニケ（一覧と同じ。消すとスロットの育成も既定に戻る）と、
 * スペック固定のとき（計算に使う固定の値。限界突破・コアとも上限）に出す
 */
export function slotGrowthMarks(
  calc: CalcView,
  team: TeamState,
  roster: BuildSnapshot | null,
  i: number,
): GrowthMarks | null {
  const { character, growth } = calc.slots[i]!;
  const resourceId = team.slots[i]!.resourceId;
  const inRoster = resourceId !== null && roster?.characters[String(resourceId)] !== undefined;
  return character && (inRoster || team.fixedSpec) ? growthMarksOf(character.rarity, growth) : null;
}

/** スロットの絵のバッジの列の最後に出すコレクション（宝物を付けていれば宝物） */
export function slotCollectionBadge(calc: CalcView, i: number): Badge | null {
  const { character, build, treasurePhase } = calc.slots[i]!;
  return collectionBadge(build.collection, treasurePhase, (character?.treasure ?? null) !== null);
}
