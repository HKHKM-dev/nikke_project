import { describe, expect, it } from 'vitest';
import type { CharacterIndexEntry } from '@nikke/core';
import {
  INITIAL_PARTIES,
  otherPartyResourceIds,
  partyOf,
  readParties,
  type PartiesState,
  serializeParties,
  switchParty,
  withoutCrossPartyDuplicates,
} from './parties.ts';
import { INITIAL_TEAM_STATE, TEAM_FORMAT_VERSION, TEAM_SHAPE_ERROR, teamReducer, type TeamState } from './team.ts';

/** readParties の読めた中身だけ（無い・全体が読めないは null） */
function parseParties(json: string | null, index: readonly CharacterIndexEntry[]): PartiesState | null {
  if (json === null) return null;
  const read = readParties(json, index);
  return read.ok ? read.value : null;
}

const index = [{ resourceId: 10 }, { resourceId: 11 }] as unknown as CharacterIndexEntry[];

function withCharacter(team: TeamState, slot: number, resourceId: number): TeamState {
  return teamReducer(team, { type: 'selectCharacter', index: slot, resourceId });
}

describe('parties', () => {
  it('switching keeps the shared settings and swaps slots', () => {
    let team = withCharacter(INITIAL_TEAM_STATE, 0, 10);
    team = teamReducer(team, { type: 'setDuration', durationSeconds: 60 });

    const to1 = switchParty(INITIAL_PARTIES, team, 1);
    expect(to1.parties.active).toBe(1);
    expect(to1.team.slots.every((s) => s.resourceId === null)).toBe(true);
    expect(to1.team.durationSeconds).toBe(60);

    const team1 = withCharacter(to1.team, 2, 11);
    const back = switchParty(to1.parties, team1, 0);
    expect(back.team.slots[0]!.resourceId).toBe(10);
    expect(back.parties.parties[1]).toEqual(partyOf(team1));
    // 選んでいる編成の中身は画面の編成が持つ
    expect(back.parties.parties[0]).toBeNull();
  });

  it('switching to the active party does nothing', () => {
    const r = switchParty(INITIAL_PARTIES, INITIAL_TEAM_STATE, 0);
    expect(r.parties).toBe(INITIAL_PARTIES);
    expect(r.team).toBe(INITIAL_TEAM_STATE);
  });

  it('round-trips the inactive parties through the saved JSON', () => {
    const team0 = withCharacter(INITIAL_TEAM_STATE, 0, 10);
    const { parties } = switchParty(INITIAL_PARTIES, team0, 3);
    const read = parseParties(serializeParties(parties), index);
    expect(read).toEqual(parties);
    expect(read?.parties[0]).toEqual(partyOf(team0));
  });

  it('empties only a party that does not parse, and rejects a broken list', () => {
    const { parties } = switchParty(INITIAL_PARTIES, withCharacter(INITIAL_TEAM_STATE, 0, 10), 1);
    const raw = JSON.parse(serializeParties(parties));
    raw.parties[2] = { slots: 'x' };
    const read = parseParties(JSON.stringify(raw), index);
    expect(read?.parties[0]?.slots[0]?.resourceId).toBe(10);
    expect(read?.parties[2]).toBeNull();
    expect(parseParties(JSON.stringify({ ...raw, active: 5 }), index)).toBeNull();
    expect(parseParties(JSON.stringify({ ...raw, parties: [] }), index)).toBeNull();
    expect(parseParties('{', index)).toBeNull();
    expect(parseParties(null, index)).toBeNull();
  });

  it('readParties gives the reason for a broken list and the parties it emptied', () => {
    const { parties } = switchParty(INITIAL_PARTIES, withCharacter(INITIAL_TEAM_STATE, 0, 10), 1);
    const raw = JSON.parse(serializeParties(parties));
    expect(readParties('{', index)).toEqual({ ok: false, error: 'JSON として読めません' });
    expect(readParties('[]', index)).toEqual({ ok: false, error: '編成の一覧の JSON ではありません' });
    expect(readParties(JSON.stringify({ ...raw, formatVersion: undefined }), index)).toEqual({
      ok: false,
      error: 'この版の編成の一覧は読めません（formatVersion undefined）',
    });
    expect(readParties(JSON.stringify({ ...raw, active: 5 }), index).ok).toBe(false);
    expect(readParties(JSON.stringify({ ...raw, parties: [] }), index).ok).toBe(false);

    // 未使用の編成（null）と選んでいる編成の欄は数えない。オブジェクトでない値と形が合わないものは空にして数える
    expect(readParties(serializeParties(parties), index)).toEqual({ ok: true, value: parties, dropped: null });
    raw.parties[1] = { slots: 'ignored' };
    raw.parties[2] = { slots: 'x' };
    raw.parties[4] = 5;
    const read = readParties(JSON.stringify(raw), index);
    expect(read.ok && read.dropped).toEqual({ indices: [2, 4], error: TEAM_SHAPE_ERROR });
    expect(read.ok && read.value.parties[0]?.slots[0]?.resourceId).toBe(10);
  });

  it('keeps the controlled slot per party', () => {
    const moved = { ...withCharacter(INITIAL_TEAM_STATE, 0, 10), controlledSlot: 0 };
    const { parties, team } = switchParty(INITIAL_PARTIES, moved, 1);
    expect(team.controlledSlot).toBe(INITIAL_TEAM_STATE.controlledSlot);
    expect(parseParties(serializeParties(parties), index)?.parties[0]?.controlledSlot).toBe(0);
    expect(switchParty(parties, team, 0).team.controlledSlot).toBe(0);
  });

  it('reads the versions the team reads, and rejects an unknown (newer) formatVersion', () => {
    const { parties } = switchParty(INITIAL_PARTIES, withCharacter(INITIAL_TEAM_STATE, 0, 10), 1);
    const raw = JSON.parse(serializeParties(parties));
    expect(raw.formatVersion).toBe(TEAM_FORMAT_VERSION);
    // 古い版も読む（版 2 までの操作キャラ controlledSlot は読み捨てる）。版のない旧形式は読まない
    const v2 = {
      ...raw,
      formatVersion: 2,
      parties: raw.parties.map((p: object | null) => p && { ...p, controlledSlot: 0 }),
    };
    expect(parseParties(JSON.stringify(v2), index)).toEqual(parties);
    expect(parseParties(JSON.stringify({ ...raw, formatVersion: 1 }), index)).toEqual(parties);
    const { formatVersion: _v, ...unversioned } = raw;
    expect(parseParties(JSON.stringify(unversioned), index)).toBeNull();
    for (const formatVersion of [TEAM_FORMAT_VERSION + 1, 0, 1.5, '2']) {
      expect(parseParties(JSON.stringify({ ...raw, formatVersion }), index)).toBeNull();
    }
  });

  it('writes back what it restored without changing it (the screen saves right after restoring)', () => {
    const team = withCharacter(INITIAL_TEAM_STATE, 0, 10);
    let { parties } = switchParty(INITIAL_PARTIES, team, 1);
    ({ parties } = switchParty(parties, withCharacter(INITIAL_TEAM_STATE, 3, 11), 2));
    const saved = serializeParties(parties);
    const restored = parseParties(saved, index)!;
    expect(serializeParties(restored)).toBe(saved);

    // 古い版は、いまの版で書き戻す（中身は同じ）
    const fromOld = parseParties(JSON.stringify({ ...JSON.parse(saved), formatVersion: 2 }), index)!;
    expect(serializeParties(fromOld)).toBe(saved);

    // 読めなかった編成（index に無いニケ）は、空にして書き戻す
    const broken = JSON.parse(saved);
    broken.parties[0].slots[0].resourceId = 999;
    const written = JSON.parse(serializeParties(parseParties(JSON.stringify(broken), index)!));
    expect(written.parties[0]).toBeNull();
    expect(written.parties[1]).toEqual(JSON.parse(saved).parties[1]);
  });

  it('lists the characters chosen in the other parties, leaving out the active one', () => {
    let { parties } = switchParty(INITIAL_PARTIES, withCharacter(INITIAL_TEAM_STATE, 0, 10), 1);
    expect([...otherPartyResourceIds(parties)]).toEqual([[10, [1]]]);
    ({ parties } = switchParty(parties, withCharacter(INITIAL_TEAM_STATE, 2, 11), 0));
    // 選んでいる編成（0）のニケ 10 は数えない
    expect([...otherPartyResourceIds(parties)]).toEqual([[11, [2]]]);
    expect(otherPartyResourceIds(INITIAL_PARTIES).size).toBe(0);
  });

  it('keeps a character only in the lowest-numbered party', () => {
    // 編成 01: 10、編成 02（選んでいる）: 10 と 11、編成 03: 11
    const p0 = partyOf(withCharacter(INITIAL_TEAM_STATE, 0, 10));
    const p2 = partyOf(withCharacter(INITIAL_TEAM_STATE, 4, 11));
    const state: PartiesState = { active: 1, parties: [p0, null, p2, null, null] };
    const team = withCharacter(withCharacter(INITIAL_TEAM_STATE, 1, 10), 3, 11);
    const next = withoutCrossPartyDuplicates(state, team);
    expect(next.team.slots.map((s) => s.resourceId)).toEqual([null, null, null, 11, null]);
    expect(next.parties.parties[0]).toBe(p0);
    expect(next.parties.parties[2]!.slots.map((s) => s.resourceId)).toEqual([null, null, null, null, null]);
    expect(next.parties.active).toBe(1);
  });

  it('returns the same objects when no character is in two parties', () => {
    const state: PartiesState = {
      active: 0,
      parties: [null, partyOf(withCharacter(INITIAL_TEAM_STATE, 0, 11)), null, null, null],
    };
    const team = withCharacter(INITIAL_TEAM_STATE, 0, 10);
    const next = withoutCrossPartyDuplicates(state, team);
    expect(next.parties).toBe(state);
    expect(next.team).toBe(team);
  });
});
