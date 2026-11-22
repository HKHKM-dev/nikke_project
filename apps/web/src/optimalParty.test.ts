import { readFileSync } from 'node:fs';
import { parseSkillDefinition, type BurstStep, type CharacterData, type CharacterIndexEntry } from '@nikke/core';
import { describe, expect, it } from 'vitest';
import { candidateEntries, canFullBurst, swappedTeam, topRows, type BurstMember } from './optimalParty.ts';
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
    const rows = candidateEntries(index, team, others);
    expect(rows.map((r) => r.resourceId)).toEqual([4, 5]);
  });
});

const dataJson = <T>(path: string) =>
  JSON.parse(readFileSync(new URL(`../../../packages/core/data/${path}`, import.meta.url), 'utf8')) as T;
const character = (id: number) => dataJson<CharacterData>(`characters/${id}.json`);
const member = (id: number, withDefinition = false): BurstMember => ({
  character: character(id),
  definition: withDefinition ? parseSkillDefinition(dataJson(`skills/${id}.json`)) : null,
});

describe('canFullBurst', () => {
  // ラピ：レッドフード（16）は基本が III で、基本の段が I の味方がいなければ I に変わる（戦闘補助）
  const RAPI_RH = 16;
  const [II, III, III2] = [105, 10, 100];

  it('needs steps I, II and III', () => {
    expect([RAPI_RH, II, III, III2].map((id) => character(id).burstStep)).toEqual(['Step3', 'Step2', 'Step3', 'Step3']);
    expect(canFullBurst([member(II), member(III), null])).toBe(false);
  });

  it('counts the burst stage a character takes in this team, not the base one', () => {
    // I の味方がいない編成では、ラピ：レッドフードが I になる（スキル定義を読んでいれば）
    expect(canFullBurst([member(RAPI_RH, true), member(II), member(III), member(III2)])).toBe(true);
    // 定義が無いときは基本の III のまま
    expect(canFullBurst([member(RAPI_RH), member(II), member(III), member(III2)])).toBe(false);
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
