import { describe, expect, it } from 'vitest';
import { compareCombatPower, sortByCombatPower } from './combat-power-lib.ts';

describe('compareCombatPower', () => {
  it('counts matches, inversions and ties in the actual values', () => {
    const result = compareCombatPower([
      { id: 1, model: 300, actual: 300 },
      { id: 2, model: 250, actual: 200 }, // 値は違うが、並びは合う
      { id: 3, model: 260, actual: 260 },
      { id: 4, model: 100, actual: 100 },
      { id: 5, model: 100, actual: 100 }, // 4 とゲームの値が同じ（数えない）
    ]);
    expect(result.matched).toBe(4);
    expect(result.mismatched.map((r) => r.id)).toEqual([2]);
    expect(result.inversions).toBe(0);
    expect(result.actualTies).toBe(1);
  });

  it('counts a pair whose model order is reversed, equal or missing as an inversion', () => {
    const result = compareCombatPower([
      { id: 1, model: 100, actual: 300 },
      { id: 2, model: 200, actual: 200 }, // 1 と逆
      { id: 3, model: 200, actual: 100 }, // 2 と同じ値
      { id: 4, model: null, actual: 50 }, // 出せない体はどの組でも食い違い
    ]);
    expect(result.inversions).toBe(2 + 1 + 3);
  });
});

describe('sortByCombatPower', () => {
  it('sorts in descending order, ties by id, missing values last', () => {
    const rows = [
      { id: 3, v: 10 },
      { id: 1, v: null },
      { id: 2, v: 10 },
      { id: 4, v: 20 },
    ];
    expect(sortByCombatPower(rows, (r) => r.v).map((r) => r.id)).toEqual([4, 2, 3, 1]);
  });
});
