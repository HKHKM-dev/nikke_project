import type { CharacterData, CharacterIndexEntry, EnemyPresetMaster } from '@nikke/core';
import { describe, expect, it } from 'vitest';
import {
  INITIAL_TEAM_STATE,
  clampSkillLevel,
  effectiveSkillLevels,
  effectiveTreasurePhase,
  enemyWithEvents,
  TEAM_FORMAT_VERSION,
  initialTeamState,
  parseTeamState,
  readSlotBuildJson,
  readTeamJson,
  serializeSlotBuild,
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
  it('defaults to slot 3, updates and round-trips', () => {
    expect(INITIAL_TEAM_STATE.controlledSlot).toBe(2);
    const s1 = teamReducer(withCharacters([10, 20]), { type: 'setControlledSlot', controlledSlot: 1 });
    expect(s1.controlledSlot).toBe(1);
    expect(parseTeamState(serializeTeamState(s1), index)).toEqual(s1);
  });

  it('parseTeamState fills a missing or null value with slot 3 and rejects out-of-range values', () => {
    const stage6 = JSON.parse(serializeTeamState(withCharacters([10]))) as Record<string, unknown>;
    delete stage6.controlledSlot;
    expect(parseTeamState(JSON.stringify(stage6), index)?.controlledSlot).toBe(2);
    expect(parseTeamState(JSON.stringify({ ...stage6, controlledSlot: null }), index)?.controlledSlot).toBe(2);
    expect(parseTeamState(JSON.stringify({ ...stage6, controlledSlot: 5 }), index)).toBeNull();
    expect(parseTeamState(JSON.stringify({ ...stage6, controlledSlot: '1' }), index)).toBeNull();
  });
});

describe('enemy event sets (Stage 16-B)', () => {
  const master: EnemyPresetMaster = {
    formatVersion: 1,
    source: '',
    eventSets: [
      {
        id: 'jump',
        name: { ja: 'ジャンプ', en: 'Jump' },
        events: [{ kind: 'untargetable', first: 31, duration: 2, every: 36.4 }],
        source: 'test',
      },
    ],
    targetProfiles: [],
    enemies: [
      {
        id: 'range',
        name: { ja: '的', en: 'Target' },
        content: 'range',
        element: 'Wind',
        hasCore: true,
        defence: 100,
        level: null,
        measuredAt: '2026-09-26',
        source: 'test',
        eventSets: ['jump'],
      },
    ],
  };
  const enemy = { defence: 100, element: 'Wind' as const, hasCore: true };

  it('defaults to off, updates and round-trips; a missing value (older saves) is off', () => {
    expect(INITIAL_TEAM_STATE.enemyEventSets).toEqual([]);
    const s1 = teamReducer(withCharacters([10]), { type: 'setEnemyEventSets', enemyEventSets: ['jump'] });
    expect(s1.enemyEventSets).toEqual(['jump']);
    expect(parseTeamState(serializeTeamState(s1), index)).toEqual(s1);
    const old = JSON.parse(serializeTeamState(withCharacters([10]))) as Record<string, unknown>;
    delete old.enemyEventSets;
    expect(parseTeamState(JSON.stringify(old), index)?.enemyEventSets).toEqual([]);
    expect(parseTeamState(JSON.stringify({ ...old, enemyEventSets: 'jump' }), index)).toBeNull();
  });

  it('adds the events only when the set is on and the enemy matches a preset that has it', () => {
    expect(enemyWithEvents(enemy, master, [], 180)).toBe(enemy);
    expect(enemyWithEvents(enemy, null, ['jump'], 180)).toBe(enemy);
    expect(enemyWithEvents({ ...enemy, defence: 140 }, master, ['jump'], 180).events).toBeUndefined();
    const withJumps = enemyWithEvents(enemy, master, ['jump'], 180);
    expect(withJumps.events?.map((e) => e.start.toFixed(1))).toEqual(['31.0', '67.4', '103.8', '140.2', '176.6']);
    expect(enemyWithEvents(enemy, master, ['jump'], 60).events).toHaveLength(1);
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

describe('save format version (Stage 14)', () => {
  it('writes formatVersion and reads it back; unversioned data (Stage 3〜13) still reads', () => {
    const s = withCharacters([10, 20]);
    const json = serializeTeamState(s);
    expect((JSON.parse(json) as { formatVersion: number }).formatVersion).toBe(TEAM_FORMAT_VERSION);
    expect(parseTeamState(json, index)).toEqual(s);
    const { formatVersion: _v, ...legacy } = JSON.parse(json) as Record<string, unknown>;
    expect(parseTeamState(JSON.stringify(legacy), index)).toEqual(s);
  });

  it('readTeamJson says why a JSON cannot be read', () => {
    const s = withCharacters([10]);
    const newer = JSON.stringify({ ...(JSON.parse(serializeTeamState(s)) as object), formatVersion: 99 });
    expect(readTeamJson(newer, index)).toEqual({ ok: false, error: expect.stringContaining('formatVersion 99') });
    expect(readTeamJson('{', index)).toEqual({ ok: false, error: 'JSON として読めません' });
    expect(readTeamJson('[]', index).ok).toBe(false);
    const unknown = JSON.stringify({ ...(JSON.parse(serializeTeamState(s)) as object), durationSeconds: -1 });
    expect(readTeamJson(unknown, index)).toEqual({ ok: false, error: expect.stringContaining('形が合いません') });
    expect(readTeamJson(serializeTeamState(s), index)).toEqual({ ok: true, value: s });
  });
});

describe('slot build JSON (Stage 14)', () => {
  const build = {
    ...initialTeamState().slots[0]!.build,
    affectionRank: 30,
    gear: {
      head: { type: 'OL' as const, level: 5, overload: [{ option: 'attack' as const, level: 15 }] },
      body: { type: 'T9' as const, level: 5 },
      arm: null,
      leg: null,
    },
    cube: { id: 1000303, level: 15 },
  };
  const growth = { level: 400, grade: 3, core: 7 };

  it('round-trips growth and build', () => {
    expect(readSlotBuildJson(serializeSlotBuild({ growth, build }))).toEqual({ ok: true, value: { growth, build } });
  });

  it('reads a CLI --build entry (partial build, optional growth), filling the rest with an empty build', () => {
    const cli = { affectionRank: 30, gear: { head: { type: 'T9', level: 5 } }, cube: { id: 1000303, level: 15 } };
    const r = readSlotBuildJson(JSON.stringify(cli));
    expect(r.ok && r.value.growth).toBeNull();
    expect(r.ok && r.value.build.gear).toEqual({ head: { type: 'T9', level: 5 }, body: null, arm: null, leg: null });
    expect(r.ok && r.value.build.recycleRoom).toEqual({ personal: 0, class: 0, corporation: 0 });
    const withGrowth = readSlotBuildJson(JSON.stringify({ ...cli, growth }));
    expect(withGrowth.ok && withGrowth.value.growth).toEqual(growth);
  });

  it('rejects unknown versions, bad values and bad growth', () => {
    expect(readSlotBuildJson(JSON.stringify({ formatVersion: 2, build })).ok).toBe(false);
    expect(readSlotBuildJson(JSON.stringify({ affectionRank: 41 })).ok).toBe(false);
    expect(readSlotBuildJson(JSON.stringify({ build, growth: { level: 0 } })).ok).toBe(false);
    expect(readSlotBuildJson('nope').ok).toBe(false);
  });
});

describe('hit rate (Stage 15)', () => {
  it('defaults to 1, round-trips, and reads Stage 14 data without it (treated as 1)', () => {
    let s = withCharacters([10]);
    expect(s.slots[0]?.condition.hitRate).toBe(1);
    s = teamReducer(s, {
      type: 'setSlotCondition',
      index: 0,
      condition: { ...s.slots[0]!.condition, hitRate: 0.8 },
    });
    expect(parseTeamState(serializeTeamState(s), index)?.slots[0]?.condition.hitRate).toBe(0.8);
    const raw = JSON.parse(serializeTeamState(s)) as { slots: { condition: Record<string, unknown> }[] };
    for (const slot of raw.slots) delete slot.condition.hitRate;
    // 欠落は欠落のまま（計算では 1 = 射撃場）
    expect(parseTeamState(JSON.stringify(raw), index)?.slots.every((x) => x.condition.hitRate === undefined)).toBe(
      true,
    );
    for (const bad of [-0.1, 1.5, '1']) {
      raw.slots[0]!.condition.hitRate = bad;
      expect(parseTeamState(JSON.stringify(raw), index), String(bad)).toBeNull();
    }
  });
});
