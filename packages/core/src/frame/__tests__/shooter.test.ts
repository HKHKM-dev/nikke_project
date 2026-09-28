import { describe, expect, it } from 'vitest';
import { makeCharacter } from '../../__tests__/fixtures.ts';
import { computeCadence } from '../../cadence.ts';
import type { ShotParams } from '../../types.ts';
import { DEFAULT_WEAPON_MODEL } from '../../weapons.ts';
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

/** cadence.ts から作った期待列: k × cycleFrames + firstShotFrames + shotFrames[i] */
function expectedFrames(shot: ShotParams, magazines: number): number[] {
  const c = computeCadence(shot);
  const frames: number[] = [];
  for (let k = 0; k < magazines; k++)
    for (const f of c.shotFrames) frames.push(k * c.cycleFrames + c.firstShotFrames + f);
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

  // Stage 21-C3: rpm はゲーム内の時計（C-0058）、AR のリロード明けは 22f（C-0059）。SR は変わらない
  // Stage 22-A: SR の戦闘開始の 1 発目は構え解除 13f の無いぶん 69f（C-0110）。リロードの後は 82f のまま
  it('matches the absolute frames fixed in the design (AR 0…290 → 372, SR 69…479 → 651, MG 20…408 → 578)', () => {
    const ar = shotFramesUpTo(makeCharacter(fixtures.AR).shot, 400);
    expect(ar.slice(0, 3)).toEqual([0, 5, 10]);
    expect(ar[59]).toBe(290);
    expect(ar[60]).toBe(372);

    const sr = shotFramesUpTo(makeCharacter(fixtures.SR).shot, 700);
    expect(sr).toEqual([69, 151, 233, 315, 397, 479, 651]);

    const mg = shotFramesUpTo(makeCharacter(fixtures.MG).shot, 600);
    expect(mg[0]).toBe(20);
    expect(mg[299]).toBe(408);
    expect(mg[300]).toBe(578);
  });

  it('consumes the initial wait before the first shot (MG: frames 0..19 wait, 20 fires)', () => {
    const shot = makeCharacter(fixtures.MG).shot;
    const state = initialShooter(shot);
    expect(state.wait).toBe(DEFAULT_WEAPON_MODEL.spinUpFirstShotFrames);
    for (let f = 0; f < 20; f++) expect(stepShooter(state, shot), `frame ${f}`).toBe(false);
    expect(stepShooter(state, shot)).toBe(true);
    expect(state.ammo).toBe(299);
  });

  it('honours the weapon model (chargeReleaseFrames)', () => {
    const shot = makeCharacter(fixtures.SR).shot;
    const model = { ...DEFAULT_WEAPON_MODEL, chargeReleaseFrames: 0, aimOutFrames: 0 };
    expect(shotFramesUpTo(shot, 200, model)).toEqual([60, 120, 180]);
    // Stage 22-A: 構え解除（aimOutFrames）は戦闘開始の 1 発目だけを早める
    expect(shotFramesUpTo(shot, 200, { ...DEFAULT_WEAPON_MODEL, aimOutFrames: 10 })).toEqual([72, 154]);
  });

  it('rejects invalid shot params', () => {
    expect(() => initialShooter(makeCharacter({ maxAmmo: 0 }).shot)).toThrow(RangeError);
    expect(() => initialShooter(makeCharacter({ rateOfFire: 0 }).shot)).toThrow(RangeError);
  });
});
