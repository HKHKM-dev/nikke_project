import { describe, expect, it } from 'vitest';
import type { CharacterIndexEntry } from '@nikke/core';
import { INITIAL_PARTIES, parseParties, partyOf, serializeParties, switchParty } from './parties.ts';
import { INITIAL_TEAM_STATE, TEAM_FORMAT_VERSION, teamReducer, type TeamState } from './team.ts';

const index = [{ resourceId: 10 }, { resourceId: 11 }] as unknown as CharacterIndexEntry[];

function withCharacter(team: TeamState, slot: number, resourceId: number): TeamState {
  return teamReducer(team, { type: 'selectCharacter', index: slot, resourceId });
}

describe('parties', () => {
  it('switching keeps the shared settings and swaps slots and focus', () => {
    let team = withCharacter(INITIAL_TEAM_STATE, 0, 10);
    team = teamReducer(team, { type: 'setControlledSlot', controlledSlot: 0 });
    team = teamReducer(team, { type: 'setDuration', durationSeconds: 60 });

    const to1 = switchParty(INITIAL_PARTIES, team, 1);
    expect(to1.parties.active).toBe(1);
    expect(to1.team.slots.every((s) => s.resourceId === null)).toBe(true);
    expect(to1.team.controlledSlot).toBe(INITIAL_TEAM_STATE.controlledSlot);
    expect(to1.team.durationSeconds).toBe(60);

    const team1 = withCharacter(to1.team, 2, 11);
    const back = switchParty(to1.parties, team1, 0);
    expect(back.team.slots[0]!.resourceId).toBe(10);
    expect(back.team.controlledSlot).toBe(0);
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
    raw.parties[2] = { slots: 'x', controlledSlot: 0 };
    const read = parseParties(JSON.stringify(raw), index);
    expect(read?.parties[0]?.slots[0]?.resourceId).toBe(10);
    expect(read?.parties[2]).toBeNull();
    expect(parseParties(JSON.stringify({ ...raw, active: 5 }), index)).toBeNull();
    expect(parseParties(JSON.stringify({ ...raw, parties: [] }), index)).toBeNull();
    expect(parseParties('{', index)).toBeNull();
    expect(parseParties(null, index)).toBeNull();
  });

  it('reads the versions the team reads, and rejects an unknown (newer) formatVersion', () => {
    const { parties } = switchParty(INITIAL_PARTIES, withCharacter(INITIAL_TEAM_STATE, 0, 10), 1);
    const raw = JSON.parse(serializeParties(parties));
    expect(raw.formatVersion).toBe(TEAM_FORMAT_VERSION);
    // 版のない旧形式と、古い版も読む
    const { formatVersion: _v, ...unversioned } = raw;
    expect(parseParties(JSON.stringify(unversioned), index)).toEqual(parties);
    expect(parseParties(JSON.stringify({ ...raw, formatVersion: 1 }), index)).toEqual(parties);
    for (const formatVersion of [TEAM_FORMAT_VERSION + 1, 0, 1.5, '2']) {
      expect(parseParties(JSON.stringify({ ...raw, formatVersion }), index)).toBeNull();
    }
  });

  it('writes back what it restored without changing it (the screen saves right after restoring)', () => {
    let team = withCharacter(INITIAL_TEAM_STATE, 0, 10);
    team = teamReducer(team, { type: 'setControlledSlot', controlledSlot: 0 });
    let { parties } = switchParty(INITIAL_PARTIES, team, 1);
    ({ parties } = switchParty(parties, withCharacter(INITIAL_TEAM_STATE, 3, 11), 2));
    const saved = serializeParties(parties);
    const restored = parseParties(saved, index)!;
    expect(serializeParties(restored)).toBe(saved);

    // 版のない旧形式は、いまの版で書き戻す（中身は同じ）
    const { formatVersion: _v, ...old } = JSON.parse(saved);
    const fromOld = parseParties(JSON.stringify(old), index)!;
    expect(serializeParties(fromOld)).toBe(saved);

    // 読めなかった編成（index に無いニケ）は、空にして書き戻す
    const broken = JSON.parse(saved);
    broken.parties[0].slots[0].resourceId = 999;
    const written = JSON.parse(serializeParties(parseParties(JSON.stringify(broken), index)!));
    expect(written.parties[0]).toBeNull();
    expect(written.parties[1]).toEqual(JSON.parse(saved).parties[1]);
  });
});
