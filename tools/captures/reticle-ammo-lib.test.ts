import { describe, expect, it } from 'vitest';
import {
  averageTemplates,
  clean,
  magazines,
  parseTemplateSpec,
  reloadBelowOf,
  type Reading,
} from './reticle-ammo-lib.ts';

/** [フレーム, 値] の列を読みにする */
const rs = (pairs: [number, number][]): Reading[] =>
  pairs.map(([frame, value]) => ({ frame, value, score: 1, x: 0, y: 0 }));
const values = (r: Reading[]) => r.map((x) => [x.frame, x.value]);

describe('clean', () => {
  it('drops a single frame far from both neighbours', () => {
    expect(
      values(
        clean(
          rs([
            [1, 200],
            [2, 120],
            [3, 199],
          ]),
          false,
        ),
      ),
    ).toEqual([
      [1, 200],
      [3, 199],
    ]);
  });

  it('keeps a bullet charge whose next reading stays up', () => {
    const r = rs([
      [1, 150],
      [2, 180],
      [3, 179],
    ]);
    expect(clean(r, false)).toEqual(r);
  });

  it('keeps readings when the neighbours are more than 3 frames away', () => {
    const r = rs([
      [1, 200],
      [5, 120],
      [6, 199],
    ]);
    expect(clean(r, false)).toEqual(r);
  });

  it('with box, drops a one-frame misread between equal neighbours (8 read as 9)', () => {
    const r = rs([
      [1, 8],
      [2, 9],
      [3, 8],
    ]);
    expect(values(clean(r, true))).toEqual([
      [1, 8],
      [3, 8],
    ]);
    expect(clean(r, false)).toEqual(r);
  });
});

describe('magazines', () => {
  it('starts a magazine when the full value follows a small one', () => {
    const m = magazines(
      rs([
        [0, 300],
        [10, 290],
        [20, 0],
        [40, 300],
        [50, 295],
      ]),
      300,
      reloadBelowOf(300, false),
    );
    expect(m.map((x) => [x.start, x.drops, x.zero])).toEqual([
      [0, 300, 20],
      [40, 5, undefined],
    ]);
  });

  it('counts a bullet charge as an up in the same magazine, and the value after zero', () => {
    const m = magazines(
      rs([
        [0, 300],
        [5, 0],
        [6, 10],
        [7, 9],
      ]),
      300,
      reloadBelowOf(300, false),
    );
    expect(m).toHaveLength(1);
    expect(m[0]!.ups).toEqual([{ frame: 6, from: 0, to: 10 }]);
    expect(m[0]!.afterZero).toBe(10);
    expect(m[0]!.drops).toBe(301);
  });

  it('does not take a charge that reaches the full value right away as a reload', () => {
    const m = magazines(
      rs([
        [0, 300],
        [5, 290],
        [6, 300],
        [7, 299],
      ]),
      300,
      reloadBelowOf(300, false),
    );
    expect(m).toHaveLength(1);
    expect(m[0]!.ups).toEqual([{ frame: 6, from: 290, to: 300 }]);
  });

  it('starts a magazine after a long unreadable stretch, and counts gaps over 10 frames', () => {
    const m = magazines(
      rs([
        [0, 300],
        [20, 280],
        [200, 300],
      ]),
      300,
      reloadBelowOf(300, false),
    );
    expect(m.map((x) => [x.start, x.gaps])).toEqual([
      [0, 1],
      [200, 0],
    ]);
  });

  it('with box, starts a magazine after a short reload whose 0 is not readable', () => {
    // 0 はリロード中に暗くなって読めないので、001 の次の読みが 009。リロードが速いと間は 60 フレームを切る
    const m = magazines(
      rs([
        [0, 9],
        [10, 5],
        [20, 1],
        [70, 9],
        [80, 8],
      ]),
      9,
      reloadBelowOf(9, true),
    );
    expect(m.map((x) => [x.start, x.drops, x.ups.length])).toEqual([
      [0, 8, 0],
      [70, 1, 0],
    ]);
  });

  it('with box, takes a rise to the full value from one below (8 and 9) as a misread', () => {
    const m = magazines(
      rs([
        [0, 9],
        [10, 8],
        [20, 9],
        [30, 7],
      ]),
      9,
      reloadBelowOf(9, true),
    );
    expect(m).toHaveLength(1);
  });
});

describe('parseTemplateSpec', () => {
  it('maps frames to 3-digit values', () => {
    expect(parseTemplateSpec('1081:169,1082:168')).toEqual(
      new Map([
        [1081, '169'],
        [1082, '168'],
      ]),
    );
  });

  it('rejects values that are not 3 digits', () => {
    expect(() => parseTemplateSpec('1081:16')).toThrow('frame:3 桁の値');
    expect(() => parseTemplateSpec('1081')).toThrow('frame:3 桁の値');
  });
});

describe('averageTemplates', () => {
  /** 桁 d の枠（1 画素。値は d と別の数を足したもの） */
  const cell = (v: number) => [v];
  /** 0〜9 がそろう 4 フレーム（012・345・678・900） */
  const full = [
    { frame: 1, value: '012', patches: [cell(0), cell(1), cell(2)] },
    { frame: 2, value: '345', patches: [cell(3), cell(4), cell(5)] },
    { frame: 3, value: '678', patches: [cell(6), cell(7), cell(8)] },
    { frame: 4, value: '900', patches: [cell(9), cell(0.25), cell(0.5)] },
  ];

  it('averages each digit over its cells and rounds to 0.1', () => {
    const { digits, counts } = averageTemplates(full, () => undefined);
    expect(counts['0']).toBe(3);
    expect(digits['0']).toEqual([0.3]);
    expect(digits['9']).toEqual([9]);
    expect(Object.keys(digits)).toEqual([...'0123456789']);
  });

  it('skips frames whose 3 digits were not found and reports them', () => {
    const skipped: number[] = [];
    const { counts } = averageTemplates([...full, { frame: 5, value: '111', patches: null }], (f) => skipped.push(f));
    expect(skipped).toEqual([5]);
    expect(counts['1']).toBe(1);
  });

  it('fails when a digit has no sample', () => {
    expect(() => averageTemplates(full.slice(0, 3), () => undefined)).toThrow('見本に無い数字: 9');
  });
});
