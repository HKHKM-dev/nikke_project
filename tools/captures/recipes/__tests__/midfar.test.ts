import { describe, expect, it } from 'vitest';
import {
  formatMidfarTsv,
  midfarLandingOf,
  midfarStart,
  parseMidfarTsv,
  quartiles,
  summarizeMidfar,
  type MidfarRow,
} from '../midfar.ts';

const row = (frame: number, patch: Partial<MidfarRow> = {}): MidfarRow => ({
  frame,
  x0: 900,
  y0: 370,
  x1: 1072,
  y1: 562,
  clipped: false,
  fx: 0.1,
  ...patch,
});

describe('midfarLandingOf', () => {
  it('580 以上が A、568〜576 が B、558〜565 が C、間と外と使えたコマが 8 未満は決めない', () => {
    expect(midfarLandingOf(584, 30)).toBe('A');
    expect(midfarLandingOf(580, 30)).toBe('A');
    expect(midfarLandingOf(576, 30)).toBe('B');
    expect(midfarLandingOf(568, 30)).toBe('B');
    expect(midfarLandingOf(565, 30)).toBe('C');
    expect(midfarLandingOf(558, 30)).toBe('C');
    expect(midfarLandingOf(567, 30)).toBe('決まらない');
    expect(midfarLandingOf(578, 30)).toBe('決まらない');
    expect(midfarLandingOf(556, 30)).toBe('決まらない');
    expect(midfarLandingOf(572, 7)).toBe('決まらない');
    expect(midfarLandingOf(undefined, 30)).toBe('決まらない');
  });
});

describe('midfarStart', () => {
  it('足元が 550〜595 のコマが 3 つ続いた最初のコマ（散発的なコマは始まりにしない）', () => {
    const rows = [
      row(5400, { y1: 534 }),
      row(5430, { y1: 588 }),
      row(5460, { y1: 534 }),
      row(5490, { y1: 594 }),
      row(5520, { y1: 562 }),
      row(5550),
      row(5580),
    ];
    expect(midfarStart(rows)).toBe(5490);
    expect(midfarStart(rows.slice(0, 4))).toBeUndefined();
  });

  it('的が取れないコマは続きを切る', () => {
    expect(midfarStart([row(0), { frame: 30 }, row(60), row(90), row(120)])).toBe(60);
  });
});

describe('quartiles', () => {
  it('線形補間', () => {
    expect(quartiles([560, 562, 562, 564])).toEqual([561.5, 562.5]);
    expect(quartiles([])).toBeUndefined();
  });
});

describe('summarizeMidfar', () => {
  it('始まりの後 150f・隠れたコマ・端に接したコマ・高さ 290px 以上のコマを除いて中央値を取る', () => {
    const rows = [
      row(6900),
      row(6930),
      row(6960),
      row(7020, { y1: 560 }),
      row(7050),
      row(7080, { y1: 564, y0: 372, x1: 1076 }),
      row(7110, { fx: 0.3 }),
      row(7140, { clipped: true }),
      row(7170, { y0: 270 }),
      row(7200, { y1: 685 }),
      { frame: 7230 },
      row(7260),
    ];
    const s = summarizeMidfar(rows);
    expect(s).toMatchObject({
      start: 6900,
      foot: 562,
      top: 370,
      height: 192,
      width: 172,
      used: 3,
      candidates: 10,
      candidatesAll: 10,
      footMode: 562,
      landing: '決まらない',
    });
  });

  it('始まりを与えればそれを使う', () => {
    const rows = Array.from({ length: 20 }, (_, i) => row(6000 + i * 30, { y1: 572 }));
    expect(summarizeMidfar(rows)).toMatchObject({ start: 6000, used: 15, landing: 'B' });
    expect(summarizeMidfar(rows, 6300)).toMatchObject({
      start: 6300,
      used: 5,
      candidates: 10,
      candidatesAll: 20,
      landing: '決まらない',
    });
  });

  it('始まりが無ければ使えたコマは 0', () => {
    expect(summarizeMidfar([row(0), row(30)])).toMatchObject({ start: undefined, used: 0, foot: undefined });
  });
});

describe('TSV', () => {
  it('書いて読むと同じ', () => {
    const rows = [row(0), { frame: 30 }, row(60, { clipped: true, fx: 0.45 })];
    expect(parseMidfarTsv(formatMidfarTsv(rows))).toEqual(rows);
  });
});
