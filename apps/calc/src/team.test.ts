import type { CharacterData, CharacterIndexEntry } from '@nikke/core';
import { describe, expect, it } from 'vitest';
import {
  INITIAL_TEAM_STATE,
  clampSkillLevel,
  effectiveSkillLevels,
  effectiveTreasurePhase,
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
    expect(INITIAL_TEAM_STATE.burst).toBe(true);
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

describe('burst toggle (Stage 5)', () => {
  it('setBurst toggles the fixed cycle and round-trips', () => {
    const off = teamReducer(initialTeamState(), { type: 'setBurst', burst: false });
    expect(off.burst).toBe(false);
    expect(parseTeamState(serializeTeamState(off), index)).toEqual(off);
    expect(teamReducer(off, { type: 'setBurst', burst: true }).burst).toBe(true);
  });

  it('parseTeamState fills a missing burst flag (Stage 4 data) with true and rejects non-booleans', () => {
    const stage4 = JSON.parse(serializeTeamState(withCharacters([10]))) as Record<string, unknown>;
    delete stage4.burst;
    expect(parseTeamState(JSON.stringify(stage4), index)?.burst).toBe(true);
    expect(parseTeamState(JSON.stringify({ ...stage4, burst: 'on' }), index)).toBeNull();
  });
});

describe('controlled slot (Stage 7)', () => {
  it('defaults to null (everyone is AI), updates and round-trips', () => {
    expect(INITIAL_TEAM_STATE.controlledSlot).toBeNull();
    const s1 = teamReducer(withCharacters([10, 20]), { type: 'setControlledSlot', controlledSlot: 1 });
    expect(s1.controlledSlot).toBe(1);
    expect(parseTeamState(serializeTeamState(s1), index)).toEqual(s1);
  });

  it('parseTeamState fills a missing value (Stage 6 data) with null and rejects out-of-range values', () => {
    const stage6 = JSON.parse(serializeTeamState(withCharacters([10]))) as Record<string, unknown>;
    delete stage6.controlledSlot;
    expect(parseTeamState(JSON.stringify(stage6), index)?.controlledSlot).toBeNull();
    expect(parseTeamState(JSON.stringify({ ...stage6, controlledSlot: 5 }), index)).toBeNull();
    expect(parseTeamState(JSON.stringify({ ...stage6, controlledSlot: '1' }), index)).toBeNull();
  });
});

describe('skill levels (Stage 4)', () => {
  it('defaults every slot to Lv10 and updates per slot', () => {
    const s0 = initialTeamState();
    expect(
      s0.slots.every((s) => s.skillLevels.skill1 === 10 && s.skillLevels.skill2 === 10 && s.skillLevels.burst === 10),
    ).toBe(true);
    const s1 = teamReducer(s0, { type: 'setSkillLevels', index: 2, skillLevels: { skill1: 4, skill2: 10, burst: 7 } });
    expect(s1.slots[2]?.skillLevels).toEqual({ skill1: 4, skill2: 10, burst: 7 });
    expect(s1.slots[1]?.skillLevels).toEqual({ skill1: 10, skill2: 10, burst: 10 });
    expect(teamReducer(s0, { type: 'setSkillLevels', index: 9, skillLevels: { skill1: 1, skill2: 1, burst: 1 } })).toBe(
      s0,
    );
  });

  it('clearSlot keeps skill levels; fixedSpec forces Lv10 without touching the stored levels', () => {
    let s = teamReducer(initialTeamState(), { type: 'selectCharacter', index: 0, resourceId: 10 });
    s = teamReducer(s, { type: 'setSkillLevels', index: 0, skillLevels: { skill1: 3, skill2: 3, burst: 3 } });
    expect(effectiveSkillLevels(s.slots[0]!, false)).toEqual({ skill1: 3, skill2: 3, burst: 3 });
    expect(effectiveSkillLevels(s.slots[0]!, true)).toEqual({ skill1: 10, skill2: 10, burst: 10 });
    s = teamReducer(s, { type: 'clearSlot', index: 0 });
    expect(s.slots[0]?.skillLevels).toEqual({ skill1: 3, skill2: 3, burst: 3 });
  });

  it('clampSkillLevel keeps typed values inside 1..10', () => {
    expect(clampSkillLevel(0)).toBe(1);
    expect(clampSkillLevel(11)).toBe(10);
    expect(clampSkillLevel(4.6)).toBe(5);
    expect(clampSkillLevel(Number.NaN)).toBe(1);
  });

  it('parseTeamState fills missing skill levels (Stage 3 data) with 10 and rejects out-of-range ones', () => {
    const stage3 = JSON.parse(serializeTeamState(withCharacters([10, 20]))) as { slots: Record<string, unknown>[] };
    for (const s of stage3.slots) delete s.skillLevels;
    const parsed = parseTeamState(JSON.stringify(stage3), index);
    expect(parsed?.slots.every((s) => s.skillLevels.skill1 === 10)).toBe(true);

    for (const bad of [0, 11, 2.5, '10']) {
      const raw = JSON.parse(serializeTeamState(withCharacters([10]))) as { slots: Record<string, unknown>[] };
      raw.slots[0]!.skillLevels = { skill1: bad, skill2: 10, burst: 10 };
      expect(parseTeamState(JSON.stringify(raw), index), String(bad)).toBeNull();
    }
    const missingSlot = JSON.parse(serializeTeamState(withCharacters([10]))) as { slots: Record<string, unknown>[] };
    missingSlot.slots[0]!.skillLevels = { skill1: 10, skill2: 10 };
    expect(parseTeamState(JSON.stringify(missingSlot), index)).toBeNull();
  });

  it('round-trips skill levels', () => {
    let s = withCharacters([10, null, 30]);
    s = teamReducer(s, { type: 'setSkillLevels', index: 2, skillLevels: { skill1: 1, skill2: 5, burst: 9 } });
    expect(parseTeamState(serializeTeamState(s), index)).toEqual(s);
  });
});

describe('treasure phase (Stage 9)', () => {
  it('defaults to 0, updates per slot and resets when the character changes or the slot is cleared', () => {
    let s = withCharacters([10, 20]);
    expect(s.slots.every((slot) => slot.treasurePhase === 0)).toBe(true);
    s = teamReducer(s, { type: 'setTreasurePhase', index: 0, treasurePhase: 3 });
    expect(s.slots.map((slot) => slot.treasurePhase)).toEqual([3, 0, 0, 0, 0]);
    // 同じニケを選び直しても変わらない
    expect(teamReducer(s, { type: 'selectCharacter', index: 0, resourceId: 10 }).slots[0]!.treasurePhase).toBe(3);
    expect(teamReducer(s, { type: 'selectCharacter', index: 0, resourceId: 30 }).slots[0]!.treasurePhase).toBe(0);
    expect(teamReducer(s, { type: 'clearSlot', index: 0 }).slots[0]!.treasurePhase).toBe(0);
  });

  it('keeps the phase under fixed spec, and uses 0 for characters without a treasure', () => {
    let s = withCharacters([10]);
    s = teamReducer(s, { type: 'setTreasurePhase', index: 0, treasurePhase: 2 });
    s = teamReducer(s, { type: 'setFixedSpec', fixedSpec: true });
    const withTreasure = { treasure: { unlockOrder: ['skill1', 'skill2', 'burst'] } } as unknown as CharacterData;
    const without = { treasure: null } as unknown as CharacterData;
    expect(effectiveTreasurePhase(s.slots[0]!, withTreasure)).toBe(2);
    expect(effectiveTreasurePhase(s.slots[0]!, without)).toBe(0);
  });

  it('parseTeamState fills a missing phase (Stage 8 data) with 0, rejects out-of-range ones and round-trips', () => {
    const stage8 = JSON.parse(serializeTeamState(withCharacters([10, 20]))) as { slots: Record<string, unknown>[] };
    for (const slot of stage8.slots) delete slot.treasurePhase;
    expect(parseTeamState(JSON.stringify(stage8), index)?.slots.every((slot) => slot.treasurePhase === 0)).toBe(true);
    for (const bad of [-1, 4, 1.5, '1']) {
      const raw = JSON.parse(serializeTeamState(withCharacters([10]))) as { slots: Record<string, unknown>[] };
      raw.slots[0]!.treasurePhase = bad;
      expect(parseTeamState(JSON.stringify(raw), index), String(bad)).toBeNull();
    }
    const s = teamReducer(withCharacters([10]), { type: 'setTreasurePhase', index: 0, treasurePhase: 1 });
    expect(parseTeamState(serializeTeamState(s), index)).toEqual(s);
  });
});

describe('build (Stage 12)', () => {
  it('defaults to an empty build, updates per slot and survives a character change', () => {
    let s = withCharacters([10]);
    expect(s.slots[0]?.build.affectionRank).toBe(1);
    expect(s.slots[0]?.build.gear.head).toBeNull();
    const build = {
      ...s.slots[0]!.build,
      affectionRank: 30,
      gear: { ...s.slots[0]!.build.gear, head: { type: 'T9' as const, level: 5 } },
      cube: { id: 1000301, level: 15 },
    };
    s = teamReducer(s, { type: 'setBuild', index: 0, build });
    expect(s.slots[0]?.build).toEqual(build);
    s = teamReducer(s, { type: 'selectCharacter', index: 0, resourceId: 20 });
    expect(s.slots[0]?.build).toEqual(build);
    expect(parseTeamState(serializeTeamState(s), index)).toEqual(s);
  });

  it('parseTeamState fills a missing build (Stage 11 data) with an empty one and rejects bad values', () => {
    const stage11 = JSON.parse(serializeTeamState(withCharacters([10]))) as Record<string, unknown>;
    const slots = stage11.slots as Record<string, unknown>[];
    for (const slot of slots) delete slot.build;
    expect(parseTeamState(JSON.stringify(stage11), index)?.slots[0]?.build.cube).toBeNull();
    const bad = [
      { affectionRank: 0 },
      { affectionRank: 41 },
      { gear: { head: { type: 'T8', level: 0 }, body: null, arm: null, leg: null } },
      { gear: { head: { type: 'T9', level: 6 }, body: null, arm: null, leg: null } },
      { cube: { id: 1000301, level: 16 } },
      { collection: { rarity: 'SSR', level: 1 } },
      { recycleRoom: { personal: -1, class: 0, corporation: 0 } },
      { extraAttack: -5 },
    ];
    const ok = JSON.parse(serializeTeamState(withCharacters([10]))) as { slots: { build: Record<string, unknown> }[] };
    for (const patch of bad) {
      const raw = { ...ok, slots: ok.slots.map((s, i) => (i === 0 ? { ...s, build: { ...s.build, ...patch } } : s)) };
      expect(parseTeamState(JSON.stringify(raw), index), JSON.stringify(patch)).toBeNull();
    }
  });
});

describe('OL lines (Stage 13)', () => {
  const withGear = (head: unknown) => {
    const ok = JSON.parse(serializeTeamState(withCharacters([10]))) as { slots: { build: Record<string, unknown> }[] };
    return JSON.stringify({
      ...ok,
      slots: ok.slots.map((s, i) =>
        i === 0 ? { ...s, build: { ...s.build, gear: { head, body: null, arm: null, leg: null } } } : s,
      ),
    });
  };

  it('round-trips OL gear with option lines; Stage 12 data without lines still reads', () => {
    let s = withCharacters([10]);
    const build = {
      ...s.slots[0]!.build,
      gear: {
        ...s.slots[0]!.build.gear,
        head: {
          type: 'OL' as const,
          level: 5,
          overload: [
            { option: 'attack' as const, level: 15 },
            { option: 'elementDamage' as const, level: 11 },
          ],
        },
      },
    };
    s = teamReducer(s, { type: 'setBuild', index: 0, build });
    expect(parseTeamState(serializeTeamState(s), index)).toEqual(s);
    expect(parseTeamState(withGear({ type: 'OL', level: 5 }), index)?.slots[0]?.build.gear.head).toEqual({
      type: 'OL',
      level: 5,
    });
  });

  it('rejects lines on non-OL gear, more than 3 lines, unknown options and levels out of 1..15', () => {
    const line = (option: string, level: number) => ({ option, level });
    const bad = [
      { type: 'T9', level: 5, overload: [line('attack', 1)] },
      { type: 'OL', level: 5, overload: [line('attack', 1), line('attack', 1), line('attack', 1), line('attack', 1)] },
      { type: 'OL', level: 5, overload: [line('speed', 1)] },
      { type: 'OL', level: 5, overload: [line('attack', 0)] },
      { type: 'OL', level: 5, overload: [line('attack', 16)] },
      { type: 'OL', level: 5, overload: 'attack' },
    ];
    for (const head of bad) expect(parseTeamState(withGear(head), index), JSON.stringify(head)).toBeNull();
  });
});
