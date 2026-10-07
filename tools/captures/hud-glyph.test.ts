import { describe, expect, it } from 'vitest';
import { holes, type Component } from './hud-glyph.ts';

/** 文字の絵（# が前景）を成分にする。左上を (10, 5) に置く */
function component(rows: string[]): Component {
  const pixels: [number, number][] = [];
  rows.forEach((row, y) => [...row].forEach((ch, x) => ch === '#' && pixels.push([10 + x, 5 + y])));
  const xs = pixels.map(([x]) => x);
  const ys = pixels.map(([, y]) => y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys), pixels };
}

describe('holes', () => {
  it('0 は穴が 1 個', () => {
    expect(holes(component(['.####.', '##..##', '##..##', '##..##', '##..##', '.####.']))).toBe(1);
  });

  it('8 は穴が 2 個', () => {
    expect(holes(component(['.####.', '##..##', '.####.', '##..##', '##..##', '.####.']))).toBe(2);
  });

  it('穴の無い数字は 0 個', () => {
    expect(holes(component(['..##', '.###', '..##', '..##', '####']))).toBe(0);
  });

  it('minArea より小さい穴（ノイズ）は数えない', () => {
    const zeroWithSpeck = component(['.####.', '##..##', '##..##', '##..##', '#.#.##', '.####.']);
    expect(holes(zeroWithSpeck)).toBe(2);
    expect(holes(zeroWithSpeck, 2)).toBe(1);
  });

  it('斜めにだけつながる背景は、外とつながらない穴として数える（背景は 4 近傍）', () => {
    expect(holes(component(['###', '#.#', '##.']))).toBe(1);
    expect(holes(component(['###', '#..', '###']))).toBe(0);
  });
});
