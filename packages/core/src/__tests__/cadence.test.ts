import { describe, expect, it } from 'vitest';
import { computeCadence, reloadChunks, simulateShotFrames } from '../cadence.ts';
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

const SR = shot({
  maxAmmo: 6,
  reloadTime: 1.5,
  rateOfFire: 60,
  endRateOfFire: 60,
  chargeTime: 1,
  fullChargeDamage: 2.5,
  inputType: 'UP',
});
const RL = shot({
  maxAmmo: 6,
  reloadTime: 2,
  rateOfFire: 60,
  endRateOfFire: 60,
  chargeTime: 1,
  fullChargeDamage: 2.5,
  inputType: 'UP',
});
const MG = shot({
  maxAmmo: 300,
  reloadTime: 2.5,
  rateOfFire: 60,
  endRateOfFire: 4200,
  rateOfFireChangePerShot: 100,
  rateOfFireResetTime: 1,
});

// 期待値は 2026-09-22 の射撃場録画（60fps）の実測に基づく。plan/verification.md 参照。
describe('computeCadence (calibrated against recordings)', () => {
  it('AR: 5f per shot, 60 rounds span 295f, next magazine starts right after the 60f reload (measured 355f cycle)', () => {
    const c = computeCadence(shot({}));
    expect(c.shotFrames.slice(0, 4)).toEqual([0, 5, 10, 15]);
    expect(c.magazineFrames).toBe(295);
    expect(c.firstShotFrames).toBe(0);
    expect(c.reloadFrames).toBe(60);
    expect(c.cycleFrames).toBe(355);
    expect(c.triggersPerSecond).toBeCloseTo((60 * 60) / 355, 6);
  });

  it('SMG: 1440 rpm accumulates to 2.5f average (unverified; assumes the same accumulator as MG)', () => {
    const c = computeCadence(shot({ maxAmmo: 120, rateOfFire: 1440, endRateOfFire: 1440 }));
    expect(c.shotFrames.slice(0, 5)).toEqual([0, 3, 5, 8, 10]);
    expect(c.magazineFrames).toBe(298);
  });

  it('SR: 82f per full-charge shot (60f charge + 22f release), reload 90f → 582f cycle (measured 577f)', () => {
    const c = computeCadence(SR);
    expect(c.shotFrames).toEqual([0, 82, 164, 246, 328, 410]);
    expect(c.firstShotFrames).toBe(82);
    expect(c.cycleFrames).toBe(82 + 410 + 90);
  });

  it('RL: same charge cadence, reload 120f → 612f cycle (measured 610f)', () => {
    const c = computeCadence(RL);
    expect(c.cycleFrames).toBe(612);
    expect(c.triggersPerSecond).toBeCloseTo(360 / 612, 6);
  });

  it('MG: spin-up from 60 rpm (+100 rpm per shot) reaches 1f/shot, 300 rounds span ~390f (measured 387f)', () => {
    const f = simulateShotFrames(MG);
    expect(f[1]! - f[0]!).toBeGreaterThanOrEqual(22); // 160 rpm → 22.5f
    expect(f[1]! - f[0]!).toBeLessThanOrEqual(23);
    expect(f[299]! - f[298]!).toBe(1);
    const c = computeCadence(MG);
    expect(c.magazineFrames).toBeGreaterThanOrEqual(385);
    expect(c.magazineFrames).toBeLessThanOrEqual(392);
    expect(c.firstShotFrames).toBe(20);
    expect(c.reloadFrames).toBe(150);
    // 実測サイクル 563f（1 発目→次マガジン 1 発目）
    expect(Math.abs(c.cycleFrames - 563)).toBeLessThanOrEqual(5);
  });

  it('charge release frames are configurable', () => {
    const f = simulateShotFrames(SR, { chargeReleaseFrames: 0, spinUpFirstShotFrames: 20 });
    expect(f[1]).toBe(60);
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
