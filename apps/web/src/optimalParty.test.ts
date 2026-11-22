import type { BurstStep, CharacterIndexEntry } from '@nikke/core';
import { describe, expect, it } from 'vitest';
import { candidateEntries, canFullBurst, swappedTeam, topRows } from './optimalParty.ts';
import { INITIAL_TEAM_STATE, teamReducer } from './team.ts';

const entry = (resourceId: number, burstStep: BurstStep = 'Step1') =>
  ({ resourceId, burstStep }) as CharacterIndexEntry;

describe('candidateEntries', () => {
  it('leaves out the characters in this party and in the other parties', () => {
    let team = teamReducer(INITIAL_TEAM_STATE, { type: 'selectCharacter', index: 0, resourceId: 1 });
    team = teamReducer(team, { type: 'selectCharacter', index: 1, resourceId: 2 });
    team = teamReducer(team, { type: 'selectCharacter', index: 2, resourceId: 6 });
    const others = new Map([[3, [2]]]);
    const index = [
      entry(1, 'Step1'),
      entry(2, 'Step2'),
      entry(3, 'Step1'),
      entry(4, 'Step1'),
      entry(5, 'Step1'),
      entry(6, 'Step3'),
    ];
    const rows = candidateEntries(index, team, others, 0);
    expect(rows.map((r) => r.resourceId)).toEqual([4, 5]);
  });
});

describe('canFullBurst', () => {
  it('needs steps I, II and III, and lets an all-step character fill a missing one', () => {
    expect(canFullBurst([entry(1, 'Step1'), entry(2, 'Step2'), entry(3, 'Step3'), null])).toBe(true);
    expect(canFullBurst([entry(1, 'Step1'), entry(2, 'Step1'), entry(3, 'Step3')])).toBe(false);
    expect(canFullBurst([entry(1, 'Step1'), entry(2, 'Step1'), entry(3, 'Step3'), entry(4, 'AllStep')])).toBe(true);
    expect(canFullBurst([entry(1, 'AllStep'), entry(2, 'Step2'), entry(3, 'Step3')])).toBe(true);
  });
});

describe('candidateEntries (full burst)', () => {
  it('leaves out the characters that stop the full burst when put in the slot', () => {
    let team = teamReducer(INITIAL_TEAM_STATE, { type: 'selectCharacter', index: 0, resourceId: 1 });
    team = teamReducer(team, { type: 'selectCharacter', index: 1, resourceId: 2 });
    team = teamReducer(team, { type: 'selectCharacter', index: 2, resourceId: 3 });
    const index = [
      entry(1, 'Step1'),
      entry(2, 'Step2'),
      entry(3, 'Step3'),
      entry(4, 'Step1'),
      entry(5, 'Step3'),
      entry(6, 'AllStep'),
    ];
    // スロット 1（段階 I）を入れ替える: 段階 I の 4 と、全段階の 6 は入れる。段階 III の 5 は、段階 I がなくなるので入れない
    expect(candidateEntries(index, team, new Map(), 0).map((r) => r.resourceId)).toEqual([4, 6]);
  });
});

describe('swappedTeam', () => {
  it('puts the character in the slot and leaves the other slots as they are', () => {
    let team = teamReducer(INITIAL_TEAM_STATE, { type: 'selectCharacter', index: 0, resourceId: 1 });
    team = teamReducer(team, { type: 'selectCharacter', index: 1, resourceId: 2 });
    const next = swappedTeam(team, null, 0, 9);
    expect(next.slots.map((s) => s.resourceId).slice(0, 2)).toEqual([9, 2]);
    expect(team.slots[0]!.resourceId).toBe(1);
  });
});

describe('topRows', () => {
  it('takes the largest totals first and keeps the order of equal values', () => {
    const rows = [
      { resourceId: 1, total: 5 },
      { resourceId: 2, total: 9 },
      { resourceId: 3, total: 5 },
      { resourceId: 4, total: Number.NaN },
      { resourceId: 5, total: 7 },
    ];
    expect(topRows(rows, 3).map((r) => r.resourceId)).toEqual([2, 5, 1]);
    expect(topRows(rows).map((r) => r.resourceId)).toEqual([2, 5, 1, 3]);
  });
});
