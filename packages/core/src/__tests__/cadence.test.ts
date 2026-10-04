import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeCadence, reloadChunks, simulateShotFrames } from '../cadence.ts';
import { firingParams, ZERO_FIRING_BUFFS } from '../frame/firing.ts';
import type { CharacterData, ShotParams } from '../types.ts';
import { framesToGameSeconds } from '../time.ts';

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
    targetBurstEnergyPerShot: 4000,
    burstEnergyPerShot: 2000,
    fullChargeBurstEnergy: 1,
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

/** 間隔の内訳（間隔のフレーム数 → 回数） */
function intervalCounts(frames: number[]): Record<number, number> {
  const counts: Record<number, number> = {};
  for (let i = 1; i < frames.length; i++) {
    const d = frames[i]! - frames[i - 1]!;
    counts[d] = (counts[d] ?? 0) + 1;
  }
  return counts;
}

// 期待値は射撃場録画（60fps）の実測に基づく。2026-09-22 の較正（plan/verification.md）を、Stage 21-C2 で読み直した
// （V-0011。rpm はゲーム内の時計 = C-0058）。Stage 23・24 でチャージとリロードの秒もゲーム内の時計で数える（C-0140・C-0145）。
// リロードのフレーム数は端数つき（射手が端数を持ち越す）で、リロード明けの遅れは武器種によらず 24f（C-0148）。
/** リロードの秒 → 端数つきのフレーム数（Stage 24） */
const R = (seconds: number): number => seconds / 0.017;
describe('computeCadence (calibrated against recordings)', () => {
  it('AR 720 rpm: 60 rounds span 290f with a 4f gap at intervals 11・21・31・41・51 (004-01・004-02・007-01・007-02)', () => {
    const c = computeCadence(shot({}));
    expect(c.magazineFrames).toBe(290);
    expect(intervalCounts(c.shotFrames)).toEqual({ 4: 5, 5: 54 });
    const short = c.shotFrames.flatMap((f, i) => (i > 0 && f - c.shotFrames[i - 1]! === 4 ? [i] : []));
    expect(short).toEqual([11, 21, 31, 41, 51]);
    // Stage 22-C: 戦闘開始は構え 12f の後（C-0114）
    expect(c.firstShotFrames).toBe(12);
    expect(c.reloadFrames).toBeCloseTo(R(1), 9);
  });

  it('AR: the next magazine fires 82.8f after the last shot (reload 58.8f + 24f, C-0148; measured 82f in 004-01・073), 100.5f for 1.3 s (007-01: 100f)', () => {
    const c = computeCadence(shot({}));
    expect(c.reloadFirstShotFrames).toBe(24);
    expect(c.reloadFrames + c.reloadFirstShotFrames).toBeCloseTo(R(1) + 24, 9);
    expect(Math.abs(c.reloadFrames + c.reloadFirstShotFrames - 82)).toBeLessThanOrEqual(1);
    expect(c.cycleFrames).toBeCloseTo(24 + 290 + R(1), 9);
    // 毎秒はゲーム内の秒（Stage 21-B）
    expect(c.triggersPerSecond).toBeCloseTo(60 / framesToGameSeconds(24 + 290 + R(1)), 6);
    const folkwang = computeCadence(shot({ reloadTime: 1.3 }));
    expect(Math.abs(folkwang.reloadFrames + folkwang.reloadFirstShotFrames - 100)).toBeLessThanOrEqual(1);
  });

  it('SMG 1440 rpm: 120 rounds span 292f with 65 gaps of 2f and 54 of 3f (005-01・005-02); next magazine after 82.8f (measured 83f; 098: 82.9f)', () => {
    const c = computeCadence(shot({ maxAmmo: 120, rateOfFire: 1440, endRateOfFire: 1440 }));
    expect(c.magazineFrames).toBe(292);
    expect(intervalCounts(c.shotFrames)).toEqual({ 2: 65, 3: 54 });
    expect(c.reloadFrames + c.reloadFirstShotFrames).toBeCloseTo(R(1) + 24, 9);
  });

  it('SG 90 rpm: 39f and 40f gaps, 9 rounds span 314f (008-01: 314・315f)', () => {
    const c = computeCadence(shot({ maxAmmo: 9, reloadTime: 1.86, rateOfFire: 90, endRateOfFire: 90 }));
    expect(c.magazineFrames).toBe(314);
    expect(intervalCounts(c.shotFrames)).toEqual({ 39: 6, 40: 2 });
    // 最終弾 → 次の 1 発目: リロード 109.4f + 24f = 133.4f（実測 133・132f）
    expect(c.reloadFrames + c.reloadFirstShotFrames).toBeCloseTo(R(1.86) + 24, 9);
  });

  it('SR: 82f per full-charge shot (59f charge + 23f release), reload 88.2f → 580.2f cycle (measured 577f; 001 drops frames early)', () => {
    const c = computeCadence(SR);
    expect(c.shotFrames).toEqual([0, 82, 164, 246, 328, 410]);
    // Stage 22-A: 戦闘開始の 1 発目は構え解除（13f）が無いぶん早い（C-0225）。リロードの後は 82f のまま
    expect(c.firstShotFrames).toBe(69);
    expect(c.reloadFirstShotFrames).toBe(82);
    expect(c.cycleFrames).toBeCloseTo(82 + 410 + R(1.5), 9);
  });

  it('RL: same charge cadence, reload 117.6f → 609.6f cycle (measured 610f)', () => {
    const c = computeCadence(RL);
    expect(c.cycleFrames).toBeCloseTo(82 + 410 + R(2), 9);
    expect(c.triggersPerSecond).toBeCloseTo(6 / framesToGameSeconds(82 + 410 + R(2)), 6);
  });

  it('MG: spin-up from 60 rpm (+100 rpm per shot) reaches 1f/shot, 300 rounds span ~388f (measured 386–391f)', () => {
    const f = simulateShotFrames(MG);
    expect(f[1]! - f[0]!).toBeGreaterThanOrEqual(22); // 160 rpm → 22.5f
    expect(f[1]! - f[0]!).toBeLessThanOrEqual(23);
    expect(f[299]! - f[298]!).toBe(1);
    const c = computeCadence(MG);
    expect(c.magazineFrames).toBeGreaterThanOrEqual(385);
    expect(c.magazineFrames).toBeLessThanOrEqual(392);
    // Stage 22-C: 戦闘開始は構え 12f（C-0114）。リロードの後は 24f（Stage 24。C-0148）
    expect(c.firstShotFrames).toBe(12);
    expect(c.reloadFirstShotFrames).toBe(24);
    expect(c.reloadFrames).toBeCloseTo(R(2.5), 9);
    // 実測サイクル 563f（1 発目→次マガジン 1 発目）
    expect(Math.abs(c.cycleFrames - 563)).toBeLessThanOrEqual(5);
  });

  // 2026-09-24 の再確認（plan/design-mg-fire-rate.md）。録画 35（エマ AI）・41（クラウン AI）の残弾表示を 1 フレームずつ読んだ、
  // 描画が軽い場面のマガジン。重い場面（描画落ち）と 3 分モードの的が狙えない区間はモデルに入れない（撮影環境の性質）
  describe('MG re-check against recordings 35 and 41 (light scenes)', () => {
    it('300 rounds span 388f, inside the measured 386–391f (041-04)', () => {
      const c = computeCadence(MG);
      expect(c.magazineFrames).toBe(388);
      expect(c.magazineFrames).toBeGreaterThanOrEqual(386);
      expect(c.magazineFrames).toBeLessThanOrEqual(391);
    });

    it('spin-up has the measured shape and is at most 2f behind it (035-02・041-07; 4f before Stage 21-C3)', () => {
      // k 発目（1 発目 = 0）の累積フレーム。軽い場面の 4 マガジンで同じ値。どの換算でも ±1f には入らない（V-0011）
      const measured: Record<number, number> = {
        1: 23,
        2: 36,
        3: 46,
        5: 60,
        10: 81,
        20: 104,
        30: 117,
        40: 128,
        50: 137,
        100: 187,
        299: 386,
      };
      const f = simulateShotFrames(MG);
      for (const [k, frame] of Object.entries(measured)) {
        const lag = f[Number(k)]! - frame;
        expect(lag, `shot ${k}`).toBeGreaterThanOrEqual(0);
        expect(lag, `shot ${k}`).toBeLessThanOrEqual(2);
      }
      // 30 発目以降は実測もモデルも 1 フレーム 1 発なので、差は広がらない
      expect(f[299]! - f[30]!).toBe(386 - 117);
      expect(f[299]! - f[0]!).toBe(388);
    });

    it('last shot to the next first shot: 171.1f plain (measured 171–176f), 105.8f with クラウン S1 reload speed 44.35% (measured 105–110f)', () => {
      // Stage 24 で両方とも実測の範囲に入った（23 までは 170f・104f で、どちらも範囲の外）
      const plain = computeCadence(MG);
      expect(plain.reloadFrames + plain.reloadFirstShotFrames).toBeCloseTo(R(2.5) + 24, 9);
      expect(plain.reloadFrames + plain.reloadFirstShotFrames).toBeGreaterThanOrEqual(171);
      const buffed = computeCadence(MG, undefined, firingParams(MG, { ...ZERO_FIRING_BUFFS, reloadSpeed: 0.4435 }));
      expect(buffed.reloadFrames + buffed.reloadFirstShotFrames).toBeCloseTo(R(2.5 * (1 - 0.4435)) + 24, 9);
      expect(buffed.reloadFrames + buffed.reloadFirstShotFrames).toBeGreaterThanOrEqual(105);
    });
  });

  it('RL with 1.5 s charge: 112f per shot (89f + 23f), reload 117.6f → 789.6f cycle (measured 790f)', () => {
    const c = computeCadence(shot({ ...RL, chargeTime: 1.5, fullChargeDamage: 3.5 }));
    expect(c.shotFrames).toEqual([0, 112, 224, 336, 448, 560]);
    expect(c.cycleFrames).toBeCloseTo(112 + 560 + R(2), 9);
  });

  it('charge release frames are configurable', () => {
    const f = simulateShotFrames(SR, {
      chargeReleaseFrames: 0,
      spinUpFirstShotFrames: 20,
      reloadFirstShotFrames: 22,
      aimOutFrames: 13,
      aimInFrames: 12,
      stanceReloadExtraFrames: 11,
    });
    // Stage 23: 1 秒チャージは 1 ÷ 0.017 = 58.8 → 59f（C-0140）
    expect(f[1]).toBe(59);
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

  it('waits one empty stage before loading, with each stage rounded up (C-0154)', () => {
    const c = computeCadence(
      shot({ maxAmmo: 9, reloadTime: 0.67, reloadBullet: 0.33, rateOfFire: 90, endRateOfFire: 90 }),
    );
    expect(c.reloadChunks).toBe(3);
    // 0.67 秒 = 39.41f → 40f の段を、込めない 1 段 + 3 段
    expect(c.reloadFrames).toBe(160);
  });

  it('keeps the full reload unrounded (C-0145)', () => {
    const c = computeCadence(
      shot({ maxAmmo: 9, reloadTime: 0.67, reloadBullet: 1, rateOfFire: 90, endRateOfFire: 90 }),
    );
    expect(c.reloadChunks).toBe(1);
    expect(c.reloadFrames).toBeCloseTo(R(0.67), 9);
  });
});

// Stage 22-A（C-0225）: チャージ武器は、ハイドしていた状態（戦闘開始・窓の明け）からは構え解除（13f）が無いぶん早く撃つ。
// ラム（822、SR）: 発と発の間 82f、戦闘開始から 1 発目は実測 70f（075-04・075-06）。紅蓮BS は stage11ScarletBsTeam.test.ts（30f）
describe('first shot from hiding (Stage 22-A)', () => {
  it('ラム fires the first shot 13f earlier than the interval, and after a reload at the full interval', () => {
    const ram = JSON.parse(
      readFileSync(new URL('../../data/characters/822.json', import.meta.url), 'utf8'),
    ) as CharacterData;
    const c = computeCadence(ram.shot);
    expect(c.shotFrames[1]).toBe(82);
    expect(c.firstShotFrames).toBe(69);
    expect(c.reloadFirstShotFrames).toBe(82);
  });
});
