import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeCadence, fullReloadFrames, reloadChunks, reloadStartOffset, simulateShotFrames } from '../cadence.ts';
import { shotFramesUpTo } from '../frame/shooter.ts';
import { firingParams, ZERO_FIRING_BUFFS } from '../frame/firing.ts';
import type { CharacterData, ShotParams } from '../types.ts';
import { framesToGameSeconds } from '../time.ts';
import { DEFAULT_WEAPON_MODEL } from '../weapons.ts';

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
// 全弾リロードは 1 回ごとに丸めた整数（plan/design-reload-rounding.md 案 E）で、リロード明けの遅れは武器種によらず 24f（C-0148）。
describe('computeCadence (calibrated against recordings)', () => {
  it('AR 720 rpm: 60 rounds span 290f with a 4f gap at intervals 11・21・31・41・51 (0004-01・0004-02・0007-01・0007-02)', () => {
    const c = computeCadence(shot({}));
    expect(c.magazineFrames).toBe(290);
    expect(intervalCounts(c.shotFrames)).toEqual({ 4: 5, 5: 54 });
    const short = c.shotFrames.flatMap((f, i) => (i > 0 && f - c.shotFrames[i - 1]! === 4 ? [i] : []));
    expect(short).toEqual([11, 21, 31, 41, 51]);
    // Stage 22-C: 戦闘開始は構え 12f の後（C-0114）
    expect(c.firstShotFrames).toBe(12);
    // 全弾リロードは 1 回ごとに丸める（案 E）: ⌈58.82 − 0.78（最終弾の蓄積の余り）+ 11.9⌉ − 12 = 58
    expect(c.reloadFrames).toBe(58);
  });

  it('AR: the next magazine fires 82f after the last shot (reload 58f + 24f; measured 82f in 0004-01・073), 100f for 1.3 s (0007-01: 100f)', () => {
    const c = computeCadence(shot({}));
    expect(c.reloadFirstShotFrames).toBe(24);
    expect(c.reloadFrames + c.reloadFirstShotFrames).toBe(82);
    expect(c.cycleFrames).toBe(24 + 290 + 58);
    // 毎秒はゲーム内の秒（Stage 21-B）
    expect(c.triggersPerSecond).toBeCloseTo(60 / framesToGameSeconds(24 + 290 + 58), 6);
    const folkwang = computeCadence(shot({ reloadTime: 1.3 }));
    expect(folkwang.reloadFrames + folkwang.reloadFirstShotFrames).toBe(100);
  });

  it('InstantBox (Scarlet: Goddeath): the aim takes 6f longer from hiding and after the reload (V-0675: 18f and 99f)', () => {
    // 紅蓮：神殺編（plan/design-new-chars-1029.md 12.2 節の d）: 戦闘開始 → 最初の発 18f（`0960-24`）、最終弾 → 次の 1 発目
    // はリロード 1.17 秒 + 24f + 6f（`0960-20` の 99f）
    const c = computeCadence(
      shot({ fireType: 'InstantBox', rateOfFire: 90, endRateOfFire: 90, maxAmmo: 9, reloadTime: 1.17 }),
    );
    expect(c.firstShotFrames).toBe(18);
    expect(c.reloadFirstShotFrames).toBe(30);
    expect(c.reloadFrames + c.reloadFirstShotFrames).toBe(99);
  });

  it('SMG 1440 rpm: 120 rounds span 292f with 65 gaps of 2f and 54 of 3f (0005-01・0005-02); next magazine after 83f (measured 83f; 098: 82.9f)', () => {
    const c = computeCadence(shot({ maxAmmo: 120, rateOfFire: 1440, endRateOfFire: 1440 }));
    expect(c.magazineFrames).toBe(292);
    expect(intervalCounts(c.shotFrames)).toEqual({ 2: 65, 3: 54 });
    // AR 1 秒（82f）より 1f 長いのは、最終弾の蓄積の余りが少なく、リロードの始まりが遅い（−0.33f）ため（V-0681）
    expect(c.reloadFrames + c.reloadFirstShotFrames).toBe(83);
  });

  it('SG 90 rpm: 39f and 40f gaps, 9 rounds span 314f (0008-01: 314・315f)', () => {
    const c = computeCadence(shot({ maxAmmo: 9, reloadTime: 1.86, rateOfFire: 90, endRateOfFire: 90 }));
    expect(c.magazineFrames).toBe(314);
    expect(intervalCounts(c.shotFrames)).toEqual({ 39: 6, 40: 2 });
    // 最終弾 → 次の 1 発目: ⌈109.41 − 0.27 + 11.9⌉ − 12 + 24 = 134f。実測 133・132f より 1〜2f 長い（109.41 − 0.27 + 11.9 = 121.04 が
    // 込め終わりの境目に乗る。V-0681 のイサベルの最終弾 → 込め終わりも 120・121f の 2 回で、読みが割れている）
    expect(c.reloadFrames + c.reloadFirstShotFrames).toBe(134);
  });

  it('SR: 82f per full-charge shot (59f charge + 23f release), reload 89f → 581f cycle (measured 577f; 001 drops frames early)', () => {
    const c = computeCadence(SR);
    expect(c.shotFrames).toEqual([0, 82, 164, 246, 328, 410]);
    // 戦闘開始の 1 発目は構え 11f（SR）+ チャージ 59f + 満ちてから撃つまで 1f − 1（C-0232）。リロードの後は 82f のまま
    expect(c.firstShotFrames).toBe(70);
    expect(c.reloadFirstShotFrames).toBe(82);
    // リロードは ⌈88.24 − 1.1 + 11.9⌉ − 11 = 89f（案 E）
    expect(c.cycleFrames).toBe(82 + 410 + 89);
  });

  it('RL: same charge cadence, reload 118f → 610f cycle (measured 610f)', () => {
    const c = computeCadence(RL);
    expect(c.cycleFrames).toBe(82 + 410 + 118);
    expect(c.triggersPerSecond).toBeCloseTo(6 / framesToGameSeconds(82 + 410 + 118), 6);
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
    // MG は毎フレーム撃つ速さで終わるので、リロードの始まりのずれは 0: ⌈147.06 + 11.9⌉ − 12 = 147（案 E）
    expect(c.reloadFrames).toBe(147);
    // 実測サイクル 563f（1 発目→次マガジン 1 発目）
    expect(Math.abs(c.cycleFrames - 563)).toBeLessThanOrEqual(5);
  });

  // 2026-09-24 の再確認（plan/design-mg-fire-rate.md）。録画 0035（エマ AI）・41（クラウン AI）の残弾表示を 1 フレームずつ読んだ、
  // 描画が軽い場面のマガジン。重い場面（描画落ち）と 3 分モードの的が狙えない区間はモデルに入れない（撮影環境の性質）
  describe('MG re-check against recordings 35 and 41 (light scenes)', () => {
    it('300 rounds span 388f, inside the measured 386–391f (0041-04)', () => {
      const c = computeCadence(MG);
      expect(c.magazineFrames).toBe(388);
      expect(c.magazineFrames).toBeGreaterThanOrEqual(386);
      expect(c.magazineFrames).toBeLessThanOrEqual(391);
    });

    it('spin-up has the measured shape and is at most 2f behind it (0035-02・0041-07; 4f before Stage 21-C3)', () => {
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

    it('last shot to the next first shot: 171f plain (measured 171–176f), 106f with クラウン S1 reload speed 44.35% (measured 105–110f)', () => {
      // Stage 24 で両方とも実測の範囲に入った（23 までは 170f・104f で、どちらも範囲の外）。全弾リロードは 1 回ごとに丸める（案 E）
      const plain = computeCadence(MG);
      expect(plain.reloadFrames + plain.reloadFirstShotFrames).toBe(171);
      const buffed = computeCadence(MG, undefined, firingParams(MG, { ...ZERO_FIRING_BUFFS, reloadSpeed: 0.4435 }));
      expect(buffed.reloadFrames + buffed.reloadFirstShotFrames).toBe(106);
    });
  });

  it('RL with 1.5 s charge: 112f per shot (89f + 23f), reload 118f → 790f cycle (measured 790f)', () => {
    const c = computeCadence(shot({ ...RL, chargeTime: 1.5, fullChargeDamage: 3.5 }));
    expect(c.shotFrames).toEqual([0, 112, 224, 336, 448, 560]);
    expect(c.cycleFrames).toBe(112 + 560 + 118);
  });

  it('charge release frames are configurable', () => {
    const f = simulateShotFrames(SR, {
      chargeReleaseFrames: 0,
      spinUpFirstShotFrames: 20,
      reloadFirstShotFrames: 22,
      reloadCompleteExtraFrames: 11.9,
      reloadCompleteToShotFrames: 12,
      upChargeReloadStartFrames: -1.1,
      aimOutFrames: 13,
      aimInFrames: 12,
      chargeFullToShotFrames: 1,
      srHideAimShorterFrames: 1,
      stanceReloadExtraFrames: 11,
      rlWindowEndShorterFrames: 1,
      hideReloadExtraFrames: 12,
      hideDetectFrames: 8,
      instantBoxAimLongerFrames: 6,
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

  it('rounds the full reload once per reload without carrying the fraction (design-reload-rounding 案 E)', () => {
    const c = computeCadence(
      shot({ maxAmmo: 9, reloadTime: 0.67, reloadBullet: 1, rateOfFire: 90, endRateOfFire: 90 }),
    );
    expect(c.reloadChunks).toBe(1);
    // ⌈39.41 − 0.27（最終弾の蓄積の余り）+ 11.9⌉ − 12 = 40
    expect(c.reloadFrames).toBe(40);
  });
});

// C-0537・C-0232: 入力が UP のチャージ武器は、ハイドしていた状態（戦闘開始・窓の明け）から構え + チャージ + 満ちてから撃つまで − 1 で撃つ。
// ラム（822、SR）: 発と発の間 82f、構えは 11f（SR）で 1 発目は 70f。フラワー（304、RL）は構え 12f で 71f。紅蓮BS は stage11ScarletBsTeam.test.ts（30f）
describe('first shot from hiding (C-0232)', () => {
  it('ラム fires the first shot 12f earlier than the interval, and after a reload at the full interval', () => {
    const ram = JSON.parse(
      readFileSync(new URL('../../data/characters/822.json', import.meta.url), 'utf8'),
    ) as CharacterData;
    const c = computeCadence(ram.shot);
    expect(c.shotFrames[1]).toBe(82);
    expect(c.firstShotFrames).toBe(70);
    expect(c.reloadFirstShotFrames).toBe(82);
  });

  it('フラワー (RL) takes the full 12f aim from hiding: 71f', () => {
    const flower = JSON.parse(
      readFileSync(new URL('../../data/characters/304.json', import.meta.url), 'utf8'),
    ) as CharacterData;
    const c = computeCadence(flower.shot);
    expect(c.shotFrames[1]).toBe(82);
    expect(c.firstShotFrames).toBe(71);
  });
});

// plan/design-reload-rounding.md 案 E（V-0681）: 全弾リロードの 1 回分は ⌈x + c + ずれ⌉ − k で、1 回ごとに丸め、端数を持ち越さない
describe('fullReloadFrames (design-reload-rounding 案 E)', () => {
  it('gives every reload the same length (no carried fraction): AR 1 s is 82f from the last shot every time', () => {
    const ar = shot({});
    const frames = shotFramesUpTo(ar, 12 + 10 * 372);
    const acrossReload = frames.flatMap((f, i) => (i > 0 && i % 60 === 0 ? [f - frames[i - 1]!] : []));
    expect(acrossReload.length).toBeGreaterThanOrEqual(9);
    expect(new Set(acrossReload)).toEqual(new Set([82]));
  });

  it('starts the reload by the remainder of the fire-rate accumulation, 0 at one shot per frame (MG)', () => {
    const ar = shot({});
    const params = firingParams(ar);
    // 720rpm（1 フレーム 0.204）で余り 0.159 なら、本当の発の時刻は 0.78f 前
    expect(reloadStartOffset(ar, DEFAULT_WEAPON_MODEL, params, 0.159, 0)).toBeCloseTo(-0.779, 3);
    expect(reloadStartOffset(MG, DEFAULT_WEAPON_MODEL, firingParams(MG), 0.504, 299)).toBe(0);
  });

  it('uses −1.1f for UP charge weapons and 0 for DOWN charge weapons, with k = release − 12 = 11', () => {
    const up = RL;
    const down = shot({ ...RL, inputType: 'DOWN_Charge' });
    const m = DEFAULT_WEAPON_MODEL;
    expect(reloadStartOffset(up, m, firingParams(up), 0, 0)).toBe(-1.1);
    expect(reloadStartOffset(down, m, firingParams(down), 0, 0)).toBe(0);
    // 2 秒（117.65f）: 入力が UP は ⌈117.65 − 1.1 + 11.9⌉ − 11 = 118、押下チャージ型は ⌈117.65 + 11.9⌉ − 11 = 119（シンデレラ 201f = 119 + 82）
    expect(fullReloadFrames(up, m, firingParams(up), -1.1)).toBe(118);
    expect(fullReloadFrames(down, m, firingParams(down), 0)).toBe(119);
    // チャージの無い武器は k = 24 − 12 = 12: ⌈117.65 + 11.9⌉ − 12 = 118
    const ar2 = shot({ reloadTime: 2 });
    expect(fullReloadFrames(ar2, m, firingParams(ar2), 0)).toBe(118);
  });
});
