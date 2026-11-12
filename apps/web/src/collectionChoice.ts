// 育成の「コレクション」の欄（BuildSection.tsx）で選んだ値から、変える育成を決める。欄は R・SR のコレクションと宝物の段階を
// 1 つの選択にまとめている。スペック固定の間も宝物は選べるが、保存している育成（build）には触れない（固定を外すと戻るように）
import type { TreasurePhase } from '@nikke/core';
import type { SlotBuild, SlotGrowthFields } from './team.ts';

/** 欄の宝物の選択肢の値（treasure-1 など） */
const TREASURE_PREFIX = 'treasure-';

export function treasureOptionValue(phase: number): string {
  return `${TREASURE_PREFIX}${phase}`;
}

/**
 * 段階が未確定の宝物の選択肢の値（育成状況の編集だけに出る。plan/design-roster-edit.md 6.4 節）。いまの値として出すだけで、
 * ほかの値から選び直すことはできない
 */
export const UNKNOWN_TREASURE_OPTION = 'unknown-treasure';

export type CollectionSelect = {
  /** スペック固定の間か */
  fixedSpec: boolean;
  /** いま宝物を選んでいるか */
  hasTreasure: boolean;
  /** 保存している育成入力 */
  build: SlotBuild;
  /** R・SR を選んだときの LV（いま出しているコレクションの LV） */
  level: number;
};

/** 欄で value（'' はなし・'R'・'SR'・treasureOptionValue）を選んだときに変える育成（宝物の段階と、R・SR のコレクション） */
export function collectionPatch(
  value: string,
  { fixedSpec, hasTreasure, build, level }: CollectionSelect,
): Partial<Pick<SlotGrowthFields, 'treasurePhase' | 'build'>> {
  if (value === UNKNOWN_TREASURE_OPTION) return {};
  if (value.startsWith(TREASURE_PREFIX)) {
    return { treasurePhase: Number(value.slice(TREASURE_PREFIX.length)) as TreasurePhase };
  }
  const withoutTreasure = hasTreasure ? { treasurePhase: 0 as const } : {};
  if (fixedSpec) return withoutTreasure;
  const rarity = value as 'R' | 'SR' | '';
  return { ...withoutTreasure, build: { ...build, collection: rarity === '' ? null : { rarity, level } } };
}
