import {
  MASTER_FILES,
  MAX_SKILL_LEVELS,
  applyTreasure,
  computeCombatAttack,
  computeCombatStat,
  computeFixedSpecAttack,
  fixedSpecBuild,
  parseEnemyPresets,
  resolveBuildEffects,
  type BuildInput,
  type BuildMasters,
  type CharacterData,
  type TeamResult,
} from '@nikke/core';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildCalcView, slotResultFor, type CalcDeps, type CalcView } from './calcView.ts';
import type { Shown } from './compute.ts';
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

// 育成のマスタ（画面は起動時に読む。App.tsx の loadBuildMasters）
const masters = Object.fromEntries(
  Object.entries(MASTER_FILES).map(([k, f]) => [k, readJson<unknown>(`../../../packages/core/data/masters/${f}`)]),
) as BuildMasters;
// クラッシュキューブ: 防御力無視ダメージ▲は未対応（未対応の一覧に出す育成の注記）
const CRUSH_CUBE = 1000315;

function withBuild(state: TeamState, index: number, patch: Partial<BuildInput>): TeamState {
  return teamReducer(state, { type: 'setBuild', index, build: { ...state.slots[index]!.build, ...patch } });
}

describe('buildCalcView: build layer (masters loaded)', () => {
  it('overrides attack, HP and defence with the build, passes the build effects, and keeps only the unsupported notes', () => {
    const s = withBuild(withCharacters([LAPI]), 0, {
      affectionRank: 10,
      gear: {
        head: {
          type: 'OL',
          level: 3,
          overload: [
            { option: 'attack', level: 5 },
            { option: 'defence', level: 5 },
          ],
        },
        body: { type: 'T9', level: 5 },
        arm: null,
        leg: null,
      },
      cube: { id: CRUSH_CUBE, level: 3 },
    });
    const slot = buildCalcView(s, deps({ masters })).slots[0]!;
    const lapi = characters.get(LAPI)!;
    const options = { treasurePhase: 0 };
    expect(slot.input).toMatchObject({
      attackOverride: computeCombatAttack(lapi, slot.growth, slot.build, masters, options).attack,
      hpOverride: computeCombatStat(lapi, slot.growth, slot.build, masters, 'hp', options).value,
      defenceOverride: computeCombatStat(lapi, slot.growth, slot.build, masters, 'defence', options).value,
    });
    const resolved = resolveBuildEffects(lapi, slot.build, masters, options);
    expect(slot.input?.buildEffects).toEqual(resolved.effects);
    expect(slot.input?.buildEffects?.some((e) => e.stat === 'attack')).toBe(true);
    // OL の防御力▲（ダメージに無関係）は出さず、キューブの未対応だけを出す
    expect(resolved.notes.length).toBeGreaterThan(slot.buildNotes.length);
    expect(slot.buildNotes.map((n) => [n.level, n.source.kind])).toEqual([['unsupported', 'cube']]);
  });

  it('leaves the stats to the character data when the build is empty and the treasure phase is 0', () => {
    const empty = buildCalcView(withCharacters([LAPLACE]), deps({ masters })).slots[0]!;
    expect(empty.input).not.toHaveProperty('attackOverride');
    expect(empty.input).not.toHaveProperty('buildEffects');
    expect(empty.buildNotes).toEqual([]);

    // 宝物の段階があれば、育成が空でも宝物のステータスを乗せる
    const s = teamReducer(withCharacters([LAPLACE]), { type: 'setTreasurePhase', index: 0, treasurePhase: 1 });
    const slot = buildCalcView(s, deps({ masters })).slots[0]!;
    const laplace = characters.get(LAPLACE)!;
    expect(slot.input?.attackOverride).toBe(
      computeCombatAttack(laplace, slot.growth, slot.build, masters, { treasurePhase: 1 }).attack,
    );
    expect(slot.input?.attackOverride).not.toBe(
      computeCombatAttack(laplace, slot.growth, slot.build, masters, { treasurePhase: 0 }).attack,
    );
  });

  it('keeps only the notes when the stats cannot be computed, and drops both when the effects cannot be resolved', () => {
    const s = withBuild(withCharacters([LAPI]), 0, {
      gear: { head: { type: 'T9', level: 5 }, body: null, arm: null, leg: null },
      cube: { id: CRUSH_CUBE, level: 3 },
    });
    // 装備のマスタに値が無い（攻撃力などを計算できない）
    const broken = structuredClone(masters);
    broken.gear.tiers.T9.Attacker.head.attack = [];
    const slot = buildCalcView(s, deps({ masters: broken })).slots[0]!;
    expect(slot.input).not.toBeNull();
    expect(slot.input).not.toHaveProperty('attackOverride');
    expect(slot.input).not.toHaveProperty('buildEffects');
    expect(slot.buildNotes.map((n) => n.source.kind)).toEqual(['cube']);

    // マスタに無いキューブ（効果を解決できない）
    const unknown = buildCalcView(withBuild(s, 0, { cube: { id: 1, level: 3 } }), deps({ masters })).slots[0]!;
    expect(unknown.input).not.toHaveProperty('attackOverride');
    expect(unknown.buildNotes).toEqual([]);
  });

  it('ignores the saved build in fixed spec', () => {
    let s = withBuild(withCharacters([LAPI]), 0, { cube: { id: CRUSH_CUBE, level: 3 } });
    s = teamReducer(s, { type: 'setFixedSpec', fixedSpec: true });
    const slot = buildCalcView(s, deps({ masters })).slots[0]!;
    expect(slot.buildNotes).toEqual([]);
    expect(slot.input).not.toHaveProperty('buildEffects');
    expect(slot.input?.attackOverride).toBe(computeFixedSpecAttack(characters.get(LAPI)!).attack);
  });
});

describe('slotResultFor: the result shown in a slot', () => {
  // 結果は、スロットのキャラと合計だけを持つ形にする（slotResultFor が読むのはそこだけ）
  function shownFor(view: CalcView): Shown<CalcView> {
    const slots = view.slots.map((s) =>
      s.character === undefined ? null : { character: s.character, totalDamage: 100, notes: [] },
    );
    return { computed: { ok: true, result: { slots } as unknown as TeamResult }, source: view };
  }
  const party01 = withCharacters([LAPI]);
  const party02 = teamReducer(withCharacters([LAPLACE]), { type: 'setTreasurePhase', index: 0, treasurePhase: 1 });

  it('shows the result of the current input as it is', () => {
    const view = buildCalcView(party01, deps());
    expect(slotResultFor(shownFor(view), view, 0)).toMatchObject({ stale: false, result: { totalDamage: 100 } });
    expect(slotResultFor(shownFor(view), view, 1)).toBeNull();
  });

  it('marks the result of the previous input of the same character as stale', () => {
    const before = buildCalcView(party01, deps());
    const after = buildCalcView(teamReducer(party01, { type: 'setDuration', durationSeconds: 60 }), deps());
    expect(slotResultFor(shownFor(before), after, 0)).toMatchObject({ stale: true });
  });

  it('does not show the result of another character while the switched party is being computed', () => {
    const before = buildCalcView(party01, deps());
    const after = buildCalcView(party02, deps());
    expect(slotResultFor(shownFor(before), after, 0)).toBeNull();
    expect(slotResultFor({ computed: { ok: false, error: 'x' }, source: after }, after, 0)).toBeNull();
    expect(slotResultFor(null, after, 0)).toBeNull();
  });

  it('keeps the character and the treasure phase of a result together in its source', () => {
    // 2026-11-01 の不具合: 前の編成の結果のキャラ（宝物なし）に、いまの編成の宝物の段階を当てて画面が落ちていた。
    // 詳細は結果の元（source）から読むので、キャラと宝物の段階は同じ計算の入力のものになる
    const before = buildCalcView(party01, deps());
    const after = buildCalcView(party02, deps());
    const shownSlot = before.slots[0]!;
    expect(() => applyTreasure(shownSlot.character!, null, after.slots[0]!.treasurePhase)).toThrow(RangeError);
    for (const view of [before, after]) {
      const { source } = shownFor(view);
      for (const slot of source.slots) {
        if (slot.character) expect(() => applyTreasure(slot.character!, null, slot.treasurePhase)).not.toThrow();
      }
    }
  });
});
