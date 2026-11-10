import { describe, expect, it } from 'vitest';
import { fitDual, missedShots, readDualIncrement, type DualGrid, type DualRow } from '../dual-smg-cores.ts';

const grid: DualGrid = { body: 10000, core: 1, crits: [0.5], distance: 0.3, atk: [1], muzzles: 2 };
const key = (c: { hits: number; cores: number; crits: number }) => `${c.hits}:${c.cores}:${c.crits}`;

describe('readDualIncrement', () => {
  it('会心 2 つとコア 1 つは同じ値で、両方の候補を残す', () => {
    // 距離ボーナスあり: 2 × 1.3 + 0.5 × 2 = 2 × 1.3 + 1
    const cs = readDualIncrement(36000, grid, [1], 2);
    expect(cs.map(key).sort()).toEqual(['2:0:2', '2:1:0']);
  });

  it('距離ボーナスの無い所では、コアの 1 ヒットと胴体の 2 ヒットが同じ値', () => {
    expect(readDualIncrement(20000, grid, [0], 2).map(key).sort()).toEqual(['1:1:0', '2:0:0']);
  });

  it('距離ボーナスのある所では、1 ヒットと 2 ヒットが分かれる', () => {
    expect(readDualIncrement(13000, grid, [1], 2).map(key)).toEqual(['1:0:0']);
  });

  it('クリティカルダメージ▲の版では会心 2 つとコア 1 つが分かれる', () => {
    const g = { ...grid, crits: [0.5, 1.1227] };
    const cs = readDualIncrement(10000 * (2.6 + 2 * 1.1227), g, [1], 2);
    expect(cs.map((c) => `${key(c)}:${c.crit}`)).toEqual(['2:0:2:1']);
  });

  it('格子に乗らない増分は候補が無い', () => {
    expect(readDualIncrement(12345, grid, [0, 1], 2)).toEqual([]);
  });
});

describe('fitDual', () => {
  it('決まりきらない増分の混ざった並びから、コア命中率・命中率・会心率を戻す', () => {
    // 疑似乱数（再現のため線形合同法）
    let seed = 1;
    const rand = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
    const truth = [0.08, 0.14, 0.02, 0.05, 0.14, 0.02];
    const q = [0.95, 0.97, 0.7, 0.85, 0.97, 0.7];
    const dist = [1, 1, 0, 0, 1, 0];
    const rows: DualRow[] = [];
    // 標本の中の実際のコアの割合（距離帯ごと）。最尤の値はこれに寄る
    const sample: Record<string, [number, number]> = { midNear: [0, 0], near: [0, 0], far: [0, 0], midFar: [0, 0] };
    const bands = ['midNear', 'near', 'far', 'midFar', 'near', 'far'] as const;
    for (let s = 0; s < truth.length; s++) {
      for (let n = 0; n < 5000; n++) {
        let hits = 0;
        let cores = 0;
        let crits = 0;
        for (let h = 0; h < 2; h++) {
          if (rand() >= q[s]!) continue;
          hits++;
          if (rand() < truth[s]!) cores++;
          if (rand() < 0.15) crits++;
        }
        if (hits === 0) continue;
        sample[bands[s]!]![0] += cores;
        sample[bands[s]!]![1] += hits;
        const inc = 10000 * (hits * (1 + 0.3 * dist[s]!) + cores + 0.5 * crits);
        rows.push({ segment: s, candidates: readDualIncrement(inc, grid, [dist[s]!], 2) });
      }
    }
    const fit = fitDual(rows, 2, 1);
    for (const b of ['midNear', 'near', 'far', 'midFar'] as const) {
      const [c, h] = sample[b]!;
      expect(Math.abs(fit.core[b] - c / h)).toBeLessThan(0.004);
    }
    expect(fit.hit.far).toBeCloseTo(0.7, 1);
    expect(fit.hit.near).toBeCloseTo(0.97, 1);
    expect(fit.critRate[0]).toBeCloseTo(0.15, 2);
    expect(fit.coreBySegment[1]).toBeCloseTo(0.14, 1);
    expect(fit.determined).toBeLessThan(1);
  });
});

describe('missedShots', () => {
  it('マガジンの中の空きを刻みで割り、間の発を外れた発と数える', () => {
    const rows = [0, 3, 5, 10, 12, 50].map((frame) => ({ frame, increment: 1, readGap: 1 }));
    // 0→3・3→5 は 0 発、5→10 は 1 発、10→12 は 0 発、12→50 はマガジンの外
    expect(missedShots(rows, [100, 200, 300, 400, 500], 2.5)[0]).toEqual({ missed: 1, shots: 5 });
  });
});
