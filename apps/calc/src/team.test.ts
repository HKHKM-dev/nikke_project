import type { CharacterIndexEntry } from '@nikke/core';
import { describe, expect, it } from 'vitest';
import {
  INITIAL_TEAM_STATE,
  initialTeamState,
  parseTeamState,
  serializeTeamState,
  takenResourceIds,
  teamReducer,
  type TeamState,
} from './team.ts';

function entry(resourceId: number): CharacterIndexEntry {
  return {
    resourceId,
    name: { ja: `ニケ${resourceId}`, en: `Nikke ${resourceId}` },
    rarity: 'SSR',
    class: 'Attacker',
    corporation: 'ELYSION',
    element: 'Fire',
    weaponType: 'AR',
    burstStep: 'Step3',
  };
}
const index = [10, 20, 30, 40, 50, 60].map(entry);

function withCharacters(ids: (number | null)[]): TeamState {
  return ids.reduce(
    (state, id, i) => (id === null ? state : teamReducer(state, { type: 'selectCharacter', index: i, resourceId: id })),
    initialTeamState(),
  );
}

describe('teamReducer', () => {
  it('starts with five empty slots and the shooting-range enemy', () => {
    expect(INITIAL_TEAM_STATE.slots).toHaveLength(5);
    expect(INITIAL_TEAM_STATE.slots.every((s) => s.resourceId === null)).toBe(true);
    expect(INITIAL_TEAM_STATE.enemy).toEqual({ defence: 100, element: null, hasCore: true });
    expect(INITIAL_TEAM_STATE.durationSeconds).toBe(180);
    expect(INITIAL_TEAM_STATE.fixedSpec).toBe(false);
  });

  it('selects a character into a slot and ignores a duplicate in another slot', () => {
    const s1 = teamReducer(initialTeamState(), { type: 'selectCharacter', index: 0, resourceId: 10 });
    expect(s1.slots[0]?.resourceId).toBe(10);
    const s2 = teamReducer(s1, { type: 'selectCharacter', index: 2, resourceId: 10 });
    expect(s2).toBe(s1);
    // 同じ枠に同じニケを選び直すのは許す
    const s3 = teamReducer(s1, { type: 'selectCharacter', index: 0, resourceId: 10 });
    expect(s3.slots[0]?.resourceId).toBe(10);
  });

  it('clearSlot keeps growth and condition of that slot', () => {
    let s = withCharacters([10, 20]);
    s = teamReducer(s, { type: 'setGrowth', index: 1, growth: { level: 150, grade: 1, core: 2 } });
    s = teamReducer(s, { type: 'clearSlot', index: 1 });
    expect(s.slots[1]?.resourceId).toBeNull();
    expect(s.slots[1]?.growth).toEqual({ level: 150, grade: 1, core: 2 });
    expect(s.slots[0]?.resourceId).toBe(10);
  });

  it('ignores actions on a slot index that does not exist', () => {
    const s = initialTeamState();
    expect(teamReducer(s, { type: 'clearSlot', index: 7 })).toBe(s);
  });

  it('setFixedSpec(true) switches to shooting-range defence but keeps the duration; false only turns it off', () => {
    let s = teamReducer(initialTeamState(), {
      type: 'setEnemy',
      enemy: { defence: 140, element: 'Wind', hasCore: true },
    });
    s = teamReducer(s, { type: 'setDuration', durationSeconds: 120 });
    s = teamReducer(s, { type: 'setFixedSpec', fixedSpec: true });
    expect(s.fixedSpec).toBe(true);
    expect(s.enemy).toEqual({ defence: 100, element: 'Wind', hasCore: true });
    expect(s.durationSeconds).toBe(120);
    s = teamReducer(s, { type: 'setFixedSpec', fixedSpec: false });
    expect(s.fixedSpec).toBe(false);
    expect(s.enemy.defence).toBe(100);
    expect(s.durationSeconds).toBe(120);
  });

  it('takenResourceIds excludes the slot itself', () => {
    const s = withCharacters([10, 20, null, 30]);
    expect([...takenResourceIds(s, 1)].sort()).toEqual([10, 30]);
    expect([...takenResourceIds(s, 2)].sort()).toEqual([10, 20, 30]);
  });
});

describe('parseTeamState', () => {
  it('round-trips a serialized state', () => {
    let s = withCharacters([10, null, 30]);
    s = teamReducer(s, {
      type: 'setSlotCondition',
      index: 0,
      condition: { coreHitRate: 0.4, distanceBonus: false, fullCharge: true },
    });
    s = teamReducer(s, { type: 'setFixedSpec', fixedSpec: true });
    expect(parseTeamState(serializeTeamState(s), index)).toEqual(s);
  });

  it('returns null for missing, malformed or wrongly shaped input', () => {
    expect(parseTeamState(null, index)).toBeNull();
    expect(parseTeamState('{not json', index)).toBeNull();
    expect(parseTeamState('[]', index)).toBeNull();
    expect(parseTeamState(JSON.stringify({ ...initialTeamState(), slots: [] }), index)).toBeNull();
    expect(parseTeamState(JSON.stringify({ ...initialTeamState(), durationSeconds: -1 }), index)).toBeNull();
    expect(parseTeamState(JSON.stringify({ ...initialTeamState(), fixedSpec: 'yes' }), index)).toBeNull();
  });

  it('rejects unknown or duplicated resource ids and out-of-range values', () => {
    const unknown = withCharacters([10]);
    unknown.slots[0]!.resourceId = 999;
    expect(parseTeamState(serializeTeamState(unknown), index)).toBeNull();

    const dup = withCharacters([10, 20]);
    dup.slots[1]!.resourceId = 10;
    expect(parseTeamState(serializeTeamState(dup), index)).toBeNull();

    const badRate = withCharacters([10]);
    badRate.slots[0]!.condition = { coreHitRate: 1.5, distanceBonus: true, fullCharge: true };
    expect(parseTeamState(serializeTeamState(badRate), index)).toBeNull();

    const badElement = { ...initialTeamState(), enemy: { defence: 100, element: 'Plasma', hasCore: true } };
    expect(parseTeamState(JSON.stringify(badElement), index)).toBeNull();
  });

  it('drops unknown fields instead of carrying them over', () => {
    const raw = { ...initialTeamState(), extra: 1 };
    const parsed = parseTeamState(JSON.stringify(raw), index);
    expect(parsed).toEqual(initialTeamState());
  });
});
