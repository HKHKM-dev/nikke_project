import { describe, expect, it } from 'vitest';
import { countsFromValue, estimate, fbWindowK, ratio, type RecordingCounts } from './fb-window-k-lib.ts';

/** 中近だけに数のある録画（ほかの着地点は 0） */
function rec(recording: string, inCores: number, inHits: number, outCores = 0, outHits = 0): RecordingCounts {
  const value = Array.from({ length: 24 }, () => 0);
  value.splice(0, 4, inCores, inHits, outCores, outHits);
  return { recording, counts: countsFromValue(value) };
}

describe('ratio', () => {
  const a = [rec('a1', 20, 100), rec('a2', 30, 100)];
  const b = [rec('b1', 10, 100), rec('b2', 15, 100)];

  it('A のコアの数 ÷（A のヒットの数 × B の同じ着地点の率）', () => {
    // B の率 25 / 200 = 0.125、期待値 200 × 0.125 = 25
    const r = ratio(a, 'in', b, 'in');
    expect(r.value).toBeCloseTo(2, 10);
    expect(r.hits).toBe(200);
    expect(r.dropped).toBe(0);
  });

  it('2 項分布の σ は A のコアの数と B の率の両方の揺れを入れる', () => {
    // K × √(200 × 0.125 × 0.875 / 50² + 200² × 0.125 × 0.875 / 200 / 25²)
    expect(ratio(a, 'in', b, 'in').binomial).toBeCloseTo(2 * Math.sqrt(0.00875 + 0.035), 10);
  });

  it('対照に率の無い着地点のヒットは除く', () => {
    const v = Array.from({ length: 24 }, () => 0);
    v.splice(4, 2, 5, 10); // 近 A の窓の中
    const r = ratio([...a, { recording: 'a3', counts: countsFromValue(v) }], 'in', b, 'in');
    expect(r.dropped).toBe(10);
    expect(r.value).toBeCloseTo(2, 10);
  });
});

describe('estimate', () => {
  it('jackknife は A・B の録画を 1 本ずつ抜いた値のばらつき', () => {
    const e = estimate([rec('a1', 20, 100), rec('a2', 30, 100)], 'in', [rec('b1', 10, 100), rec('b2', 15, 100)], 'in');
    expect(e.leaveOneOut.map((x) => +x.toFixed(4))).toEqual([2.4, 1.6, 1.6667, 2.5]);
    const mean = (2.4 + 1.6 + 5 / 3 + 2.5) / 4;
    const jk = Math.sqrt((3 / 4) * [2.4, 1.6, 5 / 3, 2.5].reduce((s, k) => s + (k - mean) ** 2, 0));
    expect(e.jackknife).toBeCloseTo(jk, 10);
    expect(e.sigma).toBe(Math.max(e.jackknife, e.binomial));
  });
});

describe('fbWindowK', () => {
  it('K_out は窓の外どうし、R_B は B の窓の中 ÷ B の窓の外', () => {
    const r = fbWindowK([rec('a1', 20, 100, 10, 100)], [rec('b1', 10, 100, 10, 200), rec('b2', 10, 100, 10, 200)]);
    expect(r.k.value).toBeCloseTo(2, 10);
    expect(r.kOut.value).toBeCloseTo(2, 10);
    expect(r.rB.value).toBeCloseTo(2, 10);
    expect(r.rA.value).toBeCloseTo(2, 10);
  });
});
