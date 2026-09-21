import { describe, expect, it } from 'vitest';
import { computeCadence, reloadChunks, shotIntervalFrames } from '../cadence.ts';
import type { ShotParams } from '../types.ts';

function shot(overrides: Partial<ShotParams>): ShotParams {
  return {
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
    ...overrides,
  };
}

describe('computeCadence', () => {
  it('AR: 60 rounds at 720 rpm (5f) + 1.0 s reload → 6.0 s cycle, 10 triggers/s', () => {
    const c = computeCadence(shot({}));
    expect(c.shotFrames.every((f) => f === 5)).toBe(true);
    expect(c.magazineFrames).toBe(300);
    expect(c.reloadFrames).toBe(60);
    expect(c.cycleSeconds).toBe(6);
    expect(c.triggersPerSecond).toBe(10);
  });

  it('SMG: 1440 rpm is quantized to 3f (20/s while firing)', () => {
    const c = computeCadence(shot({ maxAmmo: 120, rateOfFire: 1440, endRateOfFire: 1440 }));
    expect(c.shotFrames[0]).toBe(3);
    expect(c.cycleFrames).toBe(360 + 60);
    expect(c.triggersPerSecond).toBeCloseTo(120 / 7, 6);
  });

  it('SR: full charge 1.0 s at 60 rpm → 60f per shot, 2.0 s reload', () => {
    const c = computeCadence(
      shot({
        maxAmmo: 6,
        reloadTime: 2,
        rateOfFire: 60,
        endRateOfFire: 60,
        chargeTime: 1,
        fullChargeDamage: 2.5,
        inputType: 'UP',
      }),
    );
    expect(c.shotFrames).toEqual([60, 60, 60, 60, 60, 60]);
    expect(c.cycleSeconds).toBe(8);
    expect(c.triggersPerSecond).toBe(0.75);
  });

  it('charge release frames are added per shot', () => {
    const sr = shot({ maxAmmo: 6, reloadTime: 2, rateOfFire: 60, endRateOfFire: 60, chargeTime: 1, inputType: 'UP' });
    expect(shotIntervalFrames(sr, 0, { chargeReleaseFrames: 22 })).toBe(82);
  });

  it('MG: spin-up from 60 rpm by +100 rpm per shot, capped at 1f', () => {
    const mg = shot({
      maxAmmo: 300,
      reloadTime: 2.5,
      rateOfFire: 60,
      endRateOfFire: 4200,
      rateOfFireChangePerShot: 100,
      rateOfFireResetTime: 1,
    });
    const c = computeCadence(mg);
    expect(c.shotFrames[0]).toBe(60);
    expect(c.shotFrames[1]).toBe(23);
    expect(c.shotFrames[35]).toBe(2);
    expect(c.shotFrames[36]).toBe(1);
    expect(c.magazineFrames).toBe(468);
    expect(c.reloadFrames).toBe(150);
    expect(c.cycleFrames).toBe(618);
  });
});

describe('reloadChunks', () => {
  it('is 1 for full reloads', () => {
    expect(reloadChunks({ maxAmmo: 60, reloadBullet: 1 })).toBe(1);
  });

  it('rounds ammo per chunk (SG 9 × 0.33 → 3 per chunk → 3 chunks)', () => {
    expect(reloadChunks({ maxAmmo: 9, reloadBullet: 0.33 })).toBe(3);
    expect(reloadChunks({ maxAmmo: 6, reloadBullet: 0.33 })).toBe(3);
    expect(reloadChunks({ maxAmmo: 60, reloadBullet: 0.5 })).toBe(2);
  });

  it('multiplies reload time by chunk count', () => {
    const c = computeCadence(
      shot({ maxAmmo: 9, reloadTime: 0.67, reloadBullet: 0.33, rateOfFire: 90, endRateOfFire: 90 }),
    );
    expect(c.reloadChunks).toBe(3);
    expect(c.reloadFrames).toBe(41 * 3);
  });
});
