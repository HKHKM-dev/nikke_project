import { describe, expect, it } from 'vitest';
import {
  BAND_H,
  SHEARED_W,
  SUFFIX_WIDTH,
  advanceOf,
  cellWidth,
  decodeTemplates,
  encodeTemplates,
  layoutCandidates,
  readStrip,
  widthOf,
  type InterceptionTemplates,
  type Strip,
} from './hud-interception.ts';

/** 決まった種から作る擬似乱数（テストを毎回同じにする） */
function random(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

const rand = random(7);
const block = (w: number) => Array.from({ length: BAND_H * w }, () => 100 + 120 * rand());
const templates: InterceptionTemplates = {
  suffix: block(SUFFIX_WIDTH),
  glyphs: Object.fromEntries([...'0123456789,'].map((c) => [c, block(cellWidth(c))])),
  center: 197.75,
  samples: [],
};

/** 左の値 left の画を、見本を字送りの位置に貼って作る（中央揃え。斜線の左端は元の画の px に丸める） */
function render(left: string): Strip {
  const strip = new Float32Array(SHEARED_W * BAND_H).map(() => 140 + 5 * rand());
  const paste = (x: number, w: number, values: readonly number[]) => {
    const x0 = Math.round(x);
    for (let y = 0; y < BAND_H; y++) {
      for (let dx = 0; dx < w; dx++) strip[y * SHEARED_W + x0 + dx] = values[y * w + dx]!;
    }
  };
  const slashLeft = Math.round((templates.center + widthOf(left) / 2) / 4) * 4;
  paste(slashLeft - 2, SUFFIX_WIDTH, templates.suffix);
  let x = slashLeft;
  for (const c of [...left].reverse()) {
    x -= advanceOf(c);
    paste(x - 1, cellWidth(c), templates.glyphs[c]!);
  }
  return strip;
}

describe('layoutCandidates', () => {
  it('左の値の幅から、桁数と「1」の数の組を出す', () => {
    expect(layoutCandidates(widthOf('1,106,112'))).toContainEqual({ digits: 7, ones: 4 });
    expect(layoutCandidates(widthOf('79,191'))).toContainEqual({ digits: 5, ones: 2 });
  });

  it('斜線の位置の丸めで幅がずれても正しい組を残し、ほかの桁数の組も候補にする（照合で選ぶ）', () => {
    const c = layoutCandidates(widthOf('79,191') + 2);
    expect(c).toContainEqual({ digits: 5, ones: 2 });
    expect(c).toContainEqual({ digits: 6, ones: 4 });
  });
});

describe('encodeTemplates / decodeTemplates', () => {
  it('灰色の値を 0〜255 の整数にして往復する', () => {
    const t = { ...templates, suffix: [0, 12.4, 12.6, 300], glyphs: { '0': [-5, 254.5] } };
    const back = decodeTemplates(encodeTemplates(t));
    expect(back.suffix).toEqual([0, 12, 13, 255]);
    expect(back.glyphs['0']).toEqual([0, 255]);
    expect(back.center).toBe(t.center);
  });
});

describe('readStrip', () => {
  it.each(['5', '79,191', '608,300', '1,106,112', '1,066,756', '8,404,000'])('%s を読む', (left) => {
    expect(readStrip(render(left), templates)?.text).toBe(left);
  });

  it('右側が見つからない（数値が隠れている）フレームは null', () => {
    const blank = new Float32Array(SHEARED_W * BAND_H).map(() => 140 + 5 * rand());
    expect(readStrip(blank, templates)).toBeNull();
  });
});
