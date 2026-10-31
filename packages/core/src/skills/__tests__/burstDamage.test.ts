import { describe, expect, it } from 'vitest';
import { makeCharacter } from '../../__tests__/fixtures.ts';
import { computeTriggerDamage, type EnemyInput } from '../../damage.ts';
import type { SkillRaw } from '../../types.ts';
import { ZERO_BUFFS } from '../buffs.ts';
import { BURST_SKILL_FULL_BURST_BONUS, computeBurstHit, resolveBurstDamage, slotBurstHit } from '../burstDamage.ts';
import { MAX_SKILL_LEVELS } from '../resolve.ts';
import type { SkillDefinition } from '../types.ts';

const tenLevels = (from: number, to: number) =>
  Array.from({ length: 10 }, (_, i) => String(Math.round((from + ((to - from) * i) / 9) * 100) / 100));
const empty: SkillRaw = { id: 0, name: { ja: '', en: '' }, description: { ja: '', en: '' }, values: [] };
const burst: SkillRaw = {
  id: 3,
  name: { ja: 'バースト', en: 'Burst' },
  description: { ja: '最終攻撃力の{description_value_01}％のバーストスキルダメージ', en: '' },
  values: [tenLevels(207.79, 351.64), null, tenLevels(150, 266.4)],
};
const character = makeCharacter({}, { resourceId: 7, skills: { skill1: empty, skill2: empty, burst } });
const enemy: EnemyInput = { defence: 100, element: 'Wind', hasCore: true };

const definition: SkillDefinition = {
  formatVersion: 1,
  resourceId: 7,
  checkedAt: '2026-09-22',
  skills: {
    skill1: { support: 'unsupported', effects: [] },
    skill2: { support: 'unsupported', effects: [] },
    burst: {
      support: 'partial',
      effects: [
        { kind: 'burstDamage', ref: 1, damageType: 'skill' },
        { kind: 'burstDamage', ref: 3, damageType: 'distributed', assumes: { ja: '単体', en: 'single' } },
      ],
    },
  },
};

describe('resolveBurstDamage', () => {
  it('resolves each burstDamage ref at the burst level and divides by 100', () => {
    const lv10 = resolveBurstDamage(definition, character, MAX_SKILL_LEVELS);
    expect(lv10.map((r) => ({ ...r, multiplier: Math.round(r.multiplier * 1e6) / 1e6 }))).toEqual([
      { source: { resourceId: 7, skill: 'burst', name: burst.name }, damageType: 'skill', multiplier: 3.5164 },
      {
        source: { resourceId: 7, skill: 'burst', name: burst.name },
        damageType: 'distributed',
        multiplier: 2.664,
        assumes: { ja: '単体', en: 'single' },
      },
    ]);
    const lv1 = resolveBurstDamage(definition, character, { skill1: 10, skill2: 10, burst: 1 });
    expect(lv1[0]?.multiplier).toBeCloseTo(2.0779, 12);
  });

  it('returns nothing for unsupported bursts and rejects another character', () => {
    const none = {
      ...definition,
      skills: { ...definition.skills, burst: { support: 'unsupported' as const, effects: [] } },
    };
    expect(resolveBurstDamage(none, character, MAX_SKILL_LEVELS)).toEqual([]);
    expect(() => resolveBurstDamage({ ...definition, resourceId: 8 }, character, MAX_SKILL_LEVELS)).toThrow(RangeError);
  });
});

describe('computeBurstHit', () => {
  const effects = resolveBurstDamage(definition, character, MAX_SKILL_LEVELS);

  it('multiplies base hit, crit expectation, attack damage and element, but not weapon / core / distance', () => {
    const r = computeBurstHit({
      attack: 1300,
      enemy,
      crit: { rate: 0.2, damage: 2 },
      attackDamageMultiplier: 1.3,
      elementMultiplier: 1.1,
      effects,
      fullBurstBonus: false,
    });
    expect(r.baseHit).toBe(1200);
    expect(r.boost).toEqual({
      crit: 0.2,
      critDamage: 2,
      fullBurst: 0,
      core: 0,
      coreDamage: 0,
      distance: 0,
      distanceBonus: 0,
      total: 1.2,
      sustained: 0,
    });
    expect(r.multiplier).toBeCloseTo(3.5164 + 2.664, 12);
    expect(r.perEffect[0]?.expected).toBeCloseTo(1200 * 3.5164 * 1.2 * 1.3 * 1.1, 8);
    expect(r.perEffect[1]?.expected).toBeCloseTo(1200 * 2.664 * 1.2 * 1.3 * 1.1, 8);
    expect(r.perActivation).toBeCloseTo(1200 * (3.5164 + 2.664) * 1.2 * 1.3 * 1.1, 8);
  });

  it('adds the full burst bonus only when asked, and defaults to the constant', () => {
    const base = {
      attack: 1300,
      enemy,
      crit: { rate: 0.15, damage: 1.5 },
      attackDamageMultiplier: 1,
      elementMultiplier: 1,
      effects,
    };
    const off = computeBurstHit({ ...base, fullBurstBonus: false });
    const on = computeBurstHit({ ...base, fullBurstBonus: true });
    expect(on.boost.fullBurst).toBe(0.5);
    expect(on.perActivation / off.perActivation).toBeCloseTo(1.575 / 1.075, 12);
    expect(computeBurstHit(base).boost.fullBurst).toBe(BURST_SKILL_FULL_BURST_BONUS ? 0.5 : 0);
  });

  it('clamps base hit to 1 and returns zero for no effects', () => {
    const r = computeBurstHit({
      attack: 50,
      enemy,
      crit: { rate: 0, damage: 1 },
      attackDamageMultiplier: 1,
      elementMultiplier: 1,
      effects: [],
    });
    expect(r.baseHit).toBe(1);
    expect(r.perActivation).toBe(0);
  });
});

describe('slotBurstHit', () => {
  const trigger = computeTriggerDamage({
    character,
    growth: { level: 1, grade: 0, core: 0 },
    enemy,
    condition: { coreHitRate: 1, distanceBonus: true, fullCharge: true },
    buffs: { ...ZERO_BUFFS, attackRatio: 0.3, critRate: 0.05, attackDamage: 0.3 },
  });

  it('uses the buffed attack, crit and attack damage of the normal-attack trigger', () => {
    const hit = slotBurstHit(definition, MAX_SKILL_LEVELS, character, enemy, trigger, trigger.buffs);
    expect(hit?.baseHit).toBeCloseTo(1300 - 100, 10);
    expect(hit?.boost.crit).toBeCloseTo(0.2 * 0.5, 12);
    expect(hit?.attackDamageMultiplier).toBeCloseTo(1.3, 12);
    expect(hit?.elementMultiplier).toBe(1.1);
  });

  it('is null without a definition, for unsupported bursts and for bursts without damage', () => {
    expect(slotBurstHit(null, MAX_SKILL_LEVELS, character, enemy, trigger, ZERO_BUFFS)).toBeNull();
    expect(slotBurstHit(undefined, MAX_SKILL_LEVELS, character, enemy, trigger, ZERO_BUFFS)).toBeNull();
    const none = {
      ...definition,
      skills: { ...definition.skills, burst: { support: 'unsupported' as const, effects: [] } },
    };
    expect(slotBurstHit(none, MAX_SKILL_LEVELS, character, enemy, trigger, ZERO_BUFFS)).toBeNull();
  });
});

// 2 段目の段 16 の PR 2（plan/design-skill-stage16.md 2.2 節）: 防御力無視バーストスキルダメージ（burstDamage の damageType true。C-0807）。
// 式は倍率ダメージの防御力無視ダメージと同じ: 防御力を引かず（max(1, 攻撃力)）、防御力無視ダメージ▲を攻撃ダメージ▲と同じ和に足す
describe('slotBurstHit（防御力無視のバーストスキルダメージ）', () => {
  const withType = (damageType: 'skill' | 'true'): SkillDefinition => ({
    ...definition,
    skills: {
      ...definition.skills,
      burst: { support: 'supported', effects: [{ kind: 'burstDamage', ref: 1, damageType }] },
    },
  });
  const buffs = { ...ZERO_BUFFS, attackRatio: 0.3, critRate: 0.05, attackDamage: 0.3, trueDamage: 0.2 };
  const trigger = computeTriggerDamage({
    character,
    growth: { level: 1, grade: 0, core: 0 },
    enemy,
    condition: { coreHitRate: 1, distanceBonus: true, fullCharge: true },
    buffs,
  });

  it('resolves the damage type through to the burst hit', () => {
    expect(resolveBurstDamage(withType('true'), character, MAX_SKILL_LEVELS)[0]?.damageType).toBe('true');
  });

  it('does not subtract the defence and adds the true damage increase to the attack damage sum', () => {
    const hit = slotBurstHit(withType('true'), MAX_SKILL_LEVELS, character, enemy, trigger, buffs)!;
    const skill = slotBurstHit(withType('skill'), MAX_SKILL_LEVELS, character, enemy, trigger, buffs)!;
    // 攻撃力 1300・防御力 100。(1 + 0.3 + 0.2) の和。属性有利 1.1
    expect(hit.perActivation).toBeCloseTo(1300 * 3.5164 * hit.boost.total * 1.5 * 1.1, 6);
    // 防御力無視でないバーストスキルダメージは、防御力を引き、防御力無視ダメージ▲は乗らない
    expect(skill.perActivation).toBeCloseTo(1200 * 3.5164 * skill.boost.total * 1.3 * 1.1, 6);
  });
});
