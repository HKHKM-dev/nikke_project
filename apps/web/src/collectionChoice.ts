// 育成の「コレクション」の欄（BuildSection.tsx）で選んだ値から、編成に出す操作を決める。欄は R・SR のコレクションと宝物の段階を
// 1 つの選択にまとめている。スペック固定の間も宝物は選べるが、保存している育成（build）には触れない（固定を外すと戻るように）
import type { BuildInput, TreasurePhase } from '@nikke/core';
import type { TeamAction } from './team.ts';

/** 欄の宝物の選択肢の値（treasure-1 など） */
const TREASURE_PREFIX = 'treasure-';

export function treasureOptionValue(phase: number): string {
  return `${TREASURE_PREFIX}${phase}`;
}

export type CollectionSelect = {
  /** スペック固定の間か */
  fixedSpec: boolean;
  /** いま宝物を選んでいるか */
  hasTreasure: boolean;
  /** 保存している育成入力 */
  build: BuildInput;
  /** R・SR を選んだときの LV（いま出しているコレクションの LV） */
  level: number;
};

/** スロット index の欄で value（'' はなし・'R'・'SR'・treasureOptionValue）を選んだときの操作 */
export function collectionActions(
  index: number,
  value: string,
  { fixedSpec, hasTreasure, build, level }: CollectionSelect,
): TeamAction[] {
  if (value.startsWith(TREASURE_PREFIX)) {
    const treasurePhase = Number(value.slice(TREASURE_PREFIX.length)) as TreasurePhase;
    return [{ type: 'setTreasurePhase', index, treasurePhase }];
  }
  const actions: TeamAction[] = hasTreasure ? [{ type: 'setTreasurePhase', index, treasurePhase: 0 }] : [];
  if (fixedSpec) return actions;
  const rarity = value as 'R' | 'SR' | '';
  const collection = rarity === '' ? null : { rarity, level };
  return [...actions, { type: 'setBuild', index, build: { ...build, collection } }];
}
