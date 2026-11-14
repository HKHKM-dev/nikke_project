// ソロレイド用の編成 01〜05 の切り替え。
// 編成ごとに持つのは、スロット（ニケ・育成・スキル・スロットの詳細設定）だけ。敵・共通育成・
// チームの詳細設定（3 分モード・戦闘時間）・スペック固定は全編成で共通にする（ソロレイドは 5 編成で同じボスに挑む）。
// 選んでいる編成は、これまでどおり STORAGE_KEY（team.ts）の編成そのもの。ほかの編成をこのキーに保存する（切り替えたときだけ書く）
import type { CharacterIndexEntry } from '@nikke/core';
import {
  INITIAL_TEAM_STATE,
  TEAM_FORMAT_VERSION,
  TEAM_SHAPE_ERROR,
  clearedSlot,
  isRecord,
  parseTeamObject,
  readVersionedJson,
  type SlotState,
  type TeamState,
} from './team.ts';

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

/** ニケ → そのニケを選んでいるほかの編成の番号（1 から。小さい順） */
export type OtherParties = ReadonlyMap<number, readonly number[]>;
/**
 * ほかの編成（選んでいる編成のほか）で選んでいるニケ。このニケはいまの編成に入れられない（App の dispatch が止める）。
 * キャラの選択肢とトレイでは選べなくし、「ほかの編成で使用中」と出す（ソロレイドでは同じニケを 2 つの編成に入れられない）
 */
export function otherPartyResourceIds(state: PartiesState): OtherParties {
  const ids = new Map<number, number[]>();
  state.parties.forEach((p, i) => {
    if (i === state.active || p === null) return;
    for (const s of p.slots) {
      if (s.resourceId === null) continue;
      const numbers = ids.get(s.resourceId) ?? [];
      if (!numbers.includes(i + 1)) numbers.push(i + 1);
      ids.set(s.resourceId, numbers);
    }
  });
  return ids;
}

/**
 * 同じニケを 2 つ以上の編成に入れていたら、番号の小さい編成にだけ残し、後の編成のスロットからは外す（読み込んだ保存に使う。
 * ソロレイドでは同じニケを 2 つの編成に入れられない）。選んでいる編成（state.active）の中身は team。
 * 外したものが無ければ、受け取ったものをそのまま返す
 */
export function withoutCrossPartyDuplicates(
  state: PartiesState,
  team: TeamState,
): { parties: PartiesState; team: TeamState } {
  const seen = new Set<number>();
  const dedupe = (slots: readonly SlotState[]): SlotState[] | null => {
    let changed = false;
    const next = slots.map((s) => {
      if (s.resourceId === null) return s;
      if (!seen.has(s.resourceId)) {
        seen.add(s.resourceId);
        return s;
      }
      changed = true;
      return clearedSlot(s);
    });
    return changed ? next : null;
  };
  let nextTeam = team;
  let changed = false;
  const parties = state.parties.map((p, i) => {
    if (i === state.active) {
      const slots = dedupe(team.slots);
      if (slots) nextTeam = { ...team, slots };
      return p;
    }
    if (p === null) return p;
    const slots = dedupe(p.slots);
    if (!slots) return p;
    changed = true;
    return { ...p, slots };
  });
  if (!changed && nextTeam === team) return { parties: state, team };
  return { parties: changed ? { ...state, parties } : state, team: nextTeam };
}

/** 全編成で共通の設定だけを取り出す */
export function sharedSettingsOf(team: TeamState): SharedSettings {
  const { slots: _slots, controlledSlot: _controlled, ...shared } = team;
  return shared;
}

/** 全編成で共通の設定（編成ごとに持つ部分のほか） */
export type SharedSettings = Omit<TeamState, keyof Party>;

/** 共通の設定はそのままに、スロットを編成のものにする。null は空の編成 */
export function withParty(team: SharedSettings, party: Party | null): TeamState {
  return { ...team, ...(party ?? partyOf(INITIAL_TEAM_STATE)) };
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
 * 保存した編成の一覧を読んだ結果。読めたときの dropped は、形が合わず空にした編成の番号（0 から）とその理由（無ければ null）。
 * 未使用の編成（null）と、選んでいる編成の欄（中身は編成の保存が持つので見ない）は数えない
 */
export type PartiesRead =
  | { ok: true; value: PartiesState; dropped: { indices: number[]; error: string } | null }
  | { ok: false; error: string };

/**
 * 保存した編成の一覧を読む。全体が読めなければ理由を返す。1 つの編成だけ形が合わないときは、その編成を空にして dropped に数える。
 * 版は編成（team.ts）と同じで、版のないものと未知の版（新しい版で書き出したもの）は読まない。
 * 編成の中身の検証は、共通の設定を既定値で埋めて編成の検証（team.ts の parseTeamObject）に任せる。
 * 画面は読めなかった保存を退避してから、読めたものを書き戻す（savedTeams.ts・App.tsx）
 */
export function readParties(json: string, index: readonly CharacterIndexEntry[]): PartiesRead {
  const raw = readVersionedJson(json, '編成の一覧');
  if (!raw.ok) return raw;
  const { active, parties } = raw.value;
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
  const indices: number[] = [];
  const value: PartiesState = {
    active,
    parties: parties.map((p: unknown, i) => {
      if (i === active || p === null) return null;
      const team = parseTeamObject(
        {
          ...INITIAL_TEAM_STATE,
          formatVersion: raw.value.formatVersion,
          slots: isRecord(p) ? p.slots : undefined,
          controlledSlot: isRecord(p) ? p.controlledSlot : undefined,
        },
        index,
      );
      if (team === null) {
        indices.push(i);
        return null;
      }
      return partyOf(team);
    }),
  };
  return { ok: true, value, dropped: indices.length === 0 ? null : { indices, error: TEAM_SHAPE_ERROR } };
}

/** 編成の番号（01〜05）。編成のタブはこれだけを出す */
export function partyNumber(i: number): string {
  return String(i + 1).padStart(2, '0');
}

/** 画面に出す編成の名前（編成01〜05） */
export function partyLabel(i: number): string {
  return `編成${partyNumber(i)}`;
}
