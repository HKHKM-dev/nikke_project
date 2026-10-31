import { describe, expect, it } from 'vitest';
import { FIELD, HALF_H, HALF_W } from '../../aim-lib.ts';
import { midWidth, nearLanding } from '../fb-near-width.ts';

/** 半分の解像度のマスクに矩形を塗る（座標は半分の解像度） */
function mask(rects: [number, number, number, number][]): Uint8Array {
  const m = new Uint8Array(HALF_W * HALF_H);
  for (const [x0, y0, x1, y1] of rects)
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) m[y * HALF_W + x] = 1;
  return m;
}

describe('midWidth', () => {
  it('外接矩形の上から 45〜55% の行だけの左右の端を、元の解像度の px で返す', () => {
    // 外接矩形は半分の解像度で y 0〜100。上の腕（y 10）は広く、45〜55 の行の胴は x 300〜469
    const m = mask([
      [100, 10, 800, 12],
      [300, 0, 469, 100],
    ]);
    expect(midWidth({ y0: FIELD.y0, y1: FIELD.y0 + 200, mask: m })).toBe(340);
  });

  it('その行に的が無ければ NaN', () => {
    const m = mask([[300, 0, 469, 10]]);
    expect(midWidth({ y0: FIELD.y0, y1: FIELD.y0 + 200, mask: m })).toBeNaN();
  });
});

describe('nearLanding', () => {
  it('多いほうが 8 割以上かつ 10 フレーム以上で決める（小さい群が近 A）', () => {
    expect(nearLanding([...Array(37).fill(330), ...Array(5).fill(400)])).toEqual({ a: 37, b: 5, landing: 'A' });
    expect(nearLanding([...Array(3).fill(330), ...Array(19).fill(390), 600])).toEqual({ a: 3, b: 19, landing: 'B' });
  });

  it('8 割に届かないか、10 フレームに届かなければ決めない', () => {
    expect(nearLanding([...Array(21).fill(340), ...Array(10).fill(400)]).landing).toBeUndefined();
    expect(nearLanding(Array(9).fill(330)).landing).toBeUndefined();
  });

  it('群の外の幅（つながり・隠れ）は数えない', () => {
    expect(nearLanding([...Array(12).fill(335), 280, 470, 780])).toEqual({ a: 12, b: 0, landing: 'A' });
  });
});
