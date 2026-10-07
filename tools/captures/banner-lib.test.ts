import { describe, expect, it } from 'vitest';
import { bannerRises, risesBeforeHits } from './banner-lib.ts';

/** f0 から、base の明るさに [フレーム, 上げ幅] の立ち上がり（4 フレームで上がりきる）を足した列 */
function series(f0: number, n: number, base: number, rises: [number, number][]): [number, number][] {
  return Array.from({ length: n }, (_, i) => {
    const f = f0 + i;
    const v = rises.reduce((a, [at, h]) => a + (f < at ? 0 : Math.min(h, ((f - at + 1) * h) / 4)), base);
    return [f, v];
  });
}

describe('bannerRises', () => {
  it('finds the first frame of each slide-in', () => {
    expect(bannerRises(series(1950, 60, 86, [[1972, 74]]))).toEqual([1972]);
  });

  it('ignores a slow drift of the background', () => {
    const drift = Array.from({ length: 60 }, (_, i): [number, number] => [1000 + i, 80 + i * 0.5]);
    expect(bannerRises(drift)).toEqual([]);
  });

  it('lists two banners that come one after another', () => {
    expect(
      bannerRises(
        series(1000, 120, 70, [
          [1020, 40],
          [1060, 40],
        ]),
      ),
    ).toEqual([1020, 1060]);
  });
});

describe('risesBeforeHits', () => {
  it('gives the distance from each rise to the hit within the window', () => {
    expect(risesBeforeHits([1972, 3149, 3500], [2070, 3248])).toEqual([
      { hit: 2070, ds: [98] },
      { hit: 3248, ds: [99] },
    ]);
  });
});
