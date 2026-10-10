import { describe, expect, it } from 'vitest';
import { makeCharacter } from '../../__tests__/fixtures.ts';
import { computeCadence } from '../../cadence.ts';
import type { ShotParams } from '../../types.ts';
import { DEFAULT_WEAPON_MODEL } from '../../weapons.ts';
import { ZERO_FIRING_BUFFS, chargeShotIntervalFrames, firingParams, type FiringParams } from '../firing.ts';
import { initialShooter, shotFramesUpTo, stepShooter } from '../shooter.ts';

const fixtures: Record<string, Partial<ShotParams>> = {
  AR: {},
  SMG: { maxAmmo: 120, rateOfFire: 1440, endRateOfFire: 1440 },
  SR: { maxAmmo: 6, reloadTime: 1.5, rateOfFire: 60, endRateOfFire: 60, chargeTime: 1, inputType: 'UP' },
  RL: { maxAmmo: 6, reloadTime: 2, rateOfFire: 60, endRateOfFire: 60, chargeTime: 1.5, inputType: 'UP' },
  MG: { maxAmmo: 300, reloadTime: 2.5, rateOfFire: 60, endRateOfFire: 3600, rateOfFireChangePerShot: 100 },
  SG: { maxAmmo: 9, reloadTime: 1.5, rateOfFire: 90, endRateOfFire: 90, shotCount: 10 },
  'SG chunked reload': { maxAmmo: 9, reloadTime: 0.6, reloadBullet: 0.34, rateOfFire: 90, endRateOfFire: 90 },
};

/**
 * cadence.ts から作った期待列: round(k × cycleFrames) + firstShotFrames + shotFrames[i]。
 * Stage 24: リロードのフレーム数は端数つきで、射手は 1 回分ごとに端数（最初は 0.5）を持ち越して切り捨てるので、k 番目のマガジンの
 * 始まりは k × 周期の四捨五入になる
 */
function expectedFrames(shot: ShotParams, magazines: number): number[] {
  const c = computeCadence(shot);
  const frames: number[] = [];
  for (let k = 0; k < magazines; k++)
    for (const f of c.shotFrames) frames.push(Math.floor(k * c.cycleFrames + 0.5 + 1e-9) + c.firstShotFrames + f);
  return frames;
}

describe('stepShooter', () => {
  describe.each(Object.entries(fixtures))('%s', (_name, partial) => {
    const shot = makeCharacter(partial).shot;

    it('fires on exactly the frames computeCadence predicts, for 3 magazines', () => {
      const expected = expectedFrames(shot, 3);
      const last = expected[expected.length - 1]!;
      expect(shotFramesUpTo(shot, last + 1)).toEqual(expected);
    });
  });

  // Stage 21-C3: rpm はゲーム内の時計（C-0058）。SR の戦闘開始の 1 発目は構え 11f + チャージ 59f + 満ちてから撃つまで 1f − 1 = 70f（C-0232）。
  // Stage 24: リロードはゲーム内の時計で端数つき（1 回目は四捨五入。AR 59f・SR 88f・MG 147f）、リロード明けは 24f（C-0148）
  it('matches the absolute frames fixed in the design (AR 12…302 → 385, SR 70…480 → 650, MG 12…400 → 571)', () => {
    // Stage 22-C: チャージの無い武器は戦闘開始から構え 12f の後に撃つ
    const ar = shotFramesUpTo(makeCharacter(fixtures.AR).shot, 400);
    expect(ar.slice(0, 3)).toEqual([12, 17, 22]);
    expect(ar[59]).toBe(302);
    expect(ar[60]).toBe(385);

    const sr = shotFramesUpTo(makeCharacter(fixtures.SR).shot, 700);
    expect(sr).toEqual([70, 152, 234, 316, 398, 480, 650]);

    const mg = shotFramesUpTo(makeCharacter(fixtures.MG).shot, 600);
    expect(mg[0]).toBe(12);
    expect(mg[299]).toBe(400);
    expect(mg[300]).toBe(571);
  });

  it('consumes the initial wait before the first shot (MG: frames 0..11 wait, 12 fires)', () => {
    const shot = makeCharacter(fixtures.MG).shot;
    const state = initialShooter(shot);
    expect(state.wait).toBe(DEFAULT_WEAPON_MODEL.aimInFrames);
    for (let f = 0; f < 12; f++) expect(stepShooter(state, shot), `frame ${f}`).toBe(false);
    expect(stepShooter(state, shot)).toBe(true);
    expect(state.ammo).toBe(299);
  });

  it('honours the weapon model (chargeReleaseFrames・aimInFrames・srHideAimShorterFrames)', () => {
    const shot = makeCharacter(fixtures.SR).shot;
    // Stage 23: 1 秒チャージは 59f（C-0140）。発と発の間は chargeReleaseFrames を足した長さ
    expect(shotFramesUpTo(shot, 200, { ...DEFAULT_WEAPON_MODEL, chargeReleaseFrames: 0 })).toEqual([70, 129, 188]);
    // ハイドからの構え（aimInFrames。SR は srHideAimShorterFrames だけ短い）は戦闘開始の 1 発目だけを動かす（C-0232）
    expect(shotFramesUpTo(shot, 200, { ...DEFAULT_WEAPON_MODEL, aimInFrames: 20 })).toEqual([78, 160]);
    expect(shotFramesUpTo(shot, 200, { ...DEFAULT_WEAPON_MODEL, srHideAimShorterFrames: 0 })).toEqual([71, 153]);
  });

  it('rejects invalid shot params', () => {
    expect(() => initialShooter(makeCharacter({ maxAmmo: 0 }).shot)).toThrow(RangeError);
    expect(() => initialShooter(makeCharacter({ rateOfFire: 0 }).shot)).toThrow(RangeError);
  });
});

describe('UP charge weapons carry the charge elapsed over a mid-charge charge speed change (C-0523)', () => {
  // アリス（1.5 秒の SR）とバーストのチャージ速度▲ 80.15%（191.json の burst の effects[0]）
  const shot = makeCharacter(fixtures.SR!).shot;
  const alice = { ...shot, chargeTime: 1.5 };
  const base = firingParams(alice);
  const buffed = firingParams(alice, { ...ZERO_FIRING_BUFFS, chargeSpeed: 0.8015 });
  const slow = chargeShotIntervalFrames(base, DEFAULT_WEAPON_MODEL);
  const fast = chargeShotIntervalFrames(buffed, DEFAULT_WEAPON_MODEL);

  /** 1 発目の後、switchAt フレーム目から after に切り替えたときの、1 発目から 2 発目までのフレーム数 */
  const secondShotAfter = (before: FiringParams, after: FiringParams, switchAt: number): number => {
    const state = initialShooter(alice, DEFAULT_WEAPON_MODEL, before);
    const fired: number[] = [];
    for (let f = 0; fired.length < 2; f++) {
      const params = fired.length === 1 && f - fired[0]! >= switchAt ? after : before;
      if (stepShooter(state, alice, DEFAULT_WEAPON_MODEL, params)) fired.push(f);
    }
    return fired[1]! - fired[0]!;
  };

  it('shortens the wait when the buff starts mid-charge', () => {
    expect(fast).toBeLessThan(slow);
    // 切り替えが無ければ、撃った時点の待ちのまま
    expect(secondShotAfter(base, buffed, 1000)).toBe(slow);
    // 経過がまだ▲の間隔に届いていない: 届いたところで撃つ
    expect(secondShotAfter(base, buffed, fast - 10)).toBe(fast);
    // 経過がもう届いている: 切り替えのフレームに撃つ（V-0403・V-0407 の 00.00 の 1f 前の発）
    expect(secondShotAfter(base, buffed, fast + 20)).toBe(fast + 20);
  });

  it('lengthens the wait when the buff ends mid-charge (same rule as C-0380, not measured for UP)', () => {
    // ▲の間隔に届く前に切れれば、基礎の間隔まで待つ
    expect(secondShotAfter(buffed, base, fast - 10)).toBe(slow);
  });
});
