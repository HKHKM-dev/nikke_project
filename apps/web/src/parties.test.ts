import { describe, expect, it } from 'vitest';
import type { CharacterIndexEntry } from '@nikke/core';
import { INITIAL_PARTIES, parseParties, partyOf, serializeParties, switchParty } from './parties.ts';
import { INITIAL_TEAM_STATE, teamReducer, type TeamState } from './team.ts';

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
});
