import { describe, expect, it } from 'vitest';
import {
  FULL_BURST_BOOST,
  baseAttackOf,
  computeDamage,
  computeTriggerDamage,
  modelNotes,
  type DamageInput,
} from '../damage.ts';
import { ZERO_BUFFS } from '../skills/buffs.ts';
import { makeCharacter } from './fixtures.ts';

function input(overrides: Partial<DamageInput> = {}): DamageInput {
  return {
    character: makeCharacter(),
    growth: { level: 1, grade: 0, core: 0 },
    enemy: { defence: 100, element: 'Wind', hasCore: true },
    condition: { coreHitRate: 1, distanceBonus: true, fullCharge: true, durationSeconds: 180 },
    ...overrides,
  };
}

describe('computeDamage', () => {
  it('multiplies base hit, weapon, boost group and element (AR reference case)', () => {
    const r = computeDamage(input());
    expect(r.attack).toBe(1000);
    expect(r.baseHit).toBe(900);
    expect(r.weaponMultiplier).toBeCloseTo(0.1365, 10);
    expect(r.boost).toEqual({ core: 1, crit: 0.075, distance: 0.3, fullBurst: 0, total: 2.375 });
    expect(r.attackDamageMultiplier).toBe(1);
    expect(r.baseAttack).toBe(1000);
    expect(r.buffs).toEqual(ZERO_BUFFS);
    expect(r.elementMultiplier).toBe(1.1);
    expect(r.perTrigger).toBeCloseTo(900 * 0.1365 * 2.375 * 1.1, 6);
    expect(r.cadence.triggersPerSecond).toBeCloseTo(3600 / 355, 6);
    expect(r.dps).toBeCloseTo(r.perTrigger * r.cadence.triggersPerSecond, 6);
    expect(r.totalDamage).toBeCloseTo(r.dps * 180, 4);
  });

  it('ignores core hit rate when the enemy has no core', () => {
    const r = computeDamage(input({ enemy: { defence: 100, element: null, hasCore: false } }));
    expect(r.boost.core).toBe(0);
    expect(r.elementMultiplier).toBe(1);
    expect(r.boost.total).toBeCloseTo(1.375, 10);
  });

  it('scales core boost by hit rate and per-character core rate', () => {
    const r = computeDamage(
      input({
        character: makeCharacter({ coreDamageRate: 2.5 }),
        condition: { coreHitRate: 0.4, distanceBonus: false, fullCharge: true, durationSeconds: 1 },
      }),
    );
    expect(r.boost.core).toBeCloseTo(0.6, 10);
    expect(r.boost.distance).toBe(0);
  });

  it('clamps base hit to 1 when defence exceeds attack', () => {
    const r = computeDamage(input({ enemy: { defence: 5000, element: null, hasCore: true } }));
    expect(r.baseHit).toBe(1);
  });

  it('applies full charge multiplier only for charge weapons, and no distance bonus without bonusRange', () => {
    const rl = makeCharacter(
      {
        damage: 6130,
        maxAmmo: 6,
        reloadTime: 2,
        rateOfFire: 60,
        endRateOfFire: 60,
        chargeTime: 1,
        fullChargeDamage: 2.5,
        inputType: 'UP',
      },
      { weaponType: 'RL', bonusRange: null },
    );
    const full = computeDamage(input({ character: rl }));
    expect(full.chargeMultiplier).toBe(2.5);
    expect(full.boost.distance).toBe(0);
    const noCharge = computeDamage(
      input({
        character: rl,
        condition: { coreHitRate: 1, distanceBonus: true, fullCharge: false, durationSeconds: 180 },
      }),
    );
    expect(noCharge.chargeMultiplier).toBe(1);
    expect(full.notes.map((n) => n.code)).not.toContain('charge-release');
  });

  it('applies buffs: attack before defence, crit in the boost group, attack damage as its own multiplier, charge only when charging', () => {
    const buffs = {
      attackRatio: 0.2,
      attackFlat: 100,
      critRate: 0.05,
      critDamage: 0.5,
      attackDamage: 0.3,
      chargeDamage: 0.4,
      distributedDamage: 0,
      burstGaugeSpeed: 0,
      maxAmmoRatio: 0,
      maxAmmoFlat: 0,
      reloadSpeed: 0,
      chargeSpeed: 0,
      chargeTimeFlat: 0,
      hitRate: 0,
      infiniteAmmo: 0,
      elementDamage: 0,
      coreDamage: 0,
      normalAttackDamage: 0,
      weapon: null,
    };
    const r = computeDamage(input({ buffs }));
    expect(r.baseAttack).toBe(1000);
    expect(r.attack).toBeCloseTo(1300, 10);
    expect(r.baseHit).toBeCloseTo(1200, 10);
    // (0.15 + 0.05) × (1.5 − 1 + 0.5) = 0.2
    expect(r.boost.crit).toBeCloseTo(0.2, 12);
    // 攻撃ダメージは加算グループの外（クイーン（真）の実測で比 1 : 1.5 : 2 : 2.5 を確認）
    expect(r.boost.total).toBeCloseTo(1 + 1 + 0.2 + 0.3, 12);
    expect(r.attackDamageMultiplier).toBeCloseTo(1.3, 12);
    expect(r.perTrigger).toBeCloseTo(1200 * 0.1365 * 2.5 * 1.3 * 1.1, 8);
    expect(r.chargeMultiplier).toBe(1); // AR はチャージ武器ではない
    expect(r.buffs).toBe(buffs);

    const rl = makeCharacter(
      { maxAmmo: 6, rateOfFire: 60, endRateOfFire: 60, chargeTime: 1, fullChargeDamage: 2.5, inputType: 'UP' },
      { weaponType: 'RL', bonusRange: null },
    );
    expect(computeDamage(input({ character: rl, buffs })).chargeMultiplier).toBeCloseTo(2.9, 12);
    expect(
      computeDamage(
        input({
          character: rl,
          buffs,
          condition: { coreHitRate: 1, distanceBonus: true, fullCharge: false, durationSeconds: 180 },
        }),
      ).chargeMultiplier,
    ).toBe(1);
  });

  it('baseAttackOf prefers attackOverride over the growth-derived attack', () => {
    expect(baseAttackOf(input())).toBe(1000);
    expect(baseAttackOf(input({ attackOverride: 5000 }))).toBe(5000);
  });

  it('buffs stack on top of attackOverride', () => {
    const r = computeDamage(
      input({ attackOverride: 5000, buffs: { ...ZERO_BUFFS, attackRatio: 0.1, attackFlat: 50 } }),
    );
    expect(r.baseAttack).toBe(5000);
    expect(r.attack).toBeCloseTo(5550, 10);
  });

  it('rejects invalid core hit rate', () => {
    expect(() =>
      computeDamage(
        input({ condition: { coreHitRate: 1.5, distanceBonus: true, fullCharge: true, durationSeconds: 180 } }),
      ),
    ).toThrow(RangeError);
  });
});

// ---- Stage 5: 1 トリガーの式の切り出しとフルバースト補正 ----

describe('computeTriggerDamage', () => {
  it('is the cadence-independent part of computeDamage', () => {
    const full = computeDamage(input());
    const trigger = computeTriggerDamage(input());
    const { cadence: _c, dps: _d, totalDamage: _t, notes: _n, ...rest } = full;
    expect(trigger).toEqual(rest);
  });

  it('adds FULL_BURST_BOOST to the boost group only when fullBurst is true', () => {
    const base = computeTriggerDamage(input());
    const fb = computeTriggerDamage(
      input({
        condition: { coreHitRate: 1, distanceBonus: true, fullCharge: true, fullBurst: true, durationSeconds: 180 },
      }),
    );
    expect(FULL_BURST_BOOST).toBe(0.5);
    expect(base.boost.fullBurst).toBe(0);
    expect(fb.boost.fullBurst).toBe(0.5);
    expect(fb.boost.total).toBeCloseTo(base.boost.total + 0.5, 12);
    expect(fb.perTrigger).toBeCloseTo((base.perTrigger * fb.boost.total) / base.boost.total, 8);
    // 攻撃ダメージ・属性・武器倍率には触らない
    expect(fb.attackDamageMultiplier).toBe(base.attackDamageMultiplier);
    expect(fb.elementMultiplier).toBe(base.elementMultiplier);
    expect(fb.weaponMultiplier).toBe(base.weaponMultiplier);
  });

  it('computeDamage with fullBurst omitted equals fullBurst: false', () => {
    const omitted = computeDamage(input());
    const explicit = computeDamage(
      input({
        condition: { coreHitRate: 1, distanceBonus: true, fullCharge: true, fullBurst: false, durationSeconds: 180 },
      }),
    );
    expect(explicit).toEqual(omitted);
  });
});

describe('modelNotes', () => {
  it('flags unsupported and approximated mechanics', () => {
    const codes = modelNotes(makeCharacter({ muzzleCount: 2, reloadBullet: 0.33, penetration: 1 }).shot).map(
      (n) => `${n.level}:${n.code}`,
    );
    expect(codes).toEqual(['unsupported:multi-muzzle', 'unsupported:penetration', 'approx:chunked-reload']);
  });

  it('is empty for a plain AR', () => {
    expect(modelNotes(makeCharacter().shot)).toEqual([]);
  });
});
