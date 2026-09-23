// Stage 9: 宝物版への差し替え（plan/design-stage9.md 4.2・8.2 節）
import { describe, expect, it } from 'vitest';
import { makeCharacter } from '../../__tests__/fixtures.ts';
import type { EnemyInput } from '../../damage.ts';
import { planTeamRun, type TeamInput } from '../../team.ts';
import type { CharacterData, SkillRaw } from '../../types.ts';
import { MAX_SKILL_LEVELS, resolvePassives, resolveTimed } from '../resolve.ts';
import { applyTreasure, applyTreasureToTeam, treasureSlots, validateTreasurePhase } from '../treasure.ts';
import { parseSkillDefinition, type SkillDefinition } from '../types.ts';

function raw(id: number, value: string): SkillRaw {
  return { id, name: { ja: `s${id}`, en: `s${id}` }, description: { ja: '', en: '' }, values: [Array(10).fill(value)] };
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

/** 解放順 skill2 → burst → skill1 の宝物を持つキャラ */
function treasureCharacter(): CharacterData {
  return makeCharacter(
    {},
    {
      skills: { skill1: raw(1, '10'), skill2: raw(2, '10'), burst: raw(3, '200') },
      treasure: {
        favoriteId: 200001,
        name: { ja: '宝物', en: 'Treasure' },
        unlockOrder: ['skill2', 'burst', 'skill1'],
        skills: { skill1: raw(51, '20'), skill2: raw(52, '20'), burst: raw(53, '400') },
      },
    },
  );
}

const passive = (ref: number) => ({
  support: 'supported',
  effects: [{ kind: 'passive', target: 'self', stat: 'attack', ref }],
});

function definition(treasureSkills?: object): SkillDefinition {
  return parseSkillDefinition({
    formatVersion: 1,
    resourceId: 1,
    checkedAt: '2026-09-23',
    skills: {
      skill1: passive(1),
      skill2: passive(1),
      burst: { support: 'supported', effects: [{ kind: 'burstDamage', ref: 1, damageType: 'skill' }] },
    },
    ...(treasureSkills === undefined ? {} : { treasureSkills }),
  });
}

describe('treasureSlots / validateTreasurePhase', () => {
  const character = treasureCharacter();

  it('takes the first N slots of the unlock order', () => {
    expect(treasureSlots(character, 0)).toEqual([]);
    expect(treasureSlots(character, 1)).toEqual(['skill2']);
    expect(treasureSlots(character, 3)).toEqual(['skill2', 'burst', 'skill1']);
    expect(treasureSlots(makeCharacter(), 0)).toEqual([]);
  });

  it('rejects phases out of range and phases for characters without a treasure', () => {
    expect(() => validateTreasurePhase(character, 4)).toThrow(RangeError);
    expect(() => validateTreasurePhase(character, 1.5)).toThrow(RangeError);
    expect(() => validateTreasurePhase(makeCharacter(), 1)).toThrow(/no treasure/);
    expect(() => validateTreasurePhase(makeCharacter(), 0)).not.toThrow();
  });
});

describe('applyTreasure', () => {
  it('returns the same objects at phase 0', () => {
    const character = treasureCharacter();
    const def = definition();
    const applied = applyTreasure(character, def, 0);
    expect(applied.character).toBe(character);
    expect(applied.definition).toBe(def);
  });

  it('replaces only the unlocked slots, with the treasure definitions', () => {
    const character = treasureCharacter();
    const def = definition({ skill2: passive(1) });
    const { character: c, definition: d } = applyTreasure(character, def, 1);
    expect(c.skills.skill2.id).toBe(52);
    expect(c.skills.skill1).toBe(character.skills.skill1);
    expect(c.skills.burst).toBe(character.skills.burst);
    expect(d!.skills.skill2).toBe(def.treasureSkills!.skill2);
    expect(d!.skills.skill1).toBe(def.skills.skill1);
  });

  it('marks unlocked slots without a treasure definition as unsupported (never falls back to the base one)', () => {
    const { definition: d } = applyTreasure(treasureCharacter(), definition({ skill2: passive(1) }), 2);
    expect(d!.skills.burst.support).toBe('unsupported');
    expect(d!.skills.burst.effects).toEqual([]);
    expect(d!.skills.burst.notes?.[0]?.ja).toMatch(/宝物版/);
  });

  it('keeps a null definition null but still swaps the raw skills (for the description)', () => {
    const { character: c, definition: d } = applyTreasure(treasureCharacter(), null, 3);
    expect(d).toBeNull();
    expect([c.skills.skill1.id, c.skills.skill2.id, c.skills.burst.id]).toEqual([51, 52, 53]);
  });

  it('does not mutate its (frozen) arguments', () => {
    const character = deepFreeze(treasureCharacter());
    const def = deepFreeze(definition({ skill1: passive(1), skill2: passive(1) }));
    const before = JSON.stringify({ character, def });
    expect(() => applyTreasure(character, def, 3)).not.toThrow();
    expect(JSON.stringify({ character, def })).toBe(before);
  });
});

describe('applyTreasureToTeam', () => {
  const enemy: EnemyInput = { defence: 0, element: null, hasCore: false };
  const condition = { coreHitRate: 0, distanceBonus: false, fullCharge: true };
  const growth = { level: 1, grade: 0, core: 0 };
  const character = treasureCharacter();
  // 同じキャラは 2 枠に置けないので、スキルと宝物のオブジェクトを共有する別 ID のキャラを並べる
  const other: CharacterData = { ...character, resourceId: 2 };
  const def = definition({ skill1: passive(1), skill2: passive(1) });
  const input: TeamInput = {
    slots: [
      { character, growth, condition, skills: { definition: def, levels: MAX_SKILL_LEVELS, treasurePhase: 3 } },
      {
        character: other,
        growth,
        condition,
        skills: { definition: { ...def, resourceId: 2 }, levels: MAX_SKILL_LEVELS },
      },
    ],
    enemy,
    durationSeconds: 10,
  };

  it('returns the input itself when every slot is at phase 0', () => {
    const plain: TeamInput = { ...input, slots: [input.slots[1]!] };
    expect(applyTreasureToTeam(plain)).toBe(plain);
  });

  it('applies per slot: characters sharing skill objects at phase 3 and phase 0 stay independent', () => {
    const applied = applyTreasureToTeam(input);
    expect(applied.slots[0]!.character.skills.skill1.id).toBe(51);
    expect(applied.slots[1]!.character.skills.skill1.id).toBe(1);
    expect(applied.slots[1]).toBe(input.slots[1]);
    expect(input.slots[0]!.character).toBe(character);
  });

  it('is idempotent (applied slots are at phase 0)', () => {
    const once = applyTreasureToTeam(input);
    expect(once.slots[0]!.skills!.treasurePhase).toBe(0);
    expect(applyTreasureToTeam(once)).toBe(once);
  });

  it('takes effect when planTeamRun is called directly', () => {
    const plan = planTeamRun(input).timeline.passive;
    // 宝物版は攻撃力 +20% × 2 スロット、基礎版は +10% × 2 スロット（どちらも self）
    expect(plan[0]!.buffs.attackRatio).toBeCloseTo(0.4, 12);
    expect(plan[1]!.buffs.attackRatio).toBeCloseTo(0.2, 12);
  });
});

describe('parseSkillDefinition (Stage 9)', () => {
  const base = {
    formatVersion: 1,
    resourceId: 1,
    checkedAt: '2026-09-23',
    skills: { skill1: passive(1), skill2: passive(1), burst: { support: 'unsupported', effects: [] } },
  };
  const timedFor = (target: string, targetWeapon?: string) => ({
    support: 'supported',
    effects: [
      { kind: 'timed', trigger: 'fullBurstStart', target, stat: 'attack', ref: 1, durationSeconds: 10, targetWeapon },
    ],
  });

  it('accepts treasureSkills for some slots and targetWeapon with allies', () => {
    const def = parseSkillDefinition({ ...base, treasureSkills: { skill1: timedFor('allies', 'SG') } });
    expect(Object.keys(def.treasureSkills!)).toEqual(['skill1']);
    expect(def.treasureSkills!.skill1!.effects[0]).toMatchObject({ target: 'allies', targetWeapon: 'SG' });
    expect(parseSkillDefinition(base).treasureSkills).toBeUndefined();
  });

  it('rejects unknown treasure slots, targetWeapon with self and unknown weapons', () => {
    expect(() => parseSkillDefinition({ ...base, treasureSkills: { skill3: passive(1) } })).toThrow(
      /treasureSkills.skill3: unknown skill slot/,
    );
    expect(() => parseSkillDefinition({ ...base, treasureSkills: { skill1: timedFor('self', 'SG') } })).toThrow(
      /treasureSkills.skill1.effects\[0\].targetWeapon: only allowed with target "allies"/,
    );
    expect(() =>
      parseSkillDefinition({ ...base, skills: { ...base.skills, skill1: timedFor('allies', 'LASER') } }),
    ).toThrow(/targetWeapon: expected one of/);
  });
});

describe('resolved effects carry targetWeapon (Stage 9)', () => {
  it('copies targetWeapon only when the definition has it', () => {
    const character = makeCharacter(
      {},
      { skills: { skill1: raw(1, '10'), skill2: raw(2, '10'), burst: raw(3, '10') } },
    );
    const def = parseSkillDefinition({
      formatVersion: 1,
      resourceId: 1,
      checkedAt: '2026-09-23',
      skills: {
        skill1: {
          support: 'supported',
          effects: [{ kind: 'passive', target: 'allies', targetWeapon: 'SG', stat: 'attack', ref: 1 }],
        },
        skill2: {
          support: 'supported',
          effects: [
            { kind: 'timed', trigger: 'battleStart', target: 'allies', stat: 'attack', ref: 1, durationSeconds: 5 },
          ],
        },
        burst: { support: 'unsupported', effects: [] },
      },
    });
    const [p] = resolvePassives(def, character, MAX_SKILL_LEVELS);
    const [t] = resolveTimed(def, character, MAX_SKILL_LEVELS);
    expect(p!.targetWeapon).toBe('SG');
    expect('targetWeapon' in t!).toBe(false);
  });
});
