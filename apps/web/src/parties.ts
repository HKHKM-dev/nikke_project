// ソロレイド用の編成 01〜05 の切り替え。
// 編成ごとに持つのは、スロット（ニケ・育成・スキル・スロットの詳細設定）とフォーカスだけ。敵・共通育成・
// チームの詳細設定（3 分モード・戦闘時間）・スペック固定は全編成で共通にする（ソロレイドは 5 編成で同じボスに挑む）。
// 選んでいる編成は、これまでどおり STORAGE_KEY（team.ts）の編成そのもの。ほかの編成をこのキーに保存する（切り替えたときだけ書く）
import type { CharacterIndexEntry } from '@nikke/core';
import { INITIAL_TEAM_STATE, TEAM_FORMAT_VERSION, formatVersionOf, parseTeamObject, type TeamState } from './team.ts';

export const PARTY_COUNT = 5;
export const PARTIES_STORAGE_KEY = 'nikke-calc.parties.v1';

/** 編成ごとに持つ部分 */
export type Party = Pick<TeamState, 'slots' | 'controlledSlot'>;

/**
 * 選んでいる編成の番号（0 から）と、ほかの編成の中身。選んでいる編成の中身は画面の編成（TeamState）が正で、
 * parties[active] は null にしておく。未使用の編成も null（空の 5 スロット）
 */
export type PartiesState = { active: number; parties: (Party | null)[] };

export const INITIAL_PARTIES: PartiesState = { active: 0, parties: Array.from({ length: PARTY_COUNT }, () => null) };

export function partyOf(team: TeamState): Party {
  return { slots: team.slots, controlledSlot: team.controlledSlot };
}

/** ニケを 1 人でも選んでいる編成か */
export function partyHasCharacters(party: Party): boolean {
  return party.slots.some((s) => s.resourceId !== null);
}

/** 全編成で共通の設定だけを取り出す */
export function sharedSettingsOf(team: TeamState): SharedSettings {
  const { slots: _slots, controlledSlot: _controlledSlot, ...shared } = team;
  return shared;
}

/** 全編成で共通の設定（編成ごとに持つ部分のほか） */
export type SharedSettings = Omit<TeamState, keyof Party>;

/** 共通の設定はそのままに、スロットとフォーカスを編成のものにする。null は空の編成 */
export function withParty(team: SharedSettings, party: Party | null): TeamState {
  return {
    ...team,
    slots: party?.slots ?? INITIAL_TEAM_STATE.slots,
    controlledSlot: party?.controlledSlot ?? INITIAL_TEAM_STATE.controlledSlot,
  };
}

/** 編成 to に切り替える。いまの画面の編成を active に書き戻し、to の中身を画面の編成にする */
export function switchParty(
  state: PartiesState,
  team: TeamState,
  to: number,
): { parties: PartiesState; team: TeamState } {
  if (to === state.active || to < 0 || to >= PARTY_COUNT) return { parties: state, team };
  const parties = state.parties.slice();
  parties[state.active] = partyOf(team);
  const next = withParty(team, parties[to] ?? null);
  parties[to] = null;
  return { parties: { active: to, parties }, team: next };
}

export function serializeParties(state: PartiesState): string {
  return JSON.stringify({ formatVersion: TEAM_FORMAT_VERSION, ...state });
}

/**
 * 保存した編成の一覧を読む。読めないもの全体は null（初期値に落とす）。1 つの編成だけ形が合わないときは、その編成を空にする。
 * 版は編成（team.ts）と同じで、版のない旧形式も読み、未知の版（新しい版で書き出したもの）は読まない。
 * 編成の中身の検証は、共通の設定を既定値で埋めて編成の検証（team.ts の parseTeamObject）に任せる。
 * 画面は復元の直後に読めたものを書き戻す（App.tsx）ので、読めなかった編成は空になって残らない
 */
export function parseParties(json: string | null, index: readonly CharacterIndexEntry[]): PartiesState | null {
  if (json === null) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  if (formatVersionOf(raw as Record<string, unknown>) === null) return null;
  const { active, parties } = raw as { active?: unknown; parties?: unknown };
  if (typeof active !== 'number' || !Number.isInteger(active) || active < 0 || active >= PARTY_COUNT) return null;
  if (!Array.isArray(parties) || parties.length !== PARTY_COUNT) return null;
  return {
    active,
    parties: parties.map((p: unknown, i) => {
      if (i === active || typeof p !== 'object' || p === null) return null;
      const { slots, controlledSlot } = p as { slots?: unknown; controlledSlot?: unknown };
      const team = parseTeamObject({ ...INITIAL_TEAM_STATE, slots, controlledSlot }, index);
      return team === null ? null : partyOf(team);
    }),
  };
}

/** 編成の番号（01〜05）。編成のタブはこれだけを出す */
export function partyNumber(i: number): string {
  return String(i + 1).padStart(2, '0');
}

/** 画面に出す編成の名前（編成01〜05） */
export function partyLabel(i: number): string {
  return `編成${partyNumber(i)}`;
}
