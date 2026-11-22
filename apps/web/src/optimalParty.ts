// 最適編成計算（クラシックの「最適編成計算」）: 選んだ 1 つのスロットのニケを、ほかのニケに入れ替えて、
// 編成のダメージがいちばん大きくなるニケの上位を出す。入れ替え先は、いまの編成にも、ほかの編成にもいないニケ
// （ソロレイドでは同じニケを 2 つの編成に入れられない）。育成は、育成状況にいるニケはその育成、いなければ既定（別のニケに変えたときと同じ）
import { assignBurstSteps, type BuildSnapshot, type CharacterIndexEntry } from '@nikke/core';
import { withRosterFields } from './roster.ts';
import { teamReducer, type TeamState } from './team.ts';

/** 上位として出す人数 */
export const OPTIMAL_TOP_COUNT = 10;

/** バースト I・II・III がそろう（フルバーストが起きる）か。全段階（AllStep）のニケは、足りない段階に充てる（assignBurstSteps） */
export function canFullBurst(members: readonly (CharacterIndexEntry | null)[]): boolean {
  const a = assignBurstSteps(members);
  return a.Step1 !== null && a.Step2 !== null && a.Step3 !== null;
}

/**
 * 入れ替え先のニケ（一覧の順のまま）。いまの編成のニケと、ほかの編成のニケは入れない。
 * スロット slotIndex に入れるとフルバーストが起きなくなる（段階 I・II・III がそろわない）ニケも入れない（計算を減らすため。
 * 段階の判定は一覧の基本バースト段階で、編成の条件で段階が変わるスキルは見ない）
 */
export function candidateEntries(
  index: readonly CharacterIndexEntry[],
  team: TeamState,
  otherPartyIds: ReadonlyMap<number, unknown>,
  slotIndex: number,
): CharacterIndexEntry[] {
  const used = new Set(team.slots.flatMap((s) => (s.resourceId === null ? [] : [s.resourceId])));
  const members = team.slots.map((s) => index.find((c) => c.resourceId === s.resourceId) ?? null);
  return index.filter(
    (c) =>
      !used.has(c.resourceId) &&
      !otherPartyIds.has(c.resourceId) &&
      canFullBurst(members.map((m, i) => (i === slotIndex ? c : m))),
  );
}

/** スロット slotIndex のニケを resourceId に入れ替えた編成（別のニケに変えたときと同じ。育成状況のニケはその育成を写す） */
export function swappedTeam(
  team: TeamState,
  roster: BuildSnapshot | null,
  slotIndex: number,
  resourceId: number,
): TeamState {
  return teamReducer(team, withRosterFields({ type: 'selectCharacter', index: slotIndex, resourceId }, roster));
}

export type OptimalRow = { resourceId: number; total: number };

/** ダメージの大きい順の上位（同じ値は元の並びのまま）。total が数でないものは除く */
export function topRows(rows: readonly OptimalRow[], count = OPTIMAL_TOP_COUNT): OptimalRow[] {
  return rows
    .filter((r) => Number.isFinite(r.total))
    .sort((a, b) => b.total - a.total)
    .slice(0, count);
}
