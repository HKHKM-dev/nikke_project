// 最適編成計算（クラシックの「最適編成計算」）: 選んだ 1 つのスロットのニケを、ほかのニケに入れ替えて、
// 編成のダメージがいちばん大きくなるニケの上位を出す。入れ替え先は、いまの編成にも、ほかの編成にもいないニケ
// （ソロレイドでは同じニケを 2 つの編成に入れられない）。育成は、育成状況にいるニケはその育成、いなければ既定（別のニケに変えたときと同じ）
import {
  assignBurstSteps,
  burstStepInTeam,
  type BuildSnapshot,
  type CharacterData,
  type CharacterIndexEntry,
  type SkillDefinition,
} from '@nikke/core';
import { withRosterFields } from './roster.ts';
import { teamReducer, type TeamState } from './team.ts';

/** 上位として出す人数 */
export const OPTIMAL_TOP_COUNT = 10;

/** 編成の 1 枠（読み込んだキャラと、そのスキル定義。定義が無い・読めないときは null） */
export type BurstMember = { character: CharacterData; definition: SkillDefinition | null };

/**
 * バースト I・II・III がそろう（フルバーストが起きる）か。各枠の段は、計算と同じ編成での段（burstStepInTeam。
 * 編成の条件で付くバースト段階の変更の後）。全段階（AllStep）のニケは、足りない段階に充てる（assignBurstSteps）
 */
export function canFullBurst(members: readonly (BurstMember | null)[]): boolean {
  const characters = members.map((m) => m?.character ?? null);
  const a = assignBurstSteps(
    members.map((m, i) =>
      m === null ? null : { burstStep: burstStepInTeam(m.character, m.definition, characters, i) },
    ),
  );
  return a.Step1 !== null && a.Step2 !== null && a.Step3 !== null;
}

/**
 * 候補のうち、入れるとフルバーストが起きる（canFullBurst）ものだけを残す。membersWith: その候補を入れた編成の枠。
 * どの候補を入れても起きない編成（1 人だけの編成など）では、省くと候補が残らないので、省かずに全部を残す（noneFullBurst）。
 * dropped: 省いた人数
 */
export function fullBurstCandidates<T>(
  candidates: readonly T[],
  membersWith: (candidate: T) => readonly (BurstMember | null)[],
): { kept: readonly T[]; dropped: number; noneFullBurst: boolean } {
  const kept = candidates.filter((c) => canFullBurst(membersWith(c)));
  if (kept.length === 0 && candidates.length > 0) return { kept: candidates, dropped: 0, noneFullBurst: true };
  return { kept, dropped: candidates.length - kept.length, noneFullBurst: false };
}

/**
 * 入れ替え先のニケ（一覧の順のまま）。いまの編成のニケと、ほかの編成のニケは入れない。
 * フルバーストが起きなくなるニケを省く判定（fullBurstCandidates）は、スキル定義を読んだ後に呼ぶ側がする
 */
export function candidateEntries(
  index: readonly CharacterIndexEntry[],
  team: TeamState,
  otherPartyIds: ReadonlyMap<number, unknown>,
): CharacterIndexEntry[] {
  const used = new Set(team.slots.flatMap((s) => (s.resourceId === null ? [] : [s.resourceId])));
  return index.filter((c) => !used.has(c.resourceId) && !otherPartyIds.has(c.resourceId));
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
