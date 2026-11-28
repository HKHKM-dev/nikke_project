// 持続の命中率▲で出し直す区間の値の使い回し（frame/plan.ts の lastValueBySlot）。枠ごとに前の値を、区間の参照と▲の和（n・up）
// が同じなら使い回す。区間を毎回写して渡し（使い回しが当たらない）、1 パス目の結果が使い回したときと同じことを確かめる。
// 区間の値（frame/landing.ts の hitRateSpanWith）が区間と▲の和のほかの入力を読むようになると、ここが落ちる
import { describe, expect, it, vi } from 'vitest';
import { fixedSlot, type FixedSlotOptions, fixedTeam, rangeEnemyWithEvents } from '../../__tests__/teamHelpers.ts';
import type { TeamInput } from '../../team.ts';
import type * as FirstPass from '../firstPass.ts';
import type { FirstPassResult } from '../firstPass.ts';
import type * as Landing from '../landing.ts';
import { planTeamRun } from '../plan.ts';

const state = vi.hoisted(() => ({
  /** 区間を写して渡す（使い回しを外す） */
  bypass: false,
  /** 1 パス目が区間の値を読んだ回数と、区間の値を出し直した回数 */
  reads: 0,
  computes: 0,
  last: null as unknown,
}));

vi.mock('../landing.ts', async (importOriginal) => {
  const original = await importOriginal<typeof Landing>();
  return {
    ...original,
    hitRateSpanWith: (...args: Parameters<typeof original.hitRateSpanWith>) => {
      state.computes += 1;
      return original.hitRateSpanWith(...args);
    },
  };
});

vi.mock('../firstPass.ts', async (importOriginal) => {
  const original = await importOriginal<typeof FirstPass>();
  return {
    ...original,
    runFirstPass: (...[slots, options]: Parameters<typeof original.runFirstPass>) => {
      const hitRateWith = options.hitRateWith;
      const result = original.runFirstPass(
        slots,
        hitRateWith === undefined
          ? options
          : {
              ...options,
              hitRateWith: (slotIndex, span, timed) => {
                state.reads += 1;
                return hitRateWith(slotIndex, state.bypass ? { ...span } : span, timed);
              },
            },
      );
      state.last = result;
      return result;
    },
  };
});

const enemy = rangeEnemyWithEvents();
const SLOT_OPTIONS: FixedSlotOptions = { condition: { coreHitRate: 0.3, distanceBonus: true }, conditionMode: 'auto' };

/** 使い回したときと外したときの 1 パス目の結果と、読んだ回数・出し直した回数 */
function run(input: TeamInput, bypass: boolean): { result: FirstPassResult; reads: number; computes: number } {
  Object.assign(state, { bypass, reads: 0, computes: 0, last: null });
  planTeamRun(input);
  return { result: state.last as FirstPassResult, reads: state.reads, computes: state.computes };
}

describe('持続の命中率▲の区間の値の使い回し（lastValueBySlot）', () => {
  it.each<[string, TeamInput]>([
    // ミサト S1 のスタックの▲（C-0183）
    ['ミサト単騎', fixedTeam([fixedSlot(833, SLOT_OPTIONS)], null, { enemy })],
    // リター（I）・デルタ（II）・アスカ（III）: バーストの▲が複数の枠に付く
    [
      'リター + デルタ + アスカ',
      fixedTeam([fixedSlot(82, SLOT_OPTIONS), fixedSlot(20, SLOT_OPTIONS), fixedSlot(830, SLOT_OPTIONS)], null, {
        enemy,
      }),
    ],
  ])('gives the same first pass with and without reuse (%s)', (_, input) => {
    const reused = run(input, false);
    const fresh = run(input, true);
    // 使い回しが当たっている（出し直しが読んだ回数より少ない）。外すと毎回出し直す
    expect(reused.reads).toBeGreaterThan(0);
    expect(reused.computes).toBeLessThan(reused.reads);
    expect(fresh.computes).toBe(fresh.reads);
    expect(fresh.reads).toBe(reused.reads);
    expect(fresh.result).toEqual(reused.result);
  });
});
