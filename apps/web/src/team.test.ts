import { parseEnemyPresets, type CharacterIndexEntry, type EnemyPresetMaster } from '@nikke/core';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  INITIAL_TEAM_STATE,
  emptyConsole,
  growthFieldsActions,
  sameConsole,
  recycleRoomFromConsole,
  enemyForCalc,
  enemyWithEvents,
  SHOOTING_RANGE_ENEMY,
  TEAM_FORMAT_VERSION,
  initialTeamState,
  placeCharacterAction,
  readTeamJson,
  serializeTeamState,
  takenResourceIds,
  teamReducer,
  DEFAULT_CONTROLLED_SLOT,
  type TeamState,
} from './team.ts';

/** readTeamJson の読めた中身だけ（無い・読めないは null） */
function parseTeamState(json: string | null, index: readonly CharacterIndexEntry[]): TeamState | null {
  if (json === null) return null;
  const result = readTeamJson(json, index);
  return result.ok ? result.value : null;
}

function entry(resourceId: number): CharacterIndexEntry {
  return {
    resourceId,
    nameCode: resourceId,
    name: { ja: `ニケ${resourceId}`, en: `Nikke ${resourceId}` },
    rarity: 'SSR',
    class: 'Attacker',
    corporation: 'ELYSION',
    element: 'Fire',
    weaponType: 'AR',
    burstStep: 'Step3',
    hasTreasure: false,
  };
}
const index = [10, 20, 30, 40, 50, 60].map(entry);

/** 今の版を付けた JSON（手で組んだ保存データ） */
function versioned(raw: object): string {
  return JSON.stringify({ formatVersion: TEAM_FORMAT_VERSION, ...raw });
}

function withCharacters(ids: (number | null)[]): TeamState {
  return ids.reduce(
    (state, id, i) => (id === null ? state : teamReducer(state, { type: 'selectCharacter', index: i, resourceId: id })),
    initialTeamState(),
  );
}

describe('teamReducer', () => {
  it('starts with five empty slots and the fire shooting-range enemy', () => {
    expect(INITIAL_TEAM_STATE.slots).toHaveLength(5);
    expect(INITIAL_TEAM_STATE.slots.every((s) => s.resourceId === null)).toBe(true);
    expect(INITIAL_TEAM_STATE.enemy).toEqual({ defence: 100, element: 'Fire', hasCore: true });
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

  it('swaps two slots', () => {
    const state = withCharacters([10, 20, null, null, null]);
    const swapped = teamReducer(state, { type: 'swapSlots', fromIndex: 0, toIndex: 1 });
    expect(swapped.slots[0]?.resourceId).toBe(20);
    expect(swapped.slots[1]?.resourceId).toBe(10);

    // 同じインデックスなら何もしない
    expect(teamReducer(swapped, { type: 'swapSlots', fromIndex: 1, toIndex: 1 })).toBe(swapped);
  });

  it('placeCharacterAction selects a new character and does nothing for one already in a slot', () => {
    const state = withCharacters([10, null, 30]);
    expect(placeCharacterAction(state, 20, 1)).toEqual({ type: 'selectCharacter', index: 1, resourceId: 20 });
    expect(placeCharacterAction(state, 20, 0)).toEqual({ type: 'selectCharacter', index: 0, resourceId: 20 });
    expect(placeCharacterAction(state, 30, 4)).toBeNull();
    expect(placeCharacterAction(state, 30, 2)).toBeNull();
  });

  it('clearSlot keeps growth and condition of that slot', () => {
    let s = withCharacters([10, 20]);
    s = teamReducer(s, { type: 'setGrowth', index: 1, growth: { grade: 1, core: 2 } });
    s = teamReducer(s, { type: 'clearSlot', index: 1 });
    expect(s.slots[1]?.resourceId).toBeNull();
    expect(s.slots[1]?.growth).toEqual({ grade: 1, core: 2 });
    expect(s.slots[0]?.resourceId).toBe(10);
  });

  it('ignores actions on a slot index that does not exist', () => {
    const s = initialTeamState();
    expect(teamReducer(s, { type: 'clearSlot', index: 7 })).toBe(s);
  });

  it('setFixedSpec only switches the flag (the enemy and the duration stay)', () => {
    let s = teamReducer(initialTeamState(), { type: 'setEnemy', enemy: { ...SHOOTING_RANGE_ENEMY, element: 'Wind' } });
    s = teamReducer(s, { type: 'setDuration', durationSeconds: 120 });
    s = teamReducer(s, { type: 'setFixedSpec', fixedSpec: true });
    expect(s.fixedSpec).toBe(true);
    expect(s.enemy).toEqual({ defence: 100, element: 'Wind', hasCore: true });
    expect(s.durationSeconds).toBe(120);
    expect(teamReducer(s, { type: 'setFixedSpec', fixedSpec: false }).fixedSpec).toBe(false);
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
    expect(parseTeamState(versioned({ ...initialTeamState(), slots: [] }), index)).toBeNull();
    expect(parseTeamState(versioned({ ...initialTeamState(), durationSeconds: -1 }), index)).toBeNull();
    expect(parseTeamState(versioned({ ...initialTeamState(), fixedSpec: 'yes' }), index)).toBeNull();
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
    expect(parseTeamState(versioned(badElement), index)).toBeNull();
  });

  it('drops unknown fields instead of carrying them over', () => {
    const raw = { ...initialTeamState(), extra: 1 };
    const parsed = parseTeamState(versioned(raw), index);
    expect(parsed).toEqual(initialTeamState());
  });

  it('puts the defence and core of a saved enemy back to the shooting-range enemy, keeping the element', () => {
    const raw = { ...initialTeamState(), enemy: { defence: 140, element: 'Water', hasCore: false } };
    expect(parseTeamState(versioned(raw), index)?.enemy).toEqual({ ...SHOOTING_RANGE_ENEMY, element: 'Water' });
    const none = { ...initialTeamState(), enemy: { ...SHOOTING_RANGE_ENEMY, element: null } };
    expect(parseTeamState(versioned(none), index)?.enemy.element).toBeNull();
  });
});

describe('version 2 data (fields removed from the screen)', () => {
  it('reads version 2 data, dropping the burst, the controlled slot, no fire, the slot level, the recycle room and the extra attack', () => {
    const s = withCharacters([10, 20]);
    const raw = JSON.parse(serializeTeamState(s)) as Record<string, unknown> & { slots: Record<string, unknown>[] };
    const v2 = {
      ...raw,
      formatVersion: 2,
      burst: false,
      controlledSlot: 0,
      slots: raw.slots.map((slot) => ({
        ...slot,
        noFire: true,
        growth: { ...(slot.growth as object), level: 150 },
        build: {
          ...(slot.build as object),
          recycleRoom: { personal: 1, class: 2, corporation: 3 },
          extraAttack: 500,
        },
      })),
    };
    expect(parseTeamState(JSON.stringify(v2), index)).toEqual(s);
  });
});

describe('controlled slot (version 4)', () => {
  it('moves the controlled slot, and keeps it at its position when slots are swapped', () => {
    const s = withCharacters([10, 20]);
    expect(s.controlledSlot).toBe(DEFAULT_CONTROLLED_SLOT);
    const moved = teamReducer(s, { type: 'setControlledSlot', index: 0 });
    expect(moved.controlledSlot).toBe(0);
    expect(teamReducer(moved, { type: 'swapSlots', fromIndex: 0, toIndex: 1 }).controlledSlot).toBe(0);
    expect(teamReducer(moved, { type: 'setControlledSlot', index: 5 })).toBe(moved);
  });

  it('saves and reads it; version 3 data and a missing value read as the default, an out-of-range value is rejected', () => {
    const s = teamReducer(withCharacters([10]), { type: 'setControlledSlot', index: 4 });
    expect(parseTeamState(serializeTeamState(s), index)?.controlledSlot).toBe(4);
    const raw = JSON.parse(serializeTeamState(s));
    expect(parseTeamState(JSON.stringify({ ...raw, formatVersion: 3 }), index)?.controlledSlot).toBe(
      DEFAULT_CONTROLLED_SLOT,
    );
    const { controlledSlot: _c, ...missing } = raw;
    expect(parseTeamState(JSON.stringify(missing), index)?.controlledSlot).toBe(DEFAULT_CONTROLLED_SLOT);
    for (const controlledSlot of [5, -1, 1.5, '0']) {
      expect(parseTeamState(JSON.stringify({ ...raw, controlledSlot }), index)).toBeNull();
    }
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

  it('clearSlot keeps skill levels', () => {
    let s = teamReducer(initialTeamState(), { type: 'selectCharacter', index: 0, resourceId: 10 });
    s = teamReducer(s, { type: 'setSkillLevels', index: 0, skillLevels: { skill1: 3, skill2: 3, burst: 3 } });
    s = teamReducer(s, { type: 'clearSlot', index: 0 });
    expect(s.slots[0]?.skillLevels).toEqual({ skill1: 3, skill2: 3, burst: 3 });
  });

  it('parseTeamState rejects missing or out-of-range skill levels', () => {
    const missing = JSON.parse(serializeTeamState(withCharacters([10, 20]))) as { slots: Record<string, unknown>[] };
    for (const s of missing.slots) delete s.skillLevels;
    expect(parseTeamState(JSON.stringify(missing), index)).toBeNull();

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

  it('parseTeamState rejects a missing or out-of-range phase and round-trips', () => {
    const missing = JSON.parse(serializeTeamState(withCharacters([10, 20]))) as { slots: Record<string, unknown>[] };
    for (const slot of missing.slots) delete slot.treasurePhase;
    expect(parseTeamState(JSON.stringify(missing), index)).toBeNull();
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

  it('parseTeamState rejects a missing build and bad values', () => {
    const missing = JSON.parse(serializeTeamState(withCharacters([10]))) as Record<string, unknown>;
    const slots = missing.slots as Record<string, unknown>[];
    for (const slot of slots) delete slot.build;
    expect(parseTeamState(JSON.stringify(missing), index)).toBeNull();
    const bad = [
      { affectionRank: 0 },
      { affectionRank: 41 },
      { gear: { head: { type: 'T8', level: 0 }, body: null, arm: null, leg: null } },
      { gear: { head: { type: 'T9', level: 6 }, body: null, arm: null, leg: null } },
      { cube: { id: 1000301, level: 16 } },
      { collection: { rarity: 'SSR', level: 1 } },
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
            { option: 'elementDamage' as const, level: 11, position: 2 },
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

  it('rejects lines on non-OL gear, more than 3 lines, unknown options, levels out of 1..15 and bad positions', () => {
    const line = (option: string, level: number) => ({ option, level });
    const bad = [
      { type: 'T9', level: 5, overload: [line('attack', 1)] },
      { type: 'OL', level: 5, overload: [line('attack', 1), line('attack', 1), line('attack', 1), line('attack', 1)] },
      { type: 'OL', level: 5, overload: [line('speed', 1)] },
      { type: 'OL', level: 5, overload: [line('attack', 0)] },
      { type: 'OL', level: 5, overload: [line('attack', 16)] },
      { type: 'OL', level: 5, overload: 'attack' },
      { type: 'OL', level: 5, overload: [{ ...line('attack', 1), position: 3 }] },
      { type: 'OL', level: 5, overload: [line('attack', 1), { ...line('hitRate', 1), position: 0 }] },
    ];
    for (const head of bad) expect(parseTeamState(withGear(head), index), JSON.stringify(head)).toBeNull();
  });
});

describe('save format version (Stage 14)', () => {
  it('writes formatVersion and reads it back; unversioned data (Stage 3〜13) is not read', () => {
    const s = withCharacters([10, 20]);
    const json = serializeTeamState(s);
    expect((JSON.parse(json) as { formatVersion: number }).formatVersion).toBe(TEAM_FORMAT_VERSION);
    expect(parseTeamState(json, index)).toEqual(s);
    const { formatVersion: _v, ...legacy } = JSON.parse(json) as Record<string, unknown>;
    expect(parseTeamState(JSON.stringify(legacy), index)).toBeNull();
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

describe('condition mode (Stage 18-C2)', () => {
  it('defaults every slot to auto, updates per slot, keeps it on clearSlot and round-trips', () => {
    expect(INITIAL_TEAM_STATE.slots.every((s) => s.conditionMode === 'auto')).toBe(true);
    let s = withCharacters([10, 20]);
    s = teamReducer(s, { type: 'setConditionMode', index: 1, conditionMode: 'manual' });
    expect(s.slots.map((x) => x.conditionMode)).toEqual(['auto', 'manual', 'auto', 'auto', 'auto']);
    s = teamReducer(s, { type: 'clearSlot', index: 1 });
    expect(s.slots[1]?.conditionMode).toBe('manual');
    const json = serializeTeamState(s);
    expect((JSON.parse(json) as { formatVersion: number }).formatVersion).toBe(TEAM_FORMAT_VERSION);
    expect(parseTeamState(json, index)).toEqual(s);
  });

  it('reads version 1 slots as auto when the condition is untouched (1, on, 1 or missing), manual otherwise', () => {
    const raw = JSON.parse(serializeTeamState(withCharacters([10, 20, 30, 40, 50]))) as {
      formatVersion: number;
      slots: Record<string, unknown>[];
    };
    raw.formatVersion = 1;
    const conditions = [
      { coreHitRate: 1, distanceBonus: true, fullCharge: true, hitRate: 1 },
      { coreHitRate: 1, distanceBonus: true, fullCharge: false },
      { coreHitRate: 0.4, distanceBonus: true, fullCharge: true, hitRate: 1 },
      { coreHitRate: 1, distanceBonus: false, fullCharge: true, hitRate: 1 },
      { coreHitRate: 1, distanceBonus: true, fullCharge: true, hitRate: 0.8 },
    ];
    raw.slots.forEach((slot, i) => {
      delete slot.conditionMode;
      slot.condition = conditions[i];
    });
    const parsed = parseTeamState(JSON.stringify(raw), index)!;
    expect(parsed.slots.map((x) => x.conditionMode)).toEqual(['auto', 'auto', 'manual', 'manual', 'manual']);
    // 手入力の値はそのまま残す
    expect(parsed.slots[2]?.condition.coreHitRate).toBe(0.4);
    raw.slots[0]!.conditionMode = 'maybe';
    expect(parseTeamState(JSON.stringify(raw), index)).toBeNull();
  });

  it('attaches the range table to range presets and the default target, with landings when the 3-minute mode is on', () => {
    const master = parseEnemyPresets(
      JSON.parse(readFileSync(new URL('../../../packages/core/data/enemies.json', import.meta.url), 'utf8')) as unknown,
    );
    const plain = enemyForCalc(SHOOTING_RANGE_ENEMY, master, [], 180);
    expect(plain.target?.id).toBe('range-bigarms');
    expect(plain.landings).toEqual([{ start: 0, end: 180, landing: 'midNear' }]);
    expect(plain.events).toBeUndefined();
    const fire = { defence: 100, element: 'Fire' as const, hasCore: true };
    const jumping = enemyForCalc(fire, master, ['range-3min-jump'], 180);
    expect(jumping.events).toHaveLength(5);
    expect(jumping.landings?.map((l) => l.landing)).toEqual(['midNear', 'near', 'far', 'midFar', 'near', 'far']);
    // 3 分モードは、一致するプリセットのセットだけ。2026-10-31 から、属性なしの射撃場の的（既定の敵）も射撃場のプリセットのセットを使う
    const plainJumping = enemyForCalc(SHOOTING_RANGE_ENEMY, master, ['range-3min-jump'], 180);
    expect(plainJumping.events).toEqual(jumping.events);
    expect(plainJumping.landings).toEqual(jumping.landings);
    const boss = { defence: 140, element: 'Fire' as const, hasCore: true };
    expect(enemyForCalc(boss, master, [], 180)).toEqual(boss);
    expect(enemyForCalc(fire, null, ['range-3min-jump'], 180)).toBe(fire);
  });
});

// 2 段目の段 6（plan/design-skill-stage6.md 1.4 節・論点 4・5）: HP の割合の想定
describe('HP の割合の想定', () => {
  it('defaults to full HP, updates per slot, resets when the character changes and round-trips', () => {
    expect(INITIAL_TEAM_STATE.slots.every((s) => s.hpRatio === 1)).toBe(true);
    let s = withCharacters([10, 20]);
    s = teamReducer(s, { type: 'setHpRatio', index: 1, hpRatio: 0.69 });
    expect(s.slots.map((x) => x.hpRatio)).toEqual([1, 0.69, 1, 1, 1]);
    expect(parseTeamState(serializeTeamState(s), index)).toEqual(s);
    // 同じニケを選び直しても変えない。別のニケにしたら既定に戻す
    expect(teamReducer(s, { type: 'selectCharacter', index: 1, resourceId: 20 }).slots[1]?.hpRatio).toBe(0.69);
    expect(teamReducer(s, { type: 'selectCharacter', index: 1, resourceId: 30 }).slots[1]?.hpRatio).toBe(1);
    expect(teamReducer(s, { type: 'clearSlot', index: 1 }).slots[1]?.hpRatio).toBe(1);
  });

  it('reads a slot without hpRatio (saved before 2 段目の段 6) as full HP and rejects out-of-range values', () => {
    const raw = JSON.parse(serializeTeamState(withCharacters([10]))) as { slots: Record<string, unknown>[] };
    delete raw.slots[0]!.hpRatio;
    expect(parseTeamState(JSON.stringify(raw), index)?.slots[0]?.hpRatio).toBe(1);
    for (const bad of [0, -0.1, 1.01, '1']) {
      raw.slots[0]!.hpRatio = bad;
      expect(parseTeamState(JSON.stringify(raw), index), String(bad)).toBeNull();
    }
  });
});

describe('3-minute mode in the advanced settings (2026-10-31)', () => {
  it('round-trips the jump setting, and reads saved data without it as on', () => {
    const s = teamReducer(initialTeamState(), { type: 'setRangeJump', rangeJump: false });
    expect(parseTeamState(serializeTeamState(s), index)?.rangeJump).toBe(false);
    const old = JSON.parse(serializeTeamState(initialTeamState())) as Record<string, unknown>;
    delete old.rangeJump;
    expect(parseTeamState(JSON.stringify(old), index)?.rangeJump).toBe(true);
  });
});

describe('no burst (slot advanced settings, 2026-10-31)', () => {
  it('round-trips the flag, and reads saved data without it as false', () => {
    let s = withCharacters([10, 20]);
    s = teamReducer(s, { type: 'setNoBurst', index: 1, noBurst: true });
    expect(parseTeamState(serializeTeamState(s), index)).toEqual(s);
    const old = JSON.parse(serializeTeamState(withCharacters([10]))) as { slots: Record<string, unknown>[] };
    for (const slot of old.slots) delete slot.noBurst;
    expect(parseTeamState(JSON.stringify(old), index)?.slots[0]?.noBurst).toBe(false);
    old.slots[0]!.noBurst = 'yes';
    expect(parseTeamState(JSON.stringify(old), index)).toBeNull();
  });
});

describe('console (2026-10-31)', () => {
  it('gives each character the research levels of its class and corporation', () => {
    const input = emptyConsole();
    input.personal = 5;
    input.class.Attacker = 7;
    input.class.Defender = 1;
    input.corporation.PILGRIM = 9;
    input.corporation.ELYSION = 2;
    expect(recycleRoomFromConsole(input, { class: 'Attacker', corporation: 'PILGRIM' })).toEqual({
      personal: 5,
      class: 7,
      corporation: 9,
    });
    expect(recycleRoomFromConsole(input, { class: 'Defender', corporation: 'ELYSION' })).toEqual({
      personal: 5,
      class: 1,
      corporation: 2,
    });
  });

  it('round-trips, and reads saved data without a console as all zeros', () => {
    const s = teamReducer(withCharacters([10]), {
      type: 'setConsole',
      console: { ...emptyConsole(), personal: 3 },
    });
    expect(parseTeamState(serializeTeamState(s), index)).toEqual(s);
    const old = JSON.parse(serializeTeamState(withCharacters([10]))) as Record<string, unknown>;
    delete old.console;
    expect(parseTeamState(JSON.stringify(old), index)?.console).toEqual(emptyConsole());
    expect(parseTeamState(JSON.stringify({ ...old, console: { personal: -1 } }), index)).toBeNull();
  });

  it('reads a missing class or corporation key as 0, so adding one does not drop older saved data', () => {
    const input = { ...emptyConsole(), personal: 3 };
    input.class.Attacker = 4;
    input.corporation.PILGRIM = 6;
    const saved = JSON.parse(
      serializeTeamState(teamReducer(withCharacters([10]), { type: 'setConsole', console: input })),
    ) as { console: { class: Record<string, unknown>; corporation: Record<string, unknown> } };
    delete saved.console.class.Defender;
    delete saved.console.corporation.ELYSION;
    expect(parseTeamState(JSON.stringify(saved), index)?.console).toEqual(input);
    // ある値が整数でなければ、いままでどおり読まない
    saved.console.corporation.TETRA = 'x';
    expect(parseTeamState(JSON.stringify(saved), index)).toBeNull();
  });
});

describe('synchro level (2026-10-31)', () => {
  it('round-trips, and reads saved data without it as Lv200', () => {
    const s = teamReducer(withCharacters([10, 20]), { type: 'setSynchroLevel', synchroLevel: 400 });
    expect(parseTeamState(serializeTeamState(s), index)).toEqual(s);
    const old = JSON.parse(serializeTeamState(withCharacters([10]))) as Record<string, unknown>;
    delete old.synchroLevel;
    expect(parseTeamState(JSON.stringify(old), index)?.synchroLevel).toBe(200);
  });
});

describe('育成の欄の変更をスロットの操作にする（growthFieldsActions）・sameConsole', () => {
  it('変えた項目だけを操作にし、順に当てるとスロットの育成になる', () => {
    expect(growthFieldsActions(1, {})).toEqual([]);
    expect(growthFieldsActions(1, { growth: { grade: 1, core: 0 } })).toEqual([
      { type: 'setGrowth', index: 1, growth: { grade: 1, core: 0 } },
    ]);
    const slot = initialTeamState().slots[0]!;
    const fields = {
      growth: { grade: 2, core: 5 },
      build: { ...slot.build, affectionRank: 30 },
      skillLevels: { skill1: 4, skill2: 5, burst: 6 },
      treasurePhase: 2 as const,
    };
    // 全部の項目を渡すと、スロットの育成をまとめて置き換える（「育成状況の値に戻す」）
    const next = growthFieldsActions(0, fields).reduce(teamReducer, initialTeamState());
    expect(next.slots[0]).toEqual({ ...slot, ...fields });
    expect(next.slots[1]).toEqual(initialTeamState().slots[1]);
  });

  it('sameConsole は研究の Lv を 1 つずつ比べる', () => {
    const a = emptyConsole();
    expect(sameConsole(a, emptyConsole())).toBe(true);
    expect(sameConsole(a, { ...a, personal: 1 })).toBe(false);
    expect(sameConsole(a, { ...a, class: { ...a.class, Attacker: 1 } })).toBe(false);
    expect(sameConsole(a, { ...a, corporation: { ...a.corporation, TETRA: 1 } })).toBe(false);
  });
});
