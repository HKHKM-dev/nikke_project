// Stage 10: 射手の射撃に効くバフと、1 回分ずつの分割リロード（plan/design-stage10.md 3 節・8.2 節）。
// 退化（基礎値で Stage 9 と 1 フレームも変わらない）は、Stage 9 の stepShooter をこのファイルに凍結した写しと全 202 体で比べる。
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { makeCharacter } from '../../__tests__/fixtures.ts';
import {
  computeCadence,
  firstShotFrames as stage9FirstShotFrames,
  rateAfterShots,
  reloadChunks,
} from '../../cadence.ts';
import type { CharacterData, ShotParams } from '../../types.ts';
import { DEFAULT_WEAPON_MODEL, MAX_RPM, isChargeWeapon, secondsToFrames, type WeaponModel } from '../../weapons.ts';
import {
  ZERO_FIRING_BUFFS,
  effectiveMaxAmmo,
  firingParams,
  measuredChargeCadence,
  type FiringBuffs,
} from '../firing.ts';
import { initialShooter, refillAmmo, shotFramesUpTo, stepShooter } from '../shooter.ts';

const CHARACTERS_DIR = new URL('../../../data/characters/', import.meta.url);
const characters: CharacterData[] = readdirSync(CHARACTERS_DIR)
  .filter((f) => /^\d+\.json$/.test(f))
  .map((f) => JSON.parse(readFileSync(new URL(f, CHARACTERS_DIR), 'utf8')) as CharacterData);

/** Stage 9 の stepShooter の写し（リロードを「回数 × 時間」の 1 つの待ちにしていた版）。退化の基準として凍結する */
function stage9ShotFrames(shot: ShotParams, frames: number, model: WeaponModel = DEFAULT_WEAPON_MODEL): number[] {
  const state = {
    ammo: shot.maxAmmo,
    shotsInMagazine: 0,
    wait: stage9FirstShotFrames(shot, model),
    acc: 0,
    reloading: false,
  };
  const fired: number[] = [];
  for (let f = 0; f < frames; f++) {
    if (state.wait > 0) {
      state.wait -= 1;
      continue;
    }
    if (state.reloading) {
      state.reloading = false;
      state.ammo = shot.maxAmmo;
      state.shotsInMagazine = 0;
      state.acc = 0;
    }
    const charge = isChargeWeapon(shot);
    if (state.shotsInMagazine > 0 && !charge) {
      state.acc += rateAfterShots(shot, state.shotsInMagazine) / MAX_RPM;
      if (state.acc < 1) continue;
      state.acc -= 1;
    }
    state.shotsInMagazine += 1;
    state.ammo -= 1;
    fired.push(f);
    if (state.ammo <= 0) {
      state.reloading = true;
      const reloadFrames = secondsToFrames(shot.reloadTime) * reloadChunks(shot);
      state.wait = Math.max(0, reloadFrames + stage9FirstShotFrames(shot, model) - 1);
    } else if (charge) {
      state.wait = Math.max(0, secondsToFrames(shot.chargeTime) + model.chargeReleaseFrames - 1);
    }
  }
  return fired;
}

/** バフを 1 つのフレーム範囲だけ掛けて回す。ammo の推移も返す */
function runWithWindow(
  shot: ShotParams,
  frames: number,
  window: { start: number; end: number; buffs: FiringBuffs },
): { fired: number[]; ammo: number[]; lastShots: number[] } {
  const base = firingParams(shot);
  const buffed = firingParams(shot, window.buffs);
  const state = initialShooter(shot, DEFAULT_WEAPON_MODEL, window.start <= 0 && 0 < window.end ? buffed : base);
  const fired: number[] = [];
  const ammo: number[] = [];
  const lastShots: number[] = [];
  for (let f = 0; f < frames; f++) {
    const params = window.start <= f && f < window.end ? buffed : base;
    if (stepShooter(state, shot, DEFAULT_WEAPON_MODEL, params)) {
      fired.push(f);
      if (state.lastShot) lastShots.push(f);
    }
    ammo.push(state.ammo);
  }
  return { fired, ammo, lastShots };
}

/** 連続する同じ値をまとめた列（弾数表示の読み取りと比べる） */
function distinct(values: readonly number[]): number[] {
  return values.filter((v, i) => i === 0 || v !== values[i - 1]);
}

const DRAKE: Partial<ShotParams> = {
  maxAmmo: 9,
  reloadTime: 0.5,
  reloadBullet: 0.33,
  rateOfFire: 90,
  endRateOfFire: 90,
  shotCount: 10,
};

describe('stage 10 shooter: degeneration (8.2)', () => {
  it('loads all 202 characters', () => {
    expect(characters.length).toBe(202);
  });

  it('fires on exactly the Stage 9 frames for all 202 characters over 180 s (base params)', () => {
    const mismatched: number[] = [];
    for (const c of characters) {
      const expected = stage9ShotFrames(c.shot, 10_800);
      const actual = shotFramesUpTo(c.shot, 10_800);
      if (actual.length !== expected.length || actual.some((f, i) => f !== expected[i])) mismatched.push(c.resourceId);
    }
    // Stage 11 紅蓮BS: 射撃の刻みを実測で較正した武器（MEASURED_CHARGE_CADENCE）だけは Stage 9 と違う（意図した差分）
    const calibrated = characters.filter((c) => measuredChargeCadence(c.shot) !== null).map((c) => c.resourceId);
    expect(calibrated).toEqual([225]);
    expect(mismatched).toEqual(calibrated);
  });

  it('includes the chunked-reload weapons (reloadBullet < 1), which match too', () => {
    const chunked = characters.filter((c) => c.shot.reloadBullet < 1);
    expect(chunked.length).toBe(15);
    for (const c of chunked) {
      expect(shotFramesUpTo(c.shot, 10_800), `${c.resourceId}`).toEqual(stage9ShotFrames(c.shot, 10_800));
    }
  });

  it('matches computeCadence with base params passed explicitly', () => {
    for (const c of characters.slice(0, 40)) {
      expect(computeCadence(c.shot, DEFAULT_WEAPON_MODEL, firingParams(c.shot, ZERO_FIRING_BUFFS))).toEqual(
        computeCadence(c.shot),
      );
    }
  });
});

describe('stage 10 shooter: firing buffs (8.2)', () => {
  it('computes the effective max ammo additively (recording 37: 9 × (1 + 0.7218 + 0.5014) = 20)', () => {
    expect(effectiveMaxAmmo(9, { ...ZERO_FIRING_BUFFS, maxAmmoRatio: 0.7218 + 0.5014 })).toBe(20);
    expect(effectiveMaxAmmo(9, { ...ZERO_FIRING_BUFFS, maxAmmoFlat: 5 })).toBe(14);
    expect(effectiveMaxAmmo(120, { ...ZERO_FIRING_BUFFS, maxAmmoRatio: 0.4517 })).toBe(174);
    // 録画 39: デルタ 6 × 1.4517 = 8.71 → 9（四捨五入）、ドレイク 9 × 2.6749 = 24.07 → 24
    expect(effectiveMaxAmmo(6, { ...ZERO_FIRING_BUFFS, maxAmmoRatio: 0.4517 })).toBe(9);
    expect(effectiveMaxAmmo(9, { ...ZERO_FIRING_BUFFS, maxAmmoRatio: 0.4517 + 0.7218 + 0.5014 })).toBe(24);
  });

  it('reproduces recording 37: a max-ammo buff mid-reload keeps loading to the new max (3 → 10 → 17 → 20)', () => {
    const shot = makeCharacter(DRAKE).shot;
    // 1 マガジン目の最終弾（9 発目）は 320f。1 回目の 1 回分（+3）を込めた後（f350 の次の f351 以降）から最大 20 にする
    const base = shotFramesUpTo(shot, 400);
    expect(base[8]).toBe(320);
    const run = runWithWindow(shot, 700, {
      start: 352,
      end: 10_000,
      buffs: { ...ZERO_FIRING_BUFFS, maxAmmoRatio: 0.7218 + 0.5014 },
    });
    // 満タンになったフレームにそのまま 1 発目を撃つので、フレーム末の残弾は 20 ではなく 19 になる
    expect(distinct(run.ammo.slice(320, 460))).toEqual([0, 3, 10, 17, 19]);
    // 1 回分は 30f ずつ（0.5 秒）: 最終弾 L = 320 から 350・380・410・440 に込め、440 で満タン → 同じフレームに 1 発目
    // （基礎値なら 350・380・410 で 9 になり 410 に撃つ = Stage 9 の L + 30 × 3 + 0）
    expect(run.ammo[349]).toBe(0);
    expect(run.ammo[350]).toBe(3);
    expect(run.ammo[380]).toBe(10);
    expect(run.ammo[410]).toBe(17);
    expect(run.fired).toContain(440);
  });

  it('reproduces recording 19: a reload started at max 14 finishes at max 9 once the buff ends (0 → 5 → 8 → 9)', () => {
    const shot = makeCharacter(DRAKE).shot; // 装弾数 9・0.33 の SG（ノワールと同じ形）
    const buffs = { ...ZERO_FIRING_BUFFS, maxAmmoFlat: 5 };
    // 最大 14 で撃ち切る → 1 回目（+5）の直後にバフが切れる
    const withBuff = runWithWindow(shot, 1_200, { start: 0, end: 10_000, buffs });
    const lastOfFirst = withBuff.fired[13]!;
    const run = runWithWindow(shot, 1_200, { start: 0, end: lastOfFirst + 31 + 1, buffs });
    // 1 回分は +30f ごと。最大 14 の 1 回分 5 → バフが切れて最大 9 の 1 回分 3 → 残り 1 発分で 9（満タン）→ 同じフレームに撃って 8
    expect(run.ammo[lastOfFirst + 29]).toBe(0);
    expect(run.ammo[lastOfFirst + 30]).toBe(5);
    expect(run.ammo[lastOfFirst + 60]).toBe(8);
    expect(run.fired).toContain(lastOfFirst + 90);
    expect(run.ammo[lastOfFirst + 90]).toBe(8);
    expect(run.fired.filter((f) => f > lastOfFirst + 90 && f <= lastOfFirst + 90 + 40 * 8)).toHaveLength(8); // 9 発のマガジン
  });

  it('does not add current ammo when the max rises, and clamps it when the max falls', () => {
    const shot = makeCharacter(DRAKE).shot;
    const run = runWithWindow(shot, 200, { start: 50, end: 150, buffs: { ...ZERO_FIRING_BUFFS, maxAmmoFlat: 5 } });
    // f0 で 1 発撃って 8、f40 で 7。f50 に最大 14 になっても残弾は 7 のまま
    expect(run.ammo[49]).toBe(7);
    expect(run.ammo[50]).toBe(7);
    // 残弾が 9 を超えることはない（満タンからのバフでも増えない）ので削りは別に確かめる
    const state = initialShooter(
      shot,
      DEFAULT_WEAPON_MODEL,
      firingParams(shot, { ...ZERO_FIRING_BUFFS, maxAmmoFlat: 5 }),
    );
    expect(state.ammo).toBe(14);
    stepShooter(state, shot, DEFAULT_WEAPON_MODEL, firingParams(shot)); // f0 に撃つ前に最大 9 へ削る
    expect(state.ammo).toBe(8);
  });

  it('marks only the shot that empties the magazine as the last bullet, and a longer magazine delays it', () => {
    const shot = makeCharacter(DRAKE).shot;
    const base = runWithWindow(shot, 1_000, { start: 0, end: 0, buffs: ZERO_FIRING_BUFFS });
    expect(base.lastShots.length).toBeGreaterThan(1);
    for (const f of base.lastShots) expect(base.fired.indexOf(f) % 9).toBe(8);
    const buffed = runWithWindow(shot, 1_000, {
      start: 0,
      end: 10_000,
      buffs: { ...ZERO_FIRING_BUFFS, maxAmmoFlat: 5 },
    });
    expect(buffed.lastShots[0]).toBe(buffed.fired[13]);
    expect(buffed.lastShots[0]!).toBeGreaterThan(base.lastShots[0]!);
  });

  it('scales one reload chunk by (1 − reloadSpeed) and the charge by (1 − chargeSpeed) (provisional)', () => {
    const sr = makeCharacter({
      maxAmmo: 6,
      reloadTime: 2,
      rateOfFire: 60,
      endRateOfFire: 60,
      chargeTime: 1,
      inputType: 'UP',
    }).shot;
    expect(firingParams(sr, { ...ZERO_FIRING_BUFFS, reloadSpeed: 0.5091 }).reloadChunkFrames).toBe(59);
    expect(firingParams(sr, { ...ZERO_FIRING_BUFFS, chargeSpeed: 0.0897 }).chargeFrames).toBe(55);
    // 100% 以上は 0 フレーム。チャージ武器は解放遅延 22f だけ残る
    expect(firingParams(sr, { ...ZERO_FIRING_BUFFS, reloadSpeed: 1.2 }).reloadChunkFrames).toBe(0);
    const instant = firingParams(sr, { ...ZERO_FIRING_BUFFS, chargeSpeed: 1 });
    expect(instant.chargeFrames).toBe(0);
    const state = initialShooter(sr, DEFAULT_WEAPON_MODEL, instant);
    const fired: number[] = [];
    for (let f = 0; f < 100; f++) if (stepShooter(state, sr, DEFAULT_WEAPON_MODEL, instant)) fired.push(f);
    expect(fired.slice(0, 3)).toEqual([22, 44, 66]);
  });

  it('with a 0-frame reload chunk, the next magazine fires no earlier than the frame after the last shot', () => {
    const ar = makeCharacter({ maxAmmo: 3, reloadTime: 1, rateOfFire: 720, endRateOfFire: 720 }).shot;
    const params = firingParams(ar, { ...ZERO_FIRING_BUFFS, reloadSpeed: 1 });
    const state = initialShooter(ar, DEFAULT_WEAPON_MODEL, params);
    const fired: number[] = [];
    for (let f = 0; f < 20; f++) if (stepShooter(state, ar, DEFAULT_WEAPON_MODEL, params)) fired.push(f);
    // 0・5・10 で撃ち切り、11 に次のマガジンの 1 発目（Stage 9 の Math.max(0, 0 + 0 − 1) = 0 と同じ）
    expect(fired).toEqual([0, 5, 10, 11, 16]);
  });

  it('refills ammo up to the max, and finishes a reload if the refill fills the magazine', () => {
    const shot = makeCharacter(DRAKE).shot;
    const state = initialShooter(shot);
    for (let f = 0; f <= 40; f++) stepShooter(state, shot); // f0・f40 に撃って 7
    expect(state.ammo).toBe(7);
    refillAmmo(state, 5, shot);
    expect(state.ammo).toBe(9);

    const reloading = initialShooter(shot);
    while (reloading.phase !== 'reloading') stepShooter(reloading, shot, DEFAULT_WEAPON_MODEL);
    refillAmmo(reloading, 9, shot);
    expect(reloading.phase).toBe('priming');
    expect(stepShooter(reloading, shot)).toBe(true); // SG は 1 発目の遅延 0 → 次のフレームに撃つ
  });
});
