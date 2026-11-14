import { describe, expect, it } from 'vitest';
import { PANEL_CROP, PANEL_DETECT, isPanel, measurePanel, runsOf, scaleCrop, tailOffset } from './probe-result-lib.ts';

/** PANEL_DETECT の大きさの画。暗幕・白いカード・青いヘッダー */
function panelFrame({ header = true, card = 230, outside = 15 } = {}) {
  const { w, h } = PANEL_DETECT;
  const buf = new Uint8Array(w * h * 3).fill(outside);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      if (x >= 24 && x < 41 && y >= 8 && y < 31) buf.fill(card, i, i + 3);
      if (header && x >= 23 && x < 42 && y >= 1 && y < 7) buf.set([30, 110, 230], i);
    }
  return buf;
}

describe('一時停止・戦闘履歴のパネルの検出', () => {
  it('暗幕と青いヘッダーの AND', () => {
    expect(isPanel(measurePanel(panelFrame()))).toBe(true);
    expect(isPanel(measurePanel(panelFrame({ header: false })))).toBe(false);
    expect(isPanel(measurePanel(panelFrame({ outside: 200 })))).toBe(false);
  });
});

describe('runsOf', () => {
  it('立ったサンプルを連続したものどうしでまとめる', () => {
    const s = [0, 1, 1, 0, 1, 0, 1, 1].map((v, i) => ({ frame: i * 3, v }));
    expect(runsOf(s, (x) => x.v === 1)).toEqual([
      { from: 3, to: 6 },
      { from: 12, to: 12 },
      { from: 18, to: 21 },
    ]);
  });
});

describe('切り出しの位置', () => {
  it('ほかの大きさの録画は比で直す', () => {
    expect(scaleCrop(PANEL_CROP, 2560, 1440)).toEqual({ x: 853, y: 53, w: 880, h: 1320 });
    expect(scaleCrop(PANEL_CROP, 1920, 1080)).toEqual(PANEL_CROP);
  });
});

describe('tailOffset', () => {
  it('numbers the tail scan from the head of the recording, or gives up', () => {
    expect(tailOffset(10_000, 900)).toBe(9_100);
    expect(tailOffset(600, 600)).toBe(0);
    expect(tailOffset(0, 900)).toBeNull();
    expect(tailOffset(500, 900)).toBeNull();
    expect(tailOffset(10_000, 0)).toBeNull();
  });
});
