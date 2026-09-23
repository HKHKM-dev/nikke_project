import { describe, expect, it } from 'vitest';
import {
  ZERO_BUFFS,
  addFlatAttack,
  addRatioBuff,
  applyAttackBuffs,
  applyAttackDamageBuffs,
  applyChargeBuffs,
  applyCritBuffs,
  applyResolvedEffect,
  type BuffTotals,
} from '../buffs.ts';

const buffs: BuffTotals = {
  attackRatio: 0.2,
  attackFlat: 300,
  critRate: 0.05,
  critDamage: 0.2,
  attackDamage: 0.1,
  chargeDamage: 0.4,
  distributedDamage: 0,
  burstGaugeSpeed: 0,
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

describe('addRatioBuff / addFlatAttack', () => {
  it('route each stat to its field without mutating the input', () => {
    const a = addRatioBuff(ZERO_BUFFS, 'attack', 0.1);
    const b = addFlatAttack(a, 250);
    const c = addRatioBuff(b, 'critDamage', 0.3);
    const d = addRatioBuff(c, 'chargeDamage', 0.4);
    const e = addRatioBuff(addRatioBuff(d, 'distributedDamage', 0.9001), 'burstGaugeSpeed', 0.704);
    expect(ZERO_BUFFS).toEqual({
      attackRatio: 0,
      attackFlat: 0,
      critRate: 0,
      critDamage: 0,
      attackDamage: 0,
      chargeDamage: 0,
      distributedDamage: 0,
      burstGaugeSpeed: 0,
    });
    expect(d).toEqual({
      attackRatio: 0.1,
      attackFlat: 250,
      critRate: 0,
      critDamage: 0.3,
      attackDamage: 0,
      chargeDamage: 0.4,
      distributedDamage: 0,
      burstGaugeSpeed: 0,
    });
    // Stage 8 の 2 つもそれぞれのフィールドへ
    expect(e.distributedDamage).toBe(0.9001);
    expect(e.burstGaugeSpeed).toBe(0.704);
  });
});

describe('applyResolvedEffect', () => {
  it('treats casterAttack as caster attack × value (flat) and everything else as a ratio', () => {
    const flat = applyResolvedEffect(ZERO_BUFFS, { stat: 'attack', scaling: 'casterAttack', value: 0.1408 }, 119896);
    expect(flat.appliedAmount).toBeCloseTo(16881.36, 2);
    expect(flat.totals.attackFlat).toBeCloseTo(16881.36, 2);
    expect(flat.totals.attackRatio).toBe(0);

    const ratio = applyResolvedEffect(flat.totals, { stat: 'attack', scaling: 'ratio', value: 0.5808 }, 119896);
    expect(ratio.appliedAmount).toBe(0.5808);
    expect(ratio.totals.attackRatio).toBe(0.5808);
    expect(ratio.totals.attackFlat).toBeCloseTo(16881.36, 2);

    const crit = applyResolvedEffect(ZERO_BUFFS, { stat: 'critRate', scaling: 'ratio', value: 0.0816 }, 0);
    expect(crit.totals.critRate).toBe(0.0816);
  });
});

describe('applyAttackDamageBuffs', () => {
  it('returns 1 + attackDamage as a multiplier separate from the boost group', () => {
    expect(applyAttackDamageBuffs(ZERO_BUFFS)).toBe(1);
    expect(applyAttackDamageBuffs({ ...ZERO_BUFFS, attackDamage: 0.3 })).toBeCloseTo(1.3, 12);
  });
});
