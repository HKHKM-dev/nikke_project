// 指標 windowNthHealTargets（V-0797）: 枠の HP の割合が 1 未満の窓ごとの、窓の中で n 回目の回復の対象の枠
import { describe, expect, it } from 'vitest';
import type { SimResult } from '../../sim/engine.ts';
import { METRICS } from '../observations/metrics/index.ts';
import type { TeamInput } from '../../team.ts';

const metric = METRICS.windowNthHealTargets!;
const input = {} as TeamInput;
// 割合 1 → 0.8（窓 1）→ 0.7 → 0.75（上下しても窓 1 のまま）→ 1（窓の外）→ 0.8（窓 2）→ 1
const hpRatios = [{ frames: [0, 100, 200, 300, 400, 500, 600], ratios: [1, 0.8, 0.7, 0.75, 1, 0.8, 1] }];
const fake = (heals: { frame: number; slotIndex: number; sourceSlotIndex?: number }[]) =>
  ({ history: { hpRatios, heals: heals.map((h) => ({ sourceSlotIndex: 0, ...h })) } }) as unknown as SimResult;
const heals = [
  { frame: 50, slotIndex: 3 }, // 窓の外
  { frame: 150, slotIndex: 0 },
  { frame: 250, slotIndex: 1 },
  { frame: 260, slotIndex: 4, sourceSlotIndex: 2 }, // ほかの枠の回復
  { frame: 350, slotIndex: 2 },
  { frame: 450, slotIndex: 3 }, // 窓の外
  { frame: 550, slotIndex: 0 },
];
const run = (args: Record<string, number>, h = heals) =>
  metric.sim(fake(h), { args: { slot: 1, windowSlot: 1, ...args }, input });

describe('windowNthHealTargets', () => {
  it('takes the n-th heal of each window, keeping one window while the ratio stays below full', () => {
    expect(run({ n: 0 })).toEqual([1, 1]);
    expect(run({ n: 1 })).toEqual([2]);
    expect(run({ n: 2 })).toEqual([3]);
    expect(run({ n: 3 })).toEqual([]);
    expect(metric.occurrences!(fake(heals), { args: { slot: 1, windowSlot: 1, n: 0 }, input })).toBe(2);
  });

  it('counts heals on the same frame once, and refuses when that heal has two targets', () => {
    const twin = [...heals, { frame: 150, slotIndex: 2 }];
    expect(run({ n: 1 }, twin)).toEqual([2]);
    expect(() => run({ n: 0 }, twin)).toThrow('対象が 2 機以上');
  });

  it('cuts with skip and count, and refuses when too few', () => {
    expect(run({ n: 0, skip: 1, count: 1 })).toEqual([1]);
    expect(() => run({ n: 1, count: 2 })).toThrow('2 回目の回復の来た窓');
  });
});
