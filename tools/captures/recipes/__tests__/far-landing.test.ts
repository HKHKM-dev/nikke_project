import { describe, expect, it } from 'vitest';
import { farLandingOf, isFarFrame, summarizeFar } from '../far-landing.ts';
import type { MidfarRow } from '../midfar.ts';

const row = (frame: number, patch: Partial<MidfarRow> = {}): MidfarRow => ({
  frame,
  x0: 900,
  y0: 386,
  x1: 1014,
  y1: 534,
  clipped: false,
  fx: 0.1,
  ...patch,
});

describe('farLandingOf', () => {
  it('540 以上が遠 A、536 以下が遠 B、537〜539 は間、使えたコマが 8 未満は決めない', () => {
    expect(farLandingOf(542, 20)).toBe('A');
    expect(farLandingOf(540, 20)).toBe('A');
    expect(farLandingOf(538, 20)).toBe('間');
    expect(farLandingOf(536, 20)).toBe('B');
    expect(farLandingOf(534, 20)).toBe('B');
    expect(farLandingOf(542, 7)).toBe('決まらない');
    expect(farLandingOf(undefined, 20)).toBe('決まらない');
  });
});

describe('isFarFrame', () => {
  it('V-0228「読み方」の 3 の選び方（端に接しない・fx 0.3 未満・高さ 110〜190・幅 80〜170・足元 515〜552）', () => {
    expect(isFarFrame(row(0))).toBe(true);
    expect(isFarFrame(row(0, { clipped: true }))).toBe(false);
    expect(isFarFrame(row(0, { fx: 0.3 }))).toBe(false);
    expect(isFarFrame(row(0, { y0: 300 }))).toBe(false); // 高さ 234
    expect(isFarFrame(row(0, { x1: 1100 }))).toBe(false); // 幅 200
    expect(isFarFrame(row(0, { y0: 420, y1: 561 }))).toBe(false); // 中遠 C の足元
    expect(isFarFrame({ frame: 0 })).toBe(false);
  });
});

describe('summarizeFar', () => {
  it('使えたコマの中央値で足元を出し、着地点を決める', () => {
    const rows = [
      ...Array.from({ length: 9 }, (_, i) => row(i * 30, { y0: 388, y1: 542 })),
      row(300, { fx: 0.5 }),
      { frame: 330 },
    ];
    const s = summarizeFar(rows);
    expect(s).toMatchObject({ foot: 542, top: 388, height: 154, width: 114, used: 9, measured: 11, landing: 'A' });
  });
});
