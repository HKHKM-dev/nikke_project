import { describe, expect, it } from 'vitest';
import { PORTRAIT_MAX_H, fitPortraitHeight } from './useSlotFit.ts';

describe('fitPortraitHeight', () => {
  it('広い並びでは元の高さ（ニケ一覧の四角の絵と同じ 256/3 px）のまま', () => {
    expect(PORTRAIT_MAX_H).toBeCloseTo(85.33, 2);
    expect(fitPortraitHeight(1284, 5, 4, 4)).toBe(PORTRAIT_MAX_H);
  });
  it('幅 420px の画面（並びの幅 404px）では 5 枚が 1 段に収まる高さに縮める', () => {
    // カードの幅 (404 - 4×4) / 5 = 77.6、絵の幅（＝高さ。正方形）77.6 - 4 - 2 = 71.6 → 偶数に切り下げて 70
    const h = fitPortraitHeight(404, 5, 4, 4);
    expect(h).toBe(70);
    expect(5 * (h + 2 + 4) + 4 * 4).toBeLessThanOrEqual(404);
  });
  it('幅が足りないときは 0 より小さくしない', () => {
    expect(fitPortraitHeight(10, 5, 4, 4)).toBe(0);
  });
});
