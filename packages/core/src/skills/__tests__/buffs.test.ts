import { describe, expect, it } from 'vitest';
import { ZERO_BUFFS, addBuff, applyAttackBuffs, applyChargeBuffs, applyCritBuffs, type BuffTotals } from '../buffs.ts';

const buffs: BuffTotals = {
  attackRatio: 0.2,
  attackFlat: 300,
  critRate: 0.05,
  critDamage: 0.2,
  attackDamage: 0.1,
  chargeDamage: 0.4,
};

describe('applyAttackBuffs', () => {
  it('multiplies by the ratio and then adds the flat amount', () => {
    expect(applyAttackBuffs(1000, ZERO_BUFFS)).toBe(1000);
    expect(applyAttackBuffs(1000, { ...ZERO_BUFFS, attackRatio: 0.2 })).toBeCloseTo(1200, 10);
    expect(applyAttackBuffs(1000, { ...ZERO_BUFFS, attackFlat: 300 })).toBe(1300);
    expect(applyAttackBuffs(1000, buffs)).toBeCloseTo(1500, 10);
  });
});

describe('applyCritBuffs', () => {
  it('adds to rate and damage', () => {
    expect(applyCritBuffs({ rate: 0.15, damage: 1.5 }, ZERO_BUFFS)).toEqual({ rate: 0.15, damage: 1.5 });
    const c = applyCritBuffs({ rate: 0.15, damage: 1.5 }, buffs);
    expect(c.rate).toBeCloseTo(0.2, 12);
    expect(c.damage).toBeCloseTo(1.7, 12);
  });
});

describe('applyChargeBuffs', () => {
  it('adds to the full charge multiplier only when charging', () => {
    expect(applyChargeBuffs(2.5, true, ZERO_BUFFS)).toBe(2.5);
    expect(applyChargeBuffs(2.5, true, buffs)).toBeCloseTo(2.9, 12);
    expect(applyChargeBuffs(2.5, false, buffs)).toBe(1);
  });
});

describe('addBuff', () => {
  it('routes attack by scaling and other stats by name, without mutating the input', () => {
    const a = addBuff(ZERO_BUFFS, 'attack', 'ratio', 0.1);
    const b = addBuff(a, 'attack', 'casterAttack', 250);
    const c = addBuff(b, 'critDamage', 'ratio', 0.3);
    expect(ZERO_BUFFS).toEqual({
      attackRatio: 0,
      attackFlat: 0,
      critRate: 0,
      critDamage: 0,
      attackDamage: 0,
      chargeDamage: 0,
    });
    expect(c).toEqual({
      attackRatio: 0.1,
      attackFlat: 250,
      critRate: 0,
      critDamage: 0.3,
      attackDamage: 0,
      chargeDamage: 0,
    });
  });
});
