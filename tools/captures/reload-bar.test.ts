import { describe, expect, it } from 'vitest';
import {
  barLength,
  findChunks,
  firstFrom,
  fitChunk,
  fullLength,
  groupReloads,
  lastBefore,
  median,
  parseHudJumps,
  summarize,
} from './reload-bar.ts';

/** 幅 w・高さ h の rgb24 の画を作る。white(x, y) が真の画素を白（255）、ほかを灰（80）にする */
function image(w: number, h: number, white: (x: number, y: number) => boolean): Uint8Array {
  const out = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) out.fill(white(x, y) ? 255 : 80, (y * w + x) * 3, (y * w + x) * 3 + 3);
  return out;
}

const OPTIONS = { white: 200, minRows: 5, maxStart: 40 };

describe('barLength', () => {
  it('左の空きの後に始まる白の列の数を数える', () => {
    const rgb = image(100, 10, (x, y) => x >= 16 && x < 16 + 30 && y >= 1);
    expect(barLength(rgb, 100, 10, OPTIONS)).toBe(30);
  });

  it('白の画素が minRows 行に届かない列は白としない', () => {
    const rgb = image(100, 10, (x, y) => x >= 16 && x < 60 && y < 4);
    expect(barLength(rgb, 100, 10, OPTIONS)).toBe(0);
  });

  it('maxStart より右で始まる白は拾わない', () => {
    const rgb = image(100, 10, (x) => x >= 50 && x < 80);
    expect(barLength(rgb, 100, 10, OPTIONS)).toBe(0);
  });
});

describe('findChunks・groupReloads', () => {
  it('0 のフレームで区切り、区切りの近い段は 1 回のリロードにまとめる', () => {
    // 1 回目: 通常のリロード。2 回目: 分割リロードの 3 段（段の終わりで空に戻る・大きく短くなる）
    const lengths = [0, 10, 20, 30, 0, 0, 0, 0, 0, 0, 15, 30, 45, 0, 12, 30, 44, 5, 20, 40, 0];
    const chunks = findChunks(lengths, 100);
    expect(chunks).toEqual([
      { start: 101, last: 103, end: 104, max: 30 },
      { start: 110, last: 112, end: 113, max: 45 },
      { start: 114, last: 116, end: 117, max: 44 },
      { start: 117, last: 119, end: 120, max: 40 },
    ]);
    const reloads = groupReloads(chunks);
    expect(reloads.map((r) => r.chunks.length)).toEqual([1, 3]);
  });
});

describe('fullLength', () => {
  it('溝より長い白を除いた、上位の段の最大の中央値', () => {
    const c = (max: number) => ({ start: 0, last: 0, end: 1, max });
    expect(fullLength([c(400), c(363), c(362), c(366), c(120)], 367)).toBe(363);
  });
});

describe('fitChunk', () => {
  it('一定の速さで伸びるバーの伸び・遡った 0 の点・溝の幅 ÷ 伸びを出す', () => {
    // 最終弾 f1000 から 1 フレーム 5.2px で伸び、3 フレーム遅れて見え始める
    const first = 990;
    const lengths: number[] = [];
    for (let n = first; n < 1080; n++) {
      const len = Math.round((n - 1000) * 5.2);
      lengths.push(n >= 1003 && len < 367 ? len : 0);
    }
    const chunk = findChunks(lengths, first)[0]!;
    const fit = fitChunk(lengths, first, chunk, fullLength([chunk], 367), 367)!;
    expect(fit.rate).toBeCloseTo(5.2, 1);
    expect(fit.zero).toBeCloseTo(1000, 0);
    expect(fit.frames).toBeCloseTo(367 / 5.2, 0);
  });

  it('点が 3 つ未満なら null', () => {
    const lengths = [0, 200, 0];
    const chunk = findChunks(lengths, 0)[0]!;
    expect(fitChunk(lengths, 0, chunk, 367, 367)).toBeNull();
  });
});

describe('増分の列', () => {
  it('hud.ts の出力を読み、前後の増分を引く', () => {
    const frames = parseHudJumps('frame\tvalue\tincrement\tgap\n1089\t10\t5\t1\n1094\t15\t5\t5\r\n1176\t20\t5\t82\n');
    expect(frames).toEqual([1089, 1094, 1176]);
    expect(lastBefore(frames, 1102)).toBe(1094);
    expect(lastBefore(frames, 1000)).toBeNull();
    expect(firstFrom(frames, 1164)).toBe(1176);
    expect(firstFrom(frames, 1200)).toBeNull();
  });
});

describe('median・summarize', () => {
  it('中央値と平均・標準誤差', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    const s = summarize([69, 70, 70, 71])!;
    expect(s.mean).toBe(70);
    expect(s.se).toBeCloseTo(Math.sqrt(2 / 3) / 2, 6);
    expect(summarize([])).toBeNull();
  });
});
