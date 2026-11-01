import type { CharacterData, TeamResult } from '@nikke/core';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { INITIAL_PARTIES, partyOf, sharedSettingsOf } from './parties.ts';
import { partyInputs, partyTotals, type PartyInputDeps } from './partyTotals.ts';
import { initialTeamState, teamReducer } from './team.ts';

const LAPI = 10;
const lapi = JSON.parse(
  readFileSync(new URL(`../../../packages/core/data/characters/${LAPI}.json`, import.meta.url), 'utf8'),
) as CharacterData;

const team = teamReducer(initialTeamState(), { type: 'selectCharacter', index: 0, resourceId: LAPI });
const parties = {
  active: 0,
  parties: [null, partyOf(team), null, partyOf(teamReducer(team, { type: 'setSynchroLevel', synchroLevel: 1 })), null],
};

function deps(over: Partial<PartyInputDeps> = {}): PartyInputDeps {
  return {
    characters: new Map([[LAPI, lapi]]),
    characterErrors: new Map(),
    // スキル定義の索引に無いキャラ（未定義）として読み込み済み
    skills: { index: new Set(), indexError: null, fullySupported: null, definitions: new Map(), errors: new Map() },
    masters: null,
    enemyMaster: null,
    ...over,
  };
}

describe('partyInputs', () => {
  it('builds the inputs of the other parties with the shared settings of the screen', () => {
    const shared = sharedSettingsOf(teamReducer(team, { type: 'setSynchroLevel', synchroLevel: 120 }));
    const inputs = partyInputs(parties, shared, deps());
    expect(inputs.map((p) => p.kind)).toEqual(['active', 'ready', 'empty', 'ready', 'empty']);
    // 編成ごとに持つのはスロットだけで、シンクロレベルは画面の共通の設定
    for (const i of [1, 3]) {
      const p = inputs[i]!;
      expect(p.kind === 'ready' && p.input.slots[0]?.growth.level).toBe(120);
    }
  });

  it('waits while a character or a skill definition of the party is loading', () => {
    const shared = sharedSettingsOf(team);
    expect(partyInputs(parties, shared, deps({ characters: new Map() }))[1]!.kind).toBe('loading');
    const skills = { ...deps().skills, index: null };
    expect(partyInputs(parties, shared, deps({ skills }))[1]!.kind).toBe('loading');
    expect(partyInputs(INITIAL_PARTIES, shared, deps()).map((p) => p.kind)).toEqual([
      'active',
      'empty',
      'empty',
      'empty',
      'empty',
    ]);
  });
});

describe('partyTotals', () => {
  const ok = (totalDamage: number) => ({ ok: true as const, result: { totalDamage } as TeamResult });

  it('adds the active party and the computed other parties', () => {
    const inputs = partyInputs(parties, sharedSettingsOf(team), deps());
    const totals = partyTotals(inputs, ok(100), [null, ok(20), null, { ok: false, error: 'x' }, null]);
    expect(totals.parties.map((p) => p.total)).toEqual([100, 20, null, null, null]);
    expect(totals.parties[3]).toMatchObject({ kind: 'ready', error: 'x' });
    expect(totals.total).toBe(120);
  });

  it('leaves out the parties without results yet', () => {
    const inputs = partyInputs(parties, sharedSettingsOf(team), deps());
    expect(partyTotals(inputs, null, null)).toEqual({
      parties: inputs.map((p) => ({ kind: p.kind, total: null })),
      total: 0,
    });
  });
});
