import { describe, expect, it } from 'vitest';
import { gridValues, longGaps, readIncrement, tallyCores, type CoreGrid } from '../smg-cores.ts';

// リター（スペック固定 ON）: コアの上乗せ 1.0
const liter: CoreGrid = { body: 8714.7, core: 1, crit: 0.5, distance: 0.3, atk: [1] };
// ミランダ（宝物版 S1 の攻撃力▲）: コアの上乗せ 1.5
const miranda: CoreGrid = { body: 10781.1, core: 1.5, crit: 0.5, distance: 0.3, atk: [1, 1.5011] };

describe('gridValues', () => {
  it('コア・会心・距離ボーナス × 攻撃力▲の段の数だけ値が出る', () => {
    expect(gridValues(liter)).toHaveLength(8);
    expect(gridValues(miranda)).toHaveLength(16);
  });

  it('ミランダの格子の値は、攻撃力▲の外と中でも差 2 を超えて離れる', () => {
    const vs = gridValues(miranda)
      .map((v) => v.value)
      .sort((a, b) => a - b);
    for (let i = 1; i < vs.length; i++) expect(vs[i]! - vs[i - 1]!).toBeGreaterThan(4);
  });
});

describe('readIncrement', () => {
  const lv = gridValues(liter);

  it('前のフレームも読めた増分は 1 ヒットだけ', () => {
    // コア（距離ボーナスなし）= 胴体 2 ヒットと同じ値だが、readGap 1 なら 1 ヒットのコア
    const r = readIncrement(17429, 1, lv, 2);
    expect(r.kind).toBe('hits');
    if (r.kind === 'hits') expect(r.parts.map((p) => p.core)).toEqual([1]);
  });

  it('読めなかった後の増分で、ヒットの数かコアの数が一通りに決まらなければ落とす', () => {
    expect(readIncrement(17429, 3, lv, 2).kind).toBe('ambiguous');
  });

  it('読めなかった後の増分を 2 ヒットの和で読む', () => {
    // 距離ボーナスの胴体 2 ヒット
    const r = readIncrement(22658, 3, lv, 2);
    expect(r.kind).toBe('hits');
    if (r.kind === 'hits') expect(r.parts).toHaveLength(2);
  });

  it('格子に乗らない増分', () => {
    expect(readIncrement(10000, 1, lv, 2).kind).toBe('unfit');
  });

  it('ミランダの攻撃力▲の中のコア（2.5 倍 × 1.5011）を読む', () => {
    const r = readIncrement(Math.round(10781.1 * 1.5011 * 2.5), 1, gridValues(miranda), 2);
    expect(r.kind).toBe('hits');
    if (r.kind === 'hits') expect(r.parts[0]).toMatchObject({ core: 1, atk: 1 });
  });
});

describe('tallyCores', () => {
  const body = 8714.7;
  const row = (frame: number, increment: number, readGap = 1) => ({ frame, increment: Math.round(increment), readGap });

  it('区間ごとに頭の head ヒットを除いて数え、skip の範囲は数えない', () => {
    // 中近（距離ボーナス）に 4 ヒット（2 つ目がコア）、切れ目 f10、近に 3 ヒット（3 つ目がコア）、skip の 1 ヒット
    const rows = [
      row(1, body * 1.3),
      row(3, body * 2.3),
      row(5, body * 1.3),
      row(7, body * 2.3),
      row(12, body * 1.3),
      row(14, body * 1.3),
      row(16, body * 2.3),
      row(18, body * 2.3),
    ];
    const t = tallyCores(rows, liter, [10, 100, 200, 300, 400], 2, 2, [[18, 18]]);
    expect(t.all.midNear).toEqual({ hits: 4, cores: 2, crits: 0 });
    expect(t.window.midNear).toEqual({ hits: 2, cores: 1, crits: 0 });
    expect(t.window.near).toEqual({ hits: 1, cores: 1, crits: 0 });
    expect(t.segmentHits.slice(0, 2)).toEqual([4, 3]);
    expect(t.skipped).toBe(1);
    expect(t.distMismatch).toBe(0);
  });

  it('近で距離ボーナスの付かないヒットを数える', () => {
    const t = tallyCores([row(20, body)], liter, [10, 100, 200, 300, 400], 0, 2);
    expect(t.distMismatch).toBe(1);
  });
});

describe('longGaps', () => {
  it('100f を超える空きと、前のまとまりの増分の数', () => {
    const rows = [1, 3, 5, 200, 202].map((frame) => ({ frame, increment: 1, readGap: 1 }));
    expect(longGaps(rows)).toEqual([{ frame: 5, gap: 195, groupSize: 3 }]);
  });
});
