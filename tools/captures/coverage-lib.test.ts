import { describe, expect, it } from 'vitest';
import {
  BG,
  CIRCLE_PX_PER_SCALE,
  TARGET,
  UNKNOWN,
  classifyWindow,
  coverageOf,
  fillUnknown,
  landingOf,
  magazinesOf,
  radialHistogram,
  shotFramesOf,
  shotIntervalOf,
  type Window,
} from './coverage-lib.ts';

/** 中心 (c, c) の窓を、is(dx, dy) が真の画素を的、ほかを背景にして作る */
function windowOf(half: number, is: (dx: number, dy: number) => boolean): Window {
  const w = 2 * half + 1;
  const labels = new Int8Array(w * w);
  for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) labels[j * w + i] = is(i - half, j - half) ? TARGET : BG;
  return { x0: 0, y0: 0, w, h: w, labels };
}

const CENTER = (half: number) => ({ x: half, y: half });

describe('coverageOf', () => {
  it('窓が全部的なら、どの s でも 1', () => {
    const half = 120;
    const win = windowOf(half, () => true);
    const c = coverageOf(
      radialHistogram(win, CENTER(half), 3 * CIRCLE_PX_PER_SCALE * 130),
      [0, 20, 75, 110, 130],
      true,
    );
    expect(c.uniform).toEqual([1, 1, 1, 1, 1]);
    for (const v of c.normal) expect(v).toBeCloseTo(1, 10);
  });

  it('照準の中心を通る半分の面（左半分）なら、約 0.5', () => {
    const half = 120;
    const win = windowOf(half, (dx) => dx < 0);
    const c = coverageOf(radialHistogram(win, { x: half - 0.5, y: half }, 110), [40, 110], true);
    for (const v of [...c.uniform, ...c.normal]) expect(v).toBeCloseTo(0.5, 2);
  });

  it('照準の中心の円の的（半径 rt）は、一様で (rt/R)²、正規で 1 − exp(−rt²/R²)', () => {
    const half = 120;
    const rt = 12;
    const win = windowOf(half, (dx, dy) => Math.hypot(dx, dy) <= rt);
    const s = 110;
    const R = CIRCLE_PX_PER_SCALE * s;
    const c = coverageOf(radialHistogram(win, CENTER(half), 3 * R), [s], true);
    expect(c.uniform[0]).toBeCloseTo((rt / R) ** 2, 2);
    expect(c.normal[0]).toBeCloseTo(1 - Math.exp(-(rt * rt) / (R * R)), 2);
  });

  it('s = 0 は、照準の中心の画素が的かどうか', () => {
    const win = windowOf(10, () => false);
    expect(coverageOf(radialHistogram(win, CENTER(10), 5), [0], true).uniform).toEqual([1]);
    expect(coverageOf(radialHistogram(win, CENTER(10), 5), [0], false).uniform).toEqual([0]);
  });
});

describe('fillUnknown', () => {
  it('的に囲まれた不明は的、背景に囲まれた不明は背景で埋まる', () => {
    const win = windowOf(10, (dx) => dx < 0);
    const w = win.w;
    win.labels[10 * w + 3] = UNKNOWN; // 左（的）側
    win.labels[10 * w + 17] = UNKNOWN; // 右（背景）側
    expect(fillUnknown(win)).toBe(2);
    expect(win.labels[10 * w + 3]).toBe(TARGET);
    expect(win.labels[10 * w + 17]).toBe(BG);
  });

  it('分かっている画素が無ければ背景にする', () => {
    const win: Window = { x0: 0, y0: 0, w: 3, h: 3, labels: new Int8Array(9).fill(UNKNOWN) };
    fillUnknown(win);
    expect([...win.labels]).toEqual(new Array(9).fill(BG));
  });
});

describe('classifyWindow', () => {
  it('背景より暗い画素は的、白は不明（膨らませる）、ほかは背景', () => {
    const W = 40;
    const H = 40;
    const frame = new Uint8Array(W * H * 3).fill(150);
    const bg = new Uint8Array(W * H * 3).fill(150);
    const set = (x: number, y: number, v: [number, number, number]) => frame.set(v, (y * W + x) * 3);
    set(20, 20, [60, 60, 60]); // 暗い = 的
    set(10, 10, [250, 250, 250]); // 白 = 不明
    const tint = [0, 1, 2].map(() => ({ a: 1, b: 0 }));
    const win = classifyWindow(frame, W, bg, { y0: 0, y1: H }, tint, { x: 20, y: 20 }, 15, {
      dark: 22,
      overlayDilate: 1,
      openTarget: 0,
    });
    const at = (x: number, y: number) => win.labels[(y - win.y0) * win.w + (x - win.x0)];
    expect(at(20, 20)).toBe(TARGET);
    expect(at(10, 10)).toBe(UNKNOWN);
    expect(at(11, 11)).toBe(UNKNOWN);
    expect(at(30, 30)).toBe(BG);
  });
});

describe('発のフレーム', () => {
  it('空きでまとまりに分け、間隔を 120 発ぶんの長さから出す', () => {
    const a = Array.from({ length: 120 }, (_, k) => 100 + k * 2.45);
    const b = Array.from({ length: 120 }, (_, k) => 600 + k * 2.45);
    const frames = [...a, ...b].map(Math.round).filter((_, k) => k % 3 !== 1);
    const mags = magazinesOf(frames, 40);
    expect(mags.length).toBe(2);
    const interval = shotIntervalOf(mags, 120, 1440);
    expect(interval).toBeCloseTo(2.45, 2);
    const shots = shotFramesOf(mags, interval);
    expect(shots.filter((s) => s.magazine === 0).length).toBe(120);
    expect(shots[0]).toEqual({ frame: 100, magazine: 0 });
  });
});

describe('landingOf', () => {
  const cfg = { nearBMinWidth: 390, midFarFootY: { midFarA: 584, midFarB: 571, midFarC: 561 } };
  it('近は照準の高さの幅、中遠は足元の y で分ける', () => {
    expect(landingOf('near', { bandW: 365, footY: NaN }, cfg)).toBe('nearA');
    expect(landingOf('near', { bandW: 430, footY: NaN }, cfg)).toBe('nearB');
    expect(landingOf('midFar', { bandW: 0, footY: 583 }, cfg)).toBe('midFarA');
    expect(landingOf('midFar', { bandW: 0, footY: 562 }, cfg)).toBe('midFarC');
    expect(landingOf('far', { bandW: 0, footY: 0 }, cfg)).toBe('far');
  });
});
