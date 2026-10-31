import { MAX_SKILL_LEVELS, fixedSpecBuild, parseEnemyPresets, type CharacterData } from '@nikke/core';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildCalcView, type CalcDeps } from './calcView.ts';
import {
  DEFAULT_SLOT_CONDITION,
  SHOOTING_RANGE_ENEMY,
  emptyConsole,
  initialTeamState,
  teamReducer,
  type TeamState,
} from './team.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}
const character = (id: number) => readJson<CharacterData>(`../../../packages/core/data/characters/${id}.json`);

// ラピ（ELYSION・Attacker・宝物なし）、クラウン（PILGRIM・Defender・OVERSPEC）、ラプラス（宝物あり）
const LAPI = 10;
const CROWN = 330;
const LAPLACE = 100;
const characters = new Map([LAPI, CROWN, LAPLACE].map((id) => [id, character(id)]));
const enemyMaster = parseEnemyPresets(readJson<unknown>('../../../packages/core/data/enemies.json'));

function deps(over: Partial<CalcDeps> = {}): CalcDeps {
  return {
    characters,
    skillsStatuses: [0, 1, 2, 3, 4].map(() => ({ kind: 'undefined' as const })),
    masters: null,
    enemyMaster: null,
    ...over,
  };
}

function withCharacters(ids: (number | null)[]): TeamState {
  return ids.reduce(
    (state, id, i) => (id === null ? state : teamReducer(state, { type: 'selectCharacter', index: i, resourceId: id })),
    initialTeamState(),
  );
}

describe('buildCalcView: inputs removed from the screen', () => {
  it('uses the defaults for the shooting condition, the HP ratio and the extra attack, and leaves the saved values', () => {
    let s = withCharacters([LAPI]);
    s = teamReducer(s, { type: 'setConditionMode', index: 0, conditionMode: 'manual' });
    s = teamReducer(s, {
      type: 'setSlotCondition',
      index: 0,
      condition: { coreHitRate: 0.3, distanceBonus: false, fullCharge: false, hitRate: 0.5 },
    });
    s = teamReducer(s, { type: 'setHpRatio', index: 0, hpRatio: 0.4 });
    const build = { ...s.slots[0]!.build, affectionRank: 20, extraAttack: 300 };
    s = teamReducer(s, { type: 'setBuild', index: 0, build });

    const slot = buildCalcView(s, deps()).slots[0]!;
    expect(slot.hpRatio).toBe(1);
    expect(slot.build.extraAttack).toBe(0);
    expect(slot.build.affectionRank).toBe(20);
    expect(slot.input).toMatchObject({ conditionMode: 'auto', condition: DEFAULT_SLOT_CONDITION, hpRatio: 1 });
    // 保存している値は消さない
    expect(s.slots[0]!.conditionMode).toBe('manual');
    expect(s.slots[0]!.build.extraAttack).toBe(300);
  });

  it('takes the recycle room from the console by class and corporation, and caps the affection rank per character', () => {
    let s = withCharacters([LAPI, CROWN]);
    const consoleInput = emptyConsole();
    consoleInput.personal = 5;
    consoleInput.class.Attacker = 7;
    consoleInput.class.Defender = 1;
    consoleInput.corporation.ELYSION = 2;
    consoleInput.corporation.PILGRIM = 9;
    s = teamReducer(s, { type: 'setConsole', console: consoleInput });
    for (const i of [0, 1]) {
      s = teamReducer(s, { type: 'setBuild', index: i, build: { ...s.slots[i]!.build, affectionRank: 40 } });
    }
    const [lapi, crown] = buildCalcView(s, deps()).slots;
    expect(lapi!.build.recycleRoom).toEqual({ personal: 5, class: 7, corporation: 2 });
    expect(crown!.build.recycleRoom).toEqual({ personal: 5, class: 1, corporation: 9 });
    expect(lapi!.build.affectionRank).toBe(30);
    expect(crown!.build.affectionRank).toBe(40);
  });

  it('puts the synchro level into every slot growth', () => {
    let s = withCharacters([LAPI, CROWN]);
    s = teamReducer(s, { type: 'setGrowth', index: 1, growth: { level: 50, grade: 3, core: 2 } });
    s = teamReducer(s, { type: 'setSynchroLevel', synchroLevel: 160 });
    const view = buildCalcView(s, deps());
    expect(view.slots[1]!.growth).toEqual({ level: 160, grade: 3, core: 2 });
    expect(view.slots[0]!.growth.level).toBe(160);
    expect(view.slots[1]!.input?.growth).toEqual({ level: 160, grade: 3, core: 2 });
  });

  it('uses the fixed-spec presets and Lv10 skills, keeping the treasure phase', () => {
    let s = withCharacters([LAPLACE]);
    s = teamReducer(s, { type: 'setSkillLevels', index: 0, skillLevels: { skill1: 3, skill2: 3, burst: 3 } });
    s = teamReducer(s, { type: 'setTreasurePhase', index: 0, treasurePhase: 2 });
    s = teamReducer(s, { type: 'setFixedSpec', fixedSpec: true });
    const slot = buildCalcView(s, deps()).slots[0]!;
    expect(slot.skillLevels).toEqual(MAX_SKILL_LEVELS);
    expect(slot.build).toEqual(fixedSpecBuild(characters.get(LAPLACE)!));
    expect(slot.treasurePhase).toBe(2);
    expect(slot.input?.attackOverride).toBeGreaterThan(0);
    expect(s.slots[0]!.skillLevels).toEqual({ skill1: 3, skill2: 3, burst: 3 });
  });

  it('uses phase 0 for characters without a treasure', () => {
    const s = teamReducer(withCharacters([LAPI]), { type: 'setTreasurePhase', index: 0, treasurePhase: 2 });
    expect(buildCalcView(s, deps()).slots[0]!.treasurePhase).toBe(0);
  });

  it('leaves out slots whose character or skill status is not loaded', () => {
    const s = withCharacters([LAPI, 999]);
    const view = buildCalcView(s, deps({ skillsStatuses: [null, null, null, null, null] }));
    expect(view.slots[0]!.character?.resourceId).toBe(LAPI);
    expect(view.slots[0]!.input).toBeNull();
    expect(view.slots[1]!.character).toBeUndefined();
    expect(view.slots[1]!.input).toBeNull();
    expect(view.input.slots).toEqual([null, null, null, null, null]);
  });
});

describe('buildCalcView: slot advanced settings', () => {
  it('calculates a no-fire slot with the manual condition and a bullet hit rate of 0', () => {
    const s = teamReducer(withCharacters([LAPI, CROWN]), { type: 'setNoFire', index: 1, noFire: true });
    const view = buildCalcView(s, deps());
    expect(view.slots[1]!.noFire).toBe(true);
    expect(view.slots[1]!.input).toMatchObject({ conditionMode: 'manual', condition: { hitRate: 0 } });
    expect(view.slots[0]!.input).toMatchObject({ conditionMode: 'auto' });
  });

  it('lists only the occupied no-burst slots, and leaves the list out when there are none', () => {
    let s = withCharacters([LAPI, CROWN]);
    expect(buildCalcView(s, deps()).input.noBurstSlots).toBeUndefined();
    s = teamReducer(s, { type: 'setNoBurst', index: 1, noBurst: true });
    s = teamReducer(s, { type: 'setNoBurst', index: 4, noBurst: true });
    expect(buildCalcView(s, deps()).input.noBurstSlots).toEqual([1]);
  });
});

describe('buildCalcView: team settings', () => {
  it('uses the shooting-range enemy with the saved element only, always bursts, and keeps the advanced settings', () => {
    let s = teamReducer(initialTeamState(), {
      type: 'setEnemy',
      enemy: { defence: 140, element: 'Fire', hasCore: false },
    });
    s = teamReducer(s, { type: 'setDuration', durationSeconds: 60 });
    s = teamReducer(s, { type: 'setBurst', burst: false });
    s = teamReducer(s, { type: 'setControlledSlot', controlledSlot: 0 });
    const { input } = buildCalcView(s, deps());
    expect(input.enemy).toEqual({ ...SHOOTING_RANGE_ENEMY, element: 'Fire' });
    expect(input.durationSeconds).toBe(60);
    expect(input.burst).toBe(true);
    expect(input.controlledSlot).toBe(0);
    expect(s.enemy.defence).toBe(140);
  });

  it('adds the jumps of the shooting-range target only while the 3-minute mode is on', () => {
    const on = buildCalcView(initialTeamState(), deps({ enemyMaster })).input.enemy;
    expect(on.events?.length).toBeGreaterThan(0);
    expect(on.target).toBeDefined();
    const off = buildCalcView(
      teamReducer(initialTeamState(), { type: 'setRangeJump', rangeJump: false }),
      deps({ enemyMaster }),
    ).input.enemy;
    expect(off.events).toBeUndefined();
    expect(off.target).toBeDefined();
    expect(buildCalcView(initialTeamState(), deps()).input.enemy.events).toBeUndefined();
  });
});
