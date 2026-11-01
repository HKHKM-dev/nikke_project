// 全編成の合計ダメージ（App.tsx の「合計ダメージ」の枠）。選んでいないほかの編成の計算の入力を、選んでいる編成と同じ
// buildCalcView で作る（共通の設定はいまの画面のもの）。計算は useBatchComputation、選んでいる編成の値は画面の計算の結果
import type { TeamInput } from '@nikke/core';
import { buildCalcView, type CalcDeps } from './calcView.ts';
import type { Computed } from './compute.ts';
import { partyHasCharacters, withParty, type PartiesState, type SharedSettings } from './parties.ts';
import { slotSkillsStatus, type SkillDefinitionCache } from './useSkillDefinitions.ts';

/** 編成ごとの計算の入力。active は選んでいる編成（画面の計算を使う）、empty はニケのいない編成、loading はデータの読み込み中 */
export type PartyInput =
  { kind: 'active' } | { kind: 'empty' } | { kind: 'loading' } | { kind: 'ready'; input: TeamInput };

export type PartyInputDeps = Omit<CalcDeps, 'skillsStatuses'> & {
  skills: SkillDefinitionCache;
  /** 読み込みに失敗したキャラ（そのスロットは合計から除く。選んでいる編成と同じ） */
  characterErrors: ReadonlyMap<number, string>;
};

export function partyInputs(state: PartiesState, shared: SharedSettings, deps: PartyInputDeps): PartyInput[] {
  return state.parties.map((party, i): PartyInput => {
    if (i === state.active) return { kind: 'active' };
    if (party === null || !partyHasCharacters(party)) return { kind: 'empty' };
    const team = withParty(shared, party);
    const skillsStatuses = team.slots.map((s) =>
      s.resourceId === null ? null : slotSkillsStatus(deps.skills, s.resourceId),
    );
    const loading = team.slots.some(
      (s, k) =>
        s.resourceId !== null &&
        ((!deps.characters.has(s.resourceId) && !deps.characterErrors.has(s.resourceId)) ||
          skillsStatuses[k]?.kind === 'loading'),
    );
    if (loading) return { kind: 'loading' };
    return { kind: 'ready', input: buildCalcView(team, { ...deps, skillsStatuses }).input };
  });
}

/** 編成ごとの合計ダメージ。値が無い（空・読み込み中・計算中で前の結果も無い・エラー）は null */
export type PartyTotal = { kind: PartyInput['kind']; total: number | null; error?: string };

/**
 * 編成ごとの値と、全編成の合計。active は画面の計算の結果（activeComputed）、ほかは results（partyInputs と同じ並び）から取る。
 * 合計は値のある編成だけを足す
 */
export function partyTotals(
  inputs: readonly PartyInput[],
  activeComputed: Computed | null,
  results: readonly (Computed | null)[] | null,
): { parties: PartyTotal[]; total: number } {
  const parties = inputs.map((p, i): PartyTotal => {
    const computed = p.kind === 'active' ? activeComputed : p.kind === 'ready' ? (results?.[i] ?? null) : null;
    if (computed === null) return { kind: p.kind, total: null };
    return computed.ok
      ? { kind: p.kind, total: computed.result.totalDamage }
      : { kind: p.kind, total: null, error: computed.error };
  });
  return { parties, total: parties.reduce((sum, p) => sum + (p.total ?? 0), 0) };
}
