import { describe, expect, it } from 'vitest';
import { computeDamage, modelNotes, type DamageInput } from '../damage.ts';
import type { CharacterData, ShotParams } from '../types.ts';

function makeCharacter(shot: Partial<ShotParams> = {}, overrides: Partial<CharacterData> = {}): CharacterData {
  const skill = { id: 0, name: { ja: '', en: '' }, description: { ja: '', en: '' }, values: [] };
  return {
    resourceId: 1,
    name: { ja: 'テスト', en: 'Test' },
    rarity: 'SSR',
    class: 'Attacker',
    corporation: 'ELYSION',
    element: 'Fire',
    weaponType: 'AR',
    burstStep: 'Step3',
    levelCurve: { attack: [1000], hp: [10000], defence: [100] },
    statEnhance: { gradeRatio: 200, gradeAttack: 20, gradeHp: 3000, gradeDefence: 100, coreAttack: 200, coreHp: 200, coreDefence: 200 },
    crit: { rate: 0.15, damage: 1.5 },
    bonusRange: { min: 25, max: 45 },
    shot: {
      damage: 1365,
      shotCount: 1,
      muzzleCount: 1,
      maxAmmo: 60,
      reloadTime: 1,
      reloadBullet: 1,
      rateOfFire: 720,
      endRateOfFire: 720,
      rateOfFireChangePerShot: 0,
      rateOfFireResetTime: 0,
      chargeTime: 0,
      fullChargeDamage: 1,
      coreDamageRate: 2,
      inputType: 'DOWN',
      fireType: 'Instant',
      penetration: 0,
      maintainFireStance: 0,
      uptypeFireTiming: 0,
      ...shot,
    },
    skills: { skill1: skill, skill2: skill, burst: skill },
    ...overrides,
  };
}

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
    expect(r.boost).toEqual({ core: 1, crit: 0.075, distance: 0.3, total: 2.375 });
    expect(r.elementMultiplier).toBe(1.1);
    expect(r.perTrigger).toBeCloseTo(900 * 0.1365 * 2.375 * 1.1, 6);
    expect(r.cadence.triggersPerSecond).toBe(10);
    expect(r.dps).toBeCloseTo(r.perTrigger * 10, 6);
    expect(r.totalDamage).toBeCloseTo(r.dps * 180, 4);
  });

  it('ignores core hit rate when the enemy has no core', () => {
    const r = computeDamage(input({ enemy: { defence: 100, element: null, hasCore: false } }));
    expect(r.boost.core).toBe(0);
    expect(r.elementMultiplier).toBe(1);
    expect(r.boost.total).toBeCloseTo(1.375, 10);
  });

  it('scales core boost by hit rate and per-character core rate', () => {
    const r = computeDamage(input({ character: makeCharacter({ coreDamageRate: 2.5 }), condition: { coreHitRate: 0.4, distanceBonus: false, fullCharge: true, durationSeconds: 1 } }));
    expect(r.boost.core).toBeCloseTo(0.6, 10);
    expect(r.boost.distance).toBe(0);
  });

  it('clamps base hit to 1 when defence exceeds attack', () => {
    const r = computeDamage(input({ enemy: { defence: 5000, element: null, hasCore: true } }));
    expect(r.baseHit).toBe(1);
  });

  it('applies full charge multiplier only for charge weapons, and no distance bonus without bonusRange', () => {
    const rl = makeCharacter(
      { damage: 6130, maxAmmo: 6, reloadTime: 2, rateOfFire: 60, endRateOfFire: 60, chargeTime: 1, fullChargeDamage: 2.5, inputType: 'UP' },
      { weaponType: 'RL', bonusRange: null },
    );
    const full = computeDamage(input({ character: rl }));
    expect(full.chargeMultiplier).toBe(2.5);
    expect(full.boost.distance).toBe(0);
    const noCharge = computeDamage(input({ character: rl, condition: { coreHitRate: 1, distanceBonus: true, fullCharge: false, durationSeconds: 180 } }));
    expect(noCharge.chargeMultiplier).toBe(1);
    expect(full.notes.map((n) => n.code)).toContain('charge-release');
  });

  it('rejects invalid core hit rate', () => {
    expect(() => computeDamage(input({ condition: { coreHitRate: 1.5, distanceBonus: true, fullCharge: true, durationSeconds: 180 } }))).toThrow(RangeError);
  });
});

describe('modelNotes', () => {
  it('flags unsupported and approximated mechanics', () => {
    const codes = modelNotes(makeCharacter({ muzzleCount: 2, reloadBullet: 0.33, penetration: 1 }).shot).map((n) => `${n.level}:${n.code}`);
    expect(codes).toEqual(['unsupported:multi-muzzle', 'unsupported:penetration', 'approx:chunked-reload']);
  });

  it('is empty for a plain AR', () => {
    expect(modelNotes(makeCharacter().shot)).toEqual([]);
  });
});
