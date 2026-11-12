// 射撃姿勢維持型の武器の射撃の刻み（plan/design-fire-stance-cadence.md。V-0130、C-0149・C-0216・C-0217・C-0218）
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeCadence } from '../cadence.ts';
import { chargeShotIntervalFrames, firingParams, stanceFrames, ZERO_FIRING_BUFFS } from '../frame/firing.ts';
import {
  beginHide,
  hideShooter,
  initialShooter,
  partialChargeProgress,
  stepHide,
  stepShooter,
  unhideShooter,
} from '../frame/shooter.ts';
import { planShots } from '../frame/shots.ts';
import type { CharacterData } from '../types.ts';
import { DEFAULT_WEAPON_MODEL, isChargeWeapon } from '../weapons.ts';

const character = (id: number) =>
  JSON.parse(readFileSync(new URL(`../../data/characters/${id}.json`, import.meta.url), 'utf8')) as CharacterData;

describe('姿勢の長さと満ちてから撃つまで（設計書 3.3 節）', () => {
  it('derives ⌈S⌉ and H from maintainFireStance and uptypeFireTiming', () => {
    expect(stanceFrames(character(225).shot)).toEqual({ frames: 14, holdFrames: 1 });
    expect(stanceFrames(character(851).shot)).toEqual({ frames: 49, holdFrames: 16 });
    expect(stanceFrames(character(811).shot)).toEqual({ frames: 50, holdFrames: 24 });
    expect(stanceFrames(character(304).shot)).toBeNull();
  });
});

describe('射撃の姿勢の長さの倍率（plan/design-a2-bmode-stance.md 3.2 節）', () => {
  it('scales S before rounding: A2 in Mode B is 25f and 12f (1084-15・1124-12)', () => {
    expect(stanceFrames(character(811).shot, 0.5)).toEqual({ frames: 25, holdFrames: 12 });
    expect(stanceFrames(character(811).shot, 1)).toEqual(stanceFrames(character(811).shot));
    expect(stanceFrames(character(304).shot, 0.5)).toBeNull();
  });

  it('fires A2 in Mode B every 74f (35.88%) and 82f (23.02%) (1084-11・1124-11)', () => {
    const shot = character(811).shot;
    const interval = (chargeSpeed: number) =>
      chargeShotIntervalFrames(
        firingParams(shot, { ...ZERO_FIRING_BUFFS, chargeSpeed, fireStanceScale: 0.5 }),
        DEFAULT_WEAPON_MODEL,
      );
    expect(interval(0.3588)).toBe(74);
    expect(interval(0.2302)).toBe(82);
  });
});

describe('発と発の間・ハイドからの 1 発目・リロード', () => {
  it('fires レイヴン every 119f and 86f from hiding (0122-13・0122-14)', () => {
    const c = computeCadence(character(851).shot);
    expect(c.shotFrames).toEqual([0, 119, 238, 357, 476, 595]);
    expect(c.firstShotFrames).toBe(86);
    expect(c.reloadFirstShotFrames).toBe(119);
    // 全弾リロードは 1 回ごとに丸める（案 E）: ⌈117.65 + 11 − 1.1 + 11.9⌉ − 11 = 129。リロードを挟む間は 129 + 119 = 248f
    expect(c.reloadFrames).toBe(129);
  });

  it('fires A2 every 120f and 94f from hiding (0123-06・0123-07)', () => {
    const c = computeCadence(character(811).shot);
    expect(c.shotFrames).toEqual([0, 120, 240, 360, 480, 600]);
    expect(c.firstShotFrames).toBe(94);
    expect(c.reloadFirstShotFrames).toBe(120);
    // ⌈88.24 + 11 − 1.1 + 11.9⌉ − 11 = 100。リロードを挟む間は 220f（録画の着弾から着弾 220f。V-0681）
    expect(c.reloadFrames).toBe(100);
  });

  it('keeps 紅蓮BS at 43f, 30f from hiding and 172f across a reload (C-0149・C-0218)', () => {
    const c = computeCadence(character(225).shot);
    expect(c.shotFrames[1]).toBe(43);
    expect(c.firstShotFrames).toBe(30);
    // ⌈117.65 + 11 − 1.1 + 11.9⌉ − 11 = 129。リロードを挟む間は 129 + 43 = 172f（0046-21）
    expect(c.reloadFrames).toBe(129);
  });

  it('crosses a reload in reload + 11f + the interval (レイヴン 247〜248f)', () => {
    const frames = planShots([{ character: character(851) }], 1200)[0]!.frames;
    const gaps = frames.slice(1).map((f, i) => f - frames[i]!);
    expect(frames[0]).toBe(86);
    expect(gaps.slice(0, 5)).toEqual([119, 119, 119, 119, 119]);
    expect(gaps[5]).toBe(248);
  });
});

describe('部分チャージ（設計書 3.2 節）', () => {
  /** 1 発撃った直後から n フレーム進めた射手 */
  const afterShot = (id: number, n: number) => {
    const shot = character(id).shot;
    const params = firingParams(shot);
    const state = initialShooter(shot);
    while (!stepShooter(state, shot, DEFAULT_WEAPON_MODEL, params, false));
    for (let i = 0; i < n; i++) stepShooter(state, shot, DEFAULT_WEAPON_MODEL, params, false);
    return { state, shot, params };
  };

  it('fires at the usual time when the window starts after the charge is full, even after D (A2 H = 24。V-0701)', () => {
    // 0123・0864・0865 の 5 回目の形: 前の発の 101f 後に窓に入る（満ちたのは 96f 後）。ふだんの刻み（120f）の窓の始まりの 19f 後に
    // フルチャージで撃ち、その発の姿勢の終わり（撃ってから ⌈S⌉ − H = 26f）からハイド中のリロードを始める（設計書 11 節の案 1）
    const { state, shot, params } = afterShot(811, 100);
    const ammo = state.ammo;
    expect(beginHide(state, shot, DEFAULT_WEAPON_MODEL, params)).toBeNull();
    expect(state.hidePending).toMatchObject({ progress: 1, full: true });
    // 1 パス目と同じ順（窓の中のフレームごとに stepHide → 窓で止めた stepShooter）
    expect(stepShooter(state, shot, DEFAULT_WEAPON_MODEL, params, true)).toBe(false);
    for (let k = 1; k < 19; k++) {
      expect(stepHide(state, shot, DEFAULT_WEAPON_MODEL, params)).toBeNull();
      expect(stepShooter(state, shot, DEFAULT_WEAPON_MODEL, params, true)).toBe(false);
    }
    // D（8f）の後に撃つ
    expect(DEFAULT_WEAPON_MODEL.hideDetectFrames).toBeLessThan(19);
    expect(stepHide(state, shot, DEFAULT_WEAPON_MODEL, params)).toBe(1);
    expect(state.ammo).toBe(ammo - 1);
    expect(state.hidePending).toBeUndefined();
    expect(state.hideReload).toBe(true);
    expect(state.hideReloadStartIn).toBe(26);
  });

  it('fires on the same frame as an unblocked shooter, even when the charge time changes during the wait', () => {
    // 満ちていた枠の撃つ時刻は、待ちを窓の始まりに決めず、毎フレーム射手と同じ見方（前の発からの経過とそのフレームのチャージ時間）で
    // 決める。途中でチャージ時間が 5f 短くなっても、窓で止めない射手と同じフレームに撃つ
    const { state, shot, params } = afterShot(811, 100);
    const twin = structuredClone(state);
    const faster = { ...params, chargeFrames: params.chargeFrames - 5 };
    const paramsAt = (k: number) => (k < 3 ? params : faster);
    let twinShot = -1;
    for (let k = 0; twinShot < 0 && k < 40; k++) {
      if (stepShooter(twin, shot, DEFAULT_WEAPON_MODEL, paramsAt(k), false)) twinShot = k;
    }
    expect(twinShot).toBeGreaterThan(0);
    expect(twinShot).toBeLessThan(19);
    let windowShot = -1;
    for (let k = 0; windowShot < 0 && k < 40; k++) {
      const fired =
        k === 0
          ? beginHide(state, shot, DEFAULT_WEAPON_MODEL, paramsAt(k))
          : stepHide(state, shot, DEFAULT_WEAPON_MODEL, paramsAt(k));
      if (fired === 1) windowShot = k;
      else stepShooter(state, shot, DEFAULT_WEAPON_MODEL, paramsAt(k), true);
    }
    expect(windowShot).toBe(twinShot);
  });

  it('fires at full charge while waiting to fire after the charge is full (レイヴン H = 16)', () => {
    // 撃った後 119 − 16 = 103f で満ち、そこから撃つまでの間は p = 1
    const { state, shot, params } = afterShot(851, 110);
    expect(partialChargeProgress(state, shot, DEFAULT_WEAPON_MODEL, params)).toBe(1);
  });

  it('does not fire during the rest of the stance or the aim-in (レイヴン)', () => {
    const { state, shot, params } = afterShot(851, 40);
    expect(partialChargeProgress(state, shot, DEFAULT_WEAPON_MODEL, params)).toBeLessThanOrEqual(0);
  });

  it('scales the progress over the charge only (レイヴン)', () => {
    // 撃つまでの残り k = 118 − 74 = 44。満ちるのは k = H = 16 なので、p = (C + H − k) / C = (59 + 16 − 44) / 59
    const { state, shot, params } = afterShot(851, 74);
    expect(partialChargeProgress(state, shot, DEFAULT_WEAPON_MODEL, params)).toBeCloseTo(31 / 59, 9);
  });
});

describe('敵のジャンプの明けからの 1 発目（C-0229。V-0143）', () => {
  /** 1 発撃って 20f 後に窓に入り、200f 後に明けたときの、明けから次に撃つまでのフレーム数 */
  const fromWindowEnd = (id: number) => {
    const shot = character(id).shot;
    const params = firingParams(shot);
    const state = initialShooter(shot);
    while (!stepShooter(state, shot, DEFAULT_WEAPON_MODEL, params, false));
    for (let i = 0; i < 20; i++) stepShooter(state, shot, DEFAULT_WEAPON_MODEL, params, false);
    hideShooter(state, shot, DEFAULT_WEAPON_MODEL, params);
    for (let i = 0; i < 200; i++) stepShooter(state, shot, DEFAULT_WEAPON_MODEL, params, true);
    unhideShooter(state, shot, 200, DEFAULT_WEAPON_MODEL, params);
    let n = 0;
    while (!stepShooter(state, shot, DEFAULT_WEAPON_MODEL, params, false)) n++;
    return n;
  };

  it('fires the RL (input UP) 1f earlier than from the battle start', () => {
    expect(fromWindowEnd(851)).toBe(85); // 戦闘開始 86f
    expect(fromWindowEnd(811)).toBe(93); // 94f
    expect(fromWindowEnd(225)).toBe(29); // 30f（0046-19 の明けは 29・30f）
    expect(fromWindowEnd(304)).toBe(70); // 71f（射撃姿勢維持型でない RL も構え + チャージ + 満ちてから撃つまで − 1。C-0232）
  });

  it('leaves the SR as from the battle start (11f aim at both. C-0232)', () => {
    const ram = character(20).shot;
    expect(ram.fireType).toBe('Instant');
    expect(fromWindowEnd(20)).toBe(computeCadence(ram).firstShotFrames);
    expect(fromWindowEnd(822)).toBe(70);
  });

  it('identifies the RL by a projectile fireType (every RL and no other weapon)', () => {
    const all = readdirSync(new URL('../../data/characters/', import.meta.url))
      .filter((f) => /^\d+\.json$/.test(f))
      .map(
        (f) =>
          JSON.parse(readFileSync(new URL(`../../data/characters/${f}`, import.meta.url), 'utf8')) as CharacterData,
      );
    expect(all.length).toBeGreaterThan(200);
    // 2026-10-29 の取り込みで増えた紅蓮：神殺（472。AR）の InstantBox は飛ぶ弾ではない（弾速 0。damage.ts が未対応の注記を出す）。
    // チャージ武器でないので、入力が UP のチャージ武器を fireType で見分けるところ（weapons.ts）には掛からない
    const instantBox = all.filter((c) => c.shot.fireType === 'InstantBox');
    expect(instantBox.map((c) => c.resourceId)).toEqual([472]);
    expect(instantBox.some((c) => isChargeWeapon(c.shot))).toBe(false);
    const projectile = all.filter((c) => c.shot.fireType !== 'Instant' && c.shot.fireType !== 'InstantBox');
    expect(projectile.every((c) => c.weaponType === 'RL')).toBe(true);
    expect(projectile.length).toBe(all.filter((c) => c.weaponType === 'RL').length);
  });
});
