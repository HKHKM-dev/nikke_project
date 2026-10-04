// 射撃姿勢維持型の武器の射撃の刻み（plan/design-fire-stance-cadence.md。V-0130、C-0149・C-0216・C-0217・C-0218）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeCadence } from '../cadence.ts';
import { firingParams, stanceFrames } from '../frame/firing.ts';
import { initialShooter, partialChargeShot, stepShooter } from '../frame/shooter.ts';
import { planShots } from '../frame/shots.ts';
import type { CharacterData } from '../types.ts';
import { DEFAULT_WEAPON_MODEL } from '../weapons.ts';

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

describe('発と発の間・ハイドからの 1 発目・リロード', () => {
  it('fires レイヴン every 119f and 86f from hiding (122-13・122-14)', () => {
    const c = computeCadence(character(851).shot);
    expect(c.shotFrames).toEqual([0, 119, 238, 357, 476, 595]);
    expect(c.firstShotFrames).toBe(86);
    expect(c.reloadFirstShotFrames).toBe(119);
    expect(c.reloadFrames).toBeCloseTo(2 / 0.017 + 11, 9);
  });

  it('fires A2 every 120f and 94f from hiding (123-06・123-07)', () => {
    const c = computeCadence(character(811).shot);
    expect(c.shotFrames).toEqual([0, 120, 240, 360, 480, 600]);
    expect(c.firstShotFrames).toBe(94);
    expect(c.reloadFirstShotFrames).toBe(120);
    expect(c.reloadFrames).toBeCloseTo(1.5 / 0.017 + 11, 9);
  });

  it('keeps 紅蓮BS at 43f, 30f from hiding and 172f across a reload (C-0149・C-0218)', () => {
    const c = computeCadence(character(225).shot);
    expect(c.shotFrames[1]).toBe(43);
    expect(c.firstShotFrames).toBe(30);
    expect(c.reloadFrames).toBeCloseTo(2 / 0.017 + 11, 9);
  });

  it('crosses a reload in reload + 11f + the interval (レイヴン 247〜248f)', () => {
    const frames = planShots([{ character: character(851) }], 1200)[0]!.frames;
    const gaps = frames.slice(1).map((f, i) => f - frames[i]!);
    expect(frames[0]).toBe(86);
    expect(gaps.slice(0, 5)).toEqual([119, 119, 119, 119, 119]);
    expect([247, 248]).toContain(gaps[5]);
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

  it('fires at full charge while waiting to fire after the charge is full (レイヴン H = 16)', () => {
    // 撃った後 119 − 16 = 103f で満ち、そこから撃つまでの間は p = 1
    const { state, shot, params } = afterShot(851, 110);
    expect(partialChargeShot(state, shot, DEFAULT_WEAPON_MODEL, params)).toBe(1);
  });

  it('does not fire during the rest of the stance or the aim-in (レイヴン)', () => {
    const { state, shot, params } = afterShot(851, 40);
    expect(partialChargeShot(state, shot, DEFAULT_WEAPON_MODEL, params)).toBeNull();
  });

  it('scales the progress over the charge only (レイヴン)', () => {
    // 撃つまでの残り k = 118 − 74 = 44。満ちるのは k = H = 16 なので、p = (C + H − k) / C = (59 + 16 − 44) / 59
    const { state, shot, params } = afterShot(851, 74);
    expect(partialChargeShot(state, shot, DEFAULT_WEAPON_MODEL, params)).toBeCloseTo(31 / 59, 9);
  });
});
