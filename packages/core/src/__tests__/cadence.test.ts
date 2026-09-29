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
// （V-0011。rpm はゲーム内の時計 = C-0058、AR・SMG・SG のリロード明けの遅れ = C-0059）。
describe('computeCadence (calibrated against recordings)', () => {
  it('AR 720 rpm: 60 rounds span 290f with a 4f gap at intervals 11・21・31・41・51 (004-01・004-02・007-01・007-02)', () => {
    const c = computeCadence(shot({}));
    expect(c.magazineFrames).toBe(290);
    expect(intervalCounts(c.shotFrames)).toEqual({ 4: 5, 5: 54 });
    const short = c.shotFrames.flatMap((f, i) => (i > 0 && f - c.shotFrames[i - 1]! === 4 ? [i] : []));
    expect(short).toEqual([11, 21, 31, 41, 51]);
    // Stage 22-C: 戦闘開始は構え 12f の後（C-0114）
    expect(c.firstShotFrames).toBe(12);
    expect(c.reloadFrames).toBe(60);
  });

  it('AR: the next magazine fires 82f after the last shot (reload 60f + 22f, C-0059; 004-01), 100f for 1.3 s (007-01)', () => {
    const c = computeCadence(shot({}));
    expect(c.reloadFirstShotFrames).toBe(22);
    expect(c.reloadFrames + c.reloadFirstShotFrames).toBe(82);
    expect(c.cycleFrames).toBe(22 + 290 + 60);
    // 毎秒はゲーム内の秒（Stage 21-B）
    expect(c.triggersPerSecond).toBeCloseTo(60 / framesToGameSeconds(372), 6);
    const folkwang = computeCadence(shot({ reloadTime: 1.3 }));
    expect(folkwang.reloadFrames + folkwang.reloadFirstShotFrames).toBe(100);
  });

  it('SMG 1440 rpm: 120 rounds span 292f with 65 gaps of 2f and 54 of 3f (005-01・005-02); next magazine after 82f (measured 83f)', () => {
    const c = computeCadence(shot({ maxAmmo: 120, rateOfFire: 1440, endRateOfFire: 1440 }));
    expect(c.magazineFrames).toBe(292);
    expect(intervalCounts(c.shotFrames)).toEqual({ 2: 65, 3: 54 });
    expect(c.reloadFrames + c.reloadFirstShotFrames).toBe(82);
  });

  it('SG 90 rpm: 39f and 40f gaps, 9 rounds span 314f (008-01: 314・315f)', () => {
    const c = computeCadence(shot({ maxAmmo: 9, reloadTime: 1.86, rateOfFire: 90, endRateOfFire: 90 }));
    expect(c.magazineFrames).toBe(314);
    expect(intervalCounts(c.shotFrames)).toEqual({ 39: 6, 40: 2 });
    // 最終弾 → 次の 1 発目: リロード 112f + 22f = 134f（実測 133・132f）
    expect(c.reloadFrames + c.reloadFirstShotFrames).toBe(134);
  });

  it('SR: 82f per full-charge shot (60f charge + 22f release), reload 90f → 582f cycle (measured 577f)', () => {
    const c = computeCadence(SR);
    expect(c.shotFrames).toEqual([0, 82, 164, 246, 328, 410]);
    // Stage 22-A: 戦闘開始の 1 発目は構え解除（13f）が無いぶん早い（C-0110）。リロードの後は 82f のまま
    expect(c.firstShotFrames).toBe(69);
    expect(c.reloadFirstShotFrames).toBe(82);
    expect(c.cycleFrames).toBe(82 + 410 + 90);
  });

  it('RL: same charge cadence, reload 120f → 612f cycle (measured 610f)', () => {
    const c = computeCadence(RL);
    expect(c.cycleFrames).toBe(612);
    expect(c.triggersPerSecond).toBeCloseTo(6 / framesToGameSeconds(612), 6);
  });

  it('MG: spin-up from 60 rpm (+100 rpm per shot) reaches 1f/shot, 300 rounds span ~388f (measured 386–391f)', () => {
    const f = simulateShotFrames(MG);
    expect(f[1]! - f[0]!).toBeGreaterThanOrEqual(22); // 160 rpm → 22.5f
    expect(f[1]! - f[0]!).toBeLessThanOrEqual(23);
    expect(f[299]! - f[298]!).toBe(1);
    const c = computeCadence(MG);
    expect(c.magazineFrames).toBeGreaterThanOrEqual(385);
    expect(c.magazineFrames).toBeLessThanOrEqual(392);
    // Stage 22-C: 戦闘開始は構え 12f（C-0114）、リロードの後は初弾遅延 20f（C-0002）
    expect(c.firstShotFrames).toBe(12);
    expect(c.reloadFirstShotFrames).toBe(20);
    expect(c.reloadFrames).toBe(150);
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

    it('last shot to the next first shot: 170f plain (measured 171–176f), 104f with クラウン S1 reload speed 44.35% (measured 105–110f)', () => {
      const plain = computeCadence(MG);
      expect(plain.reloadFrames + plain.reloadFirstShotFrames).toBe(170);
      const buffed = computeCadence(MG, undefined, firingParams(MG, { ...ZERO_FIRING_BUFFS, reloadSpeed: 0.4435 }));
      expect(buffed.reloadFrames + buffed.reloadFirstShotFrames).toBe(104);
    });
  });

  it('RL with 1.5 s charge: 112f per shot (90f + 22f), reload 120f → 792f cycle (measured 790f)', () => {
    const c = computeCadence(shot({ ...RL, chargeTime: 1.5, fullChargeDamage: 3.5 }));
    expect(c.shotFrames).toEqual([0, 112, 224, 336, 448, 560]);
    expect(c.cycleFrames).toBe(792);
  });

  it('charge release frames are configurable', () => {
    const f = simulateShotFrames(SR, {
      chargeReleaseFrames: 0,
      spinUpFirstShotFrames: 20,
      reloadFirstShotFrames: 22,
      aimOutFrames: 13,
      aimInFrames: 12,
    });
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

// Stage 22-A（C-0110）: チャージ武器は、ハイドしていた状態（戦闘開始・窓の明け）からは構え解除（13f）が無いぶん早く撃つ。
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
