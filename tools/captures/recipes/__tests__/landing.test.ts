import { describe, expect, it } from 'vitest';
import { formatAimTargetTsv, landingOf, parseAimTargetTsv, summarizeLanding, type AimTargetRow } from '../landing.ts';

const row = (patch: Partial<AimTargetRow>): AimTargetRow => ({
  frame: 0,
  aimY: 475,
  top: 306,
  bandW: 368,
  fx: 0.1,
  ...patch,
});

describe('landingOf', () => {
  it('近 A は 356〜372px、近 B は 409px 以上、間と範囲の外は決めない', () => {
    expect(landingOf(356)).toBe('A');
    expect(landingOf(372)).toBe('A');
    expect(landingOf(409)).toBe('B');
    expect(landingOf(528)).toBe('B');
    expect(landingOf(390)).toBe('決まらない');
    expect(landingOf(340)).toBe('決まらない');
    expect(landingOf(undefined)).toBe('決まらない');
  });
});

describe('summarizeLanding', () => {
  it('腕を上げた姿勢（上端の y が 250 未満）と隠れたフレーム（fx 0.45 以上）を除いて中央値を取る', () => {
    const rows = [
      row({ frame: 0, bandW: 360 }),
      row({ frame: 20, bandW: 368 }),
      row({ frame: 40, bandW: 370 }),
      row({ frame: 60, bandW: 600, top: 170 }),
      row({ frame: 80, bandW: 700, fx: 0.45 }),
      row({ frame: 100, bandW: undefined, top: undefined, fx: undefined }),
    ];
    const s = summarizeLanding(rows);
    expect(s).toMatchObject({ width: 368, used: 3, total: 6, top: 306, aimY: 475, landing: 'A' });
  });

  it('使えるフレームが無ければ幅は出ない', () => {
    expect(summarizeLanding([row({ top: 170 })]).width).toBeUndefined();
  });
});

describe('aim-target の TSV', () => {
  it('書いて読むと同じ行になる（空の欄は undefined）', () => {
    const rows = [
      row({ frame: 2860 }),
      row({ frame: 2880, aimY: undefined, top: undefined, bandW: undefined, fx: undefined }),
    ];
    expect(parseAimTargetTsv(formatAimTargetTsv(rows))).toEqual(rows);
  });
});
