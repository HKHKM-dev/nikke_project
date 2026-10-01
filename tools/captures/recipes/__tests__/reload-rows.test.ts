import { describe, expect, it } from 'vitest';
import { parseReloadRows, summarizeReloads, type ReloadRow } from '../reload-rows.ts';

const row = (patch: Partial<ReloadRow>): ReloadRow => ({
  start: 100,
  end: 160,
  max: 367,
  stages: 1,
  canceled: false,
  fit: { rate: 6.2, zero: 101, frames: 59.2, rms: 1.1 },
  barSpan: 59,
  lastShot: 92,
  lastToEnd: 68,
  endToNext: 12,
  zeroMinusShot: 9,
  window: false,
  misread: false,
  ...patch,
});

describe('parseReloadRows・summarizeReloads', () => {
  it('JSON の行だけを読む', () => {
    const text = `12000 フレーム、3 回のリロード\n${JSON.stringify(row({}))}\n${JSON.stringify(row({ end: 560 }))}\n`;
    expect(parseReloadRows(text).map((r) => r.end)).toEqual([160, 560]);
  });

  it('取り消し・窓を外して集計し（最終弾 → 完了は読み違いも外す）、当てはめの残差が大きい回のバーの長さは入れない', () => {
    const rows = [
      row({}),
      row({ end: 560, canceled: true }),
      row({ end: 960, window: true, endToNext: 140 }),
      row({ end: 1360, misread: true, lastToEnd: 90 }),
      row({ end: 1760, fit: { rate: 6, zero: 1700, frames: 61, rms: 4 } }),
    ];
    const s = summarizeReloads(rows, false);
    expect(s.lastToEnd).toEqual([
      { end: 160, value: 68 },
      { end: 1760, value: 68 },
    ]);
    expect(s.endToNext.map((x) => x.end)).toEqual([160, 1360, 1760]);
    // バーの長さは最終弾の読み違いの回も入れる（reload.ts の集計と同じ）。残差 4px の回は入れない
    expect(s.barFrames).toEqual([59.2, 59.2]);
    expect(s.excluded).toEqual({ canceled: 1, window: 1, misread: 1 });
  });

  it('--stages では段ごとのバーの長さ', () => {
    const rows = [
      row({
        chunks: [
          { start: 100, end: 114, max: 367, frames: 13.6, rms: 0.5 },
          { start: 114, end: 128, max: 367, frames: 13.5, rms: 3.5 },
        ],
      }),
    ];
    expect(summarizeReloads(rows, true).barFrames).toEqual([13.6]);
  });
});
