import { describe, expect, it } from 'vitest';
import {
  advanceOf,
  buildTemplates,
  decodeAmmo,
  decodeMax,
  frameScores,
  glyphKey,
  textRuns,
  type FrameScores,
  type Gray,
} from './ammo-lib.ts';

// 合成の字: 5 × 9。上の行はどの字も埋め（列が途切れない）、残りは字ごとの決まった模様
const W = 5;
const H = 9;
function glyphBits(ch: string): boolean[][] {
  if (ch === '/') return Array.from({ length: H }, (_, y) => [0, 1, 2].map((x) => x === 2 - Math.floor(y / 3)));
  let seed = ch.charCodeAt(0) * 2654435761;
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, () => {
      seed = (seed * 1103515245 + 12345) >>> 0;
      return y === 0 || seed >>> 31 === 1;
    }),
  );
}

/** 110 × 26 の暗い画に文字列を、字の間 2 px で、中央揃えで描く */
function render(text: string): Gray {
  const w = 110;
  const h = 26;
  const data = new Uint8Array(w * h).fill(20);
  const glyphs = [...text].map(glyphBits);
  const total = glyphs.reduce((s, g) => s + g[0]!.length, 0) + 2 * (glyphs.length - 1);
  let x = Math.round((w - total) / 2);
  for (const g of glyphs) {
    g.forEach((row, y) => row.forEach((on, dx) => on && (data[(8 + y) * w + x + dx] = 230)));
    x += g[0]!.length + 2;
  }
  return { data, w, h };
}

const CROP = { x: 0, y: 0, w: 110, h: 26 };

describe('glyphKey・advanceOf', () => {
  it('最大の数字は m を付けた鍵、「/」はそのまま', () => {
    expect(glyphKey('6', true)).toBe('m6');
    expect(glyphKey('6', false)).toBe('6');
    expect(glyphKey('/', true)).toBe('/');
  });
  it('見本の無い字の送りは、同じ大きさの数字の送りの中央値、それも無ければ残弾の数字の送り', () => {
    const t = { advances: { '6d': [9], '8d': [9], m0d: [8], '6/': [10] } };
    expect(advanceOf(t, '6', 'd')).toBe(9);
    expect(advanceOf(t, '3', 'd')).toBe(9);
    expect(advanceOf(t, 'm3', 'd')).toBe(8);
    expect(advanceOf(t, '3', '/')).toBe(10);
    expect(advanceOf({ advances: { '1d': [5], '2d': [9], '3d': [9] } }, 'm2', 'd')).toBe(9);
    expect(() => advanceOf({ advances: { '2d': [9] } }, '2', '/')).toThrow();
  });
});

describe('textRuns', () => {
  it('字の幅で間の詰まった並びのうち、中央に最も近いものを選ぶ', () => {
    const runs = [
      { x: 5, w: 12 }, // アイコン（幅が広い）
      { x: 20, w: 5 },
      { x: 27, w: 5 },
      { x: 40, w: 5 },
      { x: 47, w: 3 },
      { x: 52, w: 5 },
    ];
    expect(textRuns(runs, 3, 50)).toEqual([runs[3], runs[4], runs[5]]);
    expect(textRuns(runs, 2, 25)).toEqual([runs[1], runs[2]]);
    expect(textRuns(runs, 6, 50)).toBeUndefined();
  });
});

describe('buildTemplates・frameScores', () => {
  const texts = ['12/30', '45/67', '89/10', '3/9', '60/48', '7/52'];
  const t = buildTemplates(
    texts.map((text) => ({ img: render(text), text })),
    CROP,
  );
  it('残弾と最大の字を別の鍵で作り、送りを集める', () => {
    expect(Object.keys(t.glyphs).sort()).toEqual([...'0123456789/', ...[...'0123456789'].map((d) => `m${d}`)].sort());
    expect(t.rows).toBe(H);
    expect(advanceOf(t, '1', 'd')).toBe(W + 2);
    expect(advanceOf(t, '/', 'd')).toBe(3 + 2);
  });
  it('見本に無い並びの表示も、左右の値が最もよく合う', () => {
    for (const [text, left, right] of [
      ['57/86', 57, 86],
      ['0/12', 0, 12],
      ['103/148', 103, 148],
    ] as const) {
      const s = frameScores(render(text), t, 150);
      expect(s.slash).toBeGreaterThan(0.9);
      expect(s.left.indexOf(Math.max(...s.left))).toBe(left);
      expect(s.right.indexOf(Math.max(...s.right))).toBe(right);
    }
  });
  it('「/」の無い画は「/」の点が低い', () => {
    expect(frameScores({ data: new Uint8Array(110 * 26).fill(20), w: 110, h: 26 }, t, 9).slash).toBeLessThan(0.6);
  });
});

/** 合成の照合の点: value が null なら「/」が見えない画、数なら残弾 value・最大 max の画 */
function frames(seq: readonly (number | null)[], max: number | readonly number[], limit = 10): FrameScores[] {
  return seq.map((v, i) => {
    const m = typeof max === 'number' ? max : max[i]!;
    const left = new Float32Array(limit + 1).fill(0.4);
    const right = new Float32Array(limit + 1).fill(0.4);
    if (v === null) return { slash: 0.1, left: left.fill(0.2), right: right.fill(0.2) };
    left[v] = 0.9;
    right[m] = 0.9;
    return { slash: 0.9, left, right };
  });
}

describe('decodeMax', () => {
  it('続けて合う最大に替わり、短いぶれでは替わらない', () => {
    // 0〜19 は最大 6（10 だけ 8 に読めた）、20〜39 は最大 8
    const shown = Array.from({ length: 40 }, (_, i) => (i >= 20 || i === 10 ? 8 : 6));
    const out = decodeMax(frames(Array(40).fill(5), shown), [6, 8]);
    expect(out).toEqual(Array.from({ length: 40 }, (_, i) => (i >= 20 ? 8 : 6)));
  });
  it('候補が 1 つなら一定', () => {
    expect(decodeMax(frames([1, 2], 9), [9])).toEqual([9, 9]);
  });
});

describe('decodeAmmo', () => {
  it('表示が消えた後は最大に戻るか、消える前の値以下から続ける', () => {
    const seq = [9, 9, 8, 7, null, null, 7, 6, 0, null, null, 9, 8];
    expect(decodeAmmo(frames(seq, 9), Array(seq.length).fill(9), { charge: false })).toEqual(seq);
  });
  it('読み違えた 1 フレームの増加は、同じマガジンの中なので採らない', () => {
    const seq = [9, 8, 7, 9, 6, 5];
    const out = decodeAmmo(frames(seq, 9), Array(seq.length).fill(9), { charge: false });
    expect([out[0], out[1], out[2], out[4], out[5]]).toEqual([9, 8, 7, 6, 5]);
    expect([6, 7]).toContain(out[3]);
  });
  it('charge なら、続く増加（弾丸チャージ）を採る', () => {
    const seq = [9, 4, 3, 8, 8, 8, 7];
    expect(decodeAmmo(frames(seq, 9), Array(seq.length).fill(9), { charge: true })).toEqual(seq);
    expect(decodeAmmo(frames(seq, 9), Array(seq.length).fill(9), { charge: false })).not.toEqual(seq);
  });
  it('最大が替わったフレームでは、残弾は増える向きにも移れる', () => {
    const seq = [6, 4, 4, 7, 7, 6];
    const maxes = [6, 6, 6, 8, 8, 8];
    expect(decodeAmmo(frames(seq, maxes), maxes, { charge: false })).toEqual(seq);
  });
});
