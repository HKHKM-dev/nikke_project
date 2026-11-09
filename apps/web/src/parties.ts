// ソロレイド用の編成 01〜05 の切り替え。
// 編成ごとに持つのは、スロット（ニケ・育成・スキル・スロットの詳細設定）だけ。敵・共通育成・
// チームの詳細設定（3 分モード・戦闘時間）・スペック固定は全編成で共通にする（ソロレイドは 5 編成で同じボスに挑む）。
// 選んでいる編成は、これまでどおり STORAGE_KEY（team.ts）の編成そのもの。ほかの編成をこのキーに保存する（切り替えたときだけ書く）
import type { CharacterIndexEntry } from '@nikke/core';
import { INITIAL_TEAM_STATE, TEAM_FORMAT_VERSION, formatVersionOf, parseTeamObject, type TeamState } from './team.ts';

export const PARTY_COUNT = 5;
export const PARTIES_STORAGE_KEY = 'nikke-calc.parties.v1';

/** 編成ごとに持つ部分 */
export type Party = Pick<TeamState, 'slots'>;

/**
 * 選んでいる編成の番号（0 から）と、ほかの編成の中身。選んでいる編成の中身は画面の編成（TeamState）が正で、
 * parties[active] は null にしておく。未使用の編成も null（空の 5 スロット）
 */
export type PartiesState = { active: number; parties: (Party | null)[] };

export const INITIAL_PARTIES: PartiesState = { active: 0, parties: Array.from({ length: PARTY_COUNT }, () => null) };

export function partyOf(team: TeamState): Party {
  return { slots: team.slots };
}

/** ニケを 1 人でも選んでいる編成か */
export function partyHasCharacters(party: Party): boolean {
  return party.slots.some((s) => s.resourceId !== null);
}

/**
 * ほかの編成（選んでいる編成のほか）で選んでいるニケ。キャラの選択肢とトレイに「ほかの編成で使用中」の印を出す
 * （ソロレイドでは同じニケを 2 つの編成に入れられない。plan/design-ui-rebuild.md 5.2 節）
 */
export function otherPartyResourceIds(state: PartiesState): Set<number> {
  const ids = new Set<number>();
  state.parties.forEach((p, i) => {
    if (i === state.active || p === null) return;
    for (const s of p.slots) if (s.resourceId !== null) ids.add(s.resourceId);
  });
  return ids;
}

/** 全編成で共通の設定だけを取り出す */
export function sharedSettingsOf(team: TeamState): SharedSettings {
  const { slots: _slots, ...shared } = team;
  return shared;
}

/** 全編成で共通の設定（編成ごとに持つ部分のほか） */
export type SharedSettings = Omit<TeamState, keyof Party>;

/** 共通の設定はそのままに、スロットを編成のものにする。null は空の編成 */
export function withParty(team: SharedSettings, party: Party | null): TeamState {
  return { ...team, slots: party?.slots ?? INITIAL_TEAM_STATE.slots };
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
 * 保存した編成の一覧を読んだ結果。読めたときの dropped は、形が合わず空にした編成の番号（0 から）。
 * 未使用の編成（null）と、選んでいる編成の欄（中身は編成の保存が持つので見ない）は数えない
 */
export type PartiesRead = { ok: true; value: PartiesState; dropped: number[] } | { ok: false; error: string };

/**
 * 保存した編成の一覧を読む。全体が読めなければ理由を返す。1 つの編成だけ形が合わないときは、その編成を空にして dropped に数える。
 * 版は編成（team.ts）と同じで、版のないものと未知の版（新しい版で書き出したもの）は読まない。
 * 編成の中身の検証は、共通の設定を既定値で埋めて編成の検証（team.ts の parseTeamObject）に任せる。
 * 画面は読めなかった保存を退避してから、読めたものを書き戻す（savedTeams.ts・App.tsx）
 */
export function readParties(json: string, index: readonly CharacterIndexEntry[]): PartiesRead {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: 'JSON として読めません' };
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, error: '編成の一覧の JSON ではありません' };
  }
  const record = raw as Record<string, unknown>;
  if (formatVersionOf(record) === null) {
    return { ok: false, error: `この版の編成の一覧は読めません（formatVersion ${String(record.formatVersion)}）` };
  }
  const { active, parties } = record;
  if (
    typeof active !== 'number' ||
    !Number.isInteger(active) ||
    active < 0 ||
    active >= PARTY_COUNT ||
    !Array.isArray(parties) ||
    parties.length !== PARTY_COUNT
  ) {
    return { ok: false, error: '編成の一覧の形が合いません（選んでいる編成の番号・編成の数）' };
  }
  const dropped: number[] = [];
  const value: PartiesState = {
    active,
    parties: parties.map((p: unknown, i) => {
      if (i === active || p === null) return null;
      const slots = typeof p === 'object' ? (p as { slots?: unknown }).slots : undefined;
      const team = parseTeamObject({ ...INITIAL_TEAM_STATE, slots }, index);
      if (team === null) {
        dropped.push(i);
        return null;
      }
      return partyOf(team);
    }),
  };
  return { ok: true, value, dropped };
}

/** readParties の読めた中身だけ（無い・全体が読めないは null） */
export function parseParties(json: string | null, index: readonly CharacterIndexEntry[]): PartiesState | null {
  if (json === null) return null;
  const read = readParties(json, index);
  return read.ok ? read.value : null;
}

/** 編成の番号（01〜05）。編成のタブはこれだけを出す */
export function partyNumber(i: number): string {
  return String(i + 1).padStart(2, '0');
}

/** 画面に出す編成の名前（編成01〜05） */
export function partyLabel(i: number): string {
  return `編成${partyNumber(i)}`;
}
