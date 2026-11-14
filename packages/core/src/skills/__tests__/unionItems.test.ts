// 同一効果の件の和集合（unionItems）。始まりごとの維持（同じ状態の維持の違う付与。plan/design-rosanna.md 2 節）も見る
import { describe, expect, it } from 'vitest';
import { unionItems } from '../timeline.ts';

describe('unionItems', () => {
  it('merges overlapping windows of one duration, cut at the battle end', () => {
    expect(unionItems([0, 50, 200], 100, 250)).toEqual([
      [0, 150],
      [200, 250],
    ]);
    expect(unionItems([0], 0, 250)).toEqual([]);
  });

  it('opens each start with its own duration, and a shorter one inside a longer window does not shorten it', () => {
    // 0 は 300f（表）、100 は既定の 600f、650 は 30f で 100 の窓の中（短くならない）、800 は窓の外で 300f
    const durations = new Map([
      [0, 300],
      [650, 30],
      [800, 300],
    ]);
    expect(unionItems([0, 100, 650], 600, 2000, durations)).toEqual([[0, 700]]);
    expect(unionItems([0, 1000, 1500], 600, 2000, new Map([[1500, 100]]))).toEqual([
      [0, 600],
      [1000, 1600],
    ]);
    expect(unionItems([800], 600, 2000, durations)).toEqual([[800, 1100]]);
  });
});
