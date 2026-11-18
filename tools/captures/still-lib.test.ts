import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  filterPath,
  fontCandidates,
  labelFontSize,
  outputs,
  parseRange,
  parseSheet,
  pickFont,
  pickFrames,
  sheetFilters,
  withSuffix,
} from './still-lib.ts';

describe('引数の読み取り', () => {
  it('reads --range and --sheet', () => {
    expect(parseRange('100-130')).toEqual({ first: 100, last: 130 });
    expect(parseRange(' 7 - 7 ')).toEqual({ first: 7, last: 7 });
    expect(parseSheet('6x5')).toEqual({ cols: 6, rows: 5 });
    expect(parseSheet('2X1')).toEqual({ cols: 2, rows: 1 });
  });

  it('rejects malformed values', () => {
    expect(() => parseRange('130-100')).toThrow('A は B 以下');
    expect(() => parseRange('100')).toThrow('A-B');
    expect(() => parseSheet('0x5')).toThrow('列x行');
    expect(() => parseSheet('6*5')).toThrow('列x行');
  });
});

describe('取るフレームと select の式', () => {
  it('takes a range with a step in one select expression', () => {
    expect(pickFrames({ range: '100-130', every: '10' })).toEqual({
      frames: [100, 110, 120, 130],
      select: 'between(n\\,100\\,130)*not(mod(n-100\\,10))',
    });
    expect(pickFrames({ range: '5-7' }).frames).toEqual([5, 6, 7]);
  });

  it('sorts and dedupes --frames, and treats --frame as a list of one', () => {
    expect(pickFrames({ frames: '250,3, 5,3' })).toEqual({
      frames: [3, 5, 250],
      select: 'eq(n\\,3)+eq(n\\,5)+eq(n\\,250)',
    });
    expect(pickFrames({ frame: '42' })).toEqual({ frames: [42], select: 'eq(n\\,42)' });
  });

  it('needs exactly one way to choose frames', () => {
    expect(() => pickFrames({})).toThrow('どれか 1 つ');
    expect(() => pickFrames({ frame: '1', range: '1-2' })).toThrow('どれか 1 つ');
    expect(() => pickFrames({ frames: '1,2', every: '2' })).toThrow('--every は --range');
    expect(() => pickFrames({ range: '1-9', every: '0' })).toThrow('1 以上');
    expect(() => pickFrames({ frames: '1,x' })).toThrow('--frames');
  });
});

describe('フィルタの並び', () => {
  const select = 'eq(n\\,3)+eq(n\\,5)';
  it('burns the frame number before select so it is the original number', () => {
    const vf = sheetFilters({
      select,
      last: 5,
      crop: { x: 820, y: 10, w: 280, h: 50 },
      scale: 140,
      label: { font: 'C:/Windows/Fonts/arial.ttf', size: 28 },
      tile: { cols: 6, rows: 5 },
    });
    const parts = vf.split(/,(?=[a-z]+=)/);
    expect(parts.map((p) => p.split('=')[0])).toEqual(['trim', 'crop', 'drawtext', 'select', 'scale', 'tile']);
    expect(vf).toContain('trim=end_frame=6,');
    expect(vf).toContain("drawtext=fontfile='C\\:/Windows/Fonts/arial.ttf':text='%{n}'");
    expect(vf).toContain(`enable='${select}'`);
    expect(vf).toContain('tile=6x5:padding=2');
  });

  it('leaves out what was not asked for', () => {
    expect(sheetFilters({ select, last: 5 })).toBe(`trim=end_frame=6,select='${select}'`);
  });

  it('escapes a font path for the filter graph', () => {
    expect(filterPath('C:\\Windows\\Fonts\\arial.ttf')).toBe("'C\\:/Windows/Fonts/arial.ttf'");
    expect(filterPath('/usr/share/fonts/a.ttf')).toBe("'/usr/share/fonts/a.ttf'");
    expect(() => filterPath("/tmp/it's.ttf")).toThrow("' は使えない");
  });

  it('keeps the label readable after scaling and inside the cell', () => {
    expect(labelFontSize(1920, 1080)).toBe(77);
    expect(labelFontSize(1920, 1080, 480)).toBe(77);
    expect(labelFontSize(1920, 1080, 240)).toBe(112);
    expect(labelFontSize(280, 50)).toBe(14);
    expect(labelFontSize(280, 20, 140)).toBe(12);
  });
});

describe('フォントの選び方', () => {
  it('takes the first font that exists', () => {
    const have = new Set(['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/Library/Fonts/Arial.ttf']);
    expect(pickFont(fontCandidates({}), (p) => have.has(p))).toBe('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf');
  });

  it('looks under WINDIR on Windows', () => {
    const candidates = fontCandidates({ WINDIR: 'D:\\Win' });
    expect(pickFont(candidates, (p) => p === 'D:/Win/Fonts/arial.ttf')).toBe('D:/Win/Fonts/arial.ttf');
  });

  it('returns null when no font is found (the sheet is drawn without numbers)', () => {
    expect(pickFont(fontCandidates({}), () => false)).toBeNull();
    expect(pickFont(['/nope.ttf'], () => false)).toBeNull();
  });
});

describe('出力の名前', () => {
  const out = join('d', 'x.png');
  it('adds _f<frame> for one image per frame', () => {
    expect(withSuffix(out, '_f1200')).toBe(join('d', 'x_f1200.png'));
    expect(outputs(out, [3, 5])).toEqual([
      { path: join('d', 'x_f3.png'), frames: [3] },
      { path: join('d', 'x_f5.png'), frames: [5] },
    ]);
    // 1 枚だけなら --out のまま
    expect(outputs(out, [3])).toEqual([{ path: out, frames: [3] }]);
  });

  it('writes one sheet to --out and splits the rest by frame range', () => {
    expect(outputs(out, [1, 2, 3], 4)).toEqual([{ path: out, frames: [1, 2, 3] }]);
    expect(outputs(out, [10, 20, 30, 40, 50], 2)).toEqual([
      { path: join('d', 'x_f10-20.png'), frames: [10, 20] },
      { path: join('d', 'x_f30-40.png'), frames: [30, 40] },
      { path: join('d', 'x_f50-50.png'), frames: [50] },
    ]);
  });
});
