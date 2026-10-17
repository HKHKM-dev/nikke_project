import { describe, expect, it } from 'vitest';
import { classifyIncrements, measureCadence, readChargeShots, shotValues } from '../charge-lattice.ts';
import { fixedSpecGrid, type HudIncrement } from '../smg-hits.ts';

// 胴体 100,000 の格子。コアは 200,000、コア会心は 250,000
const grid = fixedSpecGrid(100000);
const STAGE = 777777;

/** 刻み 43f・リロードの空き 172f・装弾数 9 の射撃の列（紅蓮BS と同じ形） */
function fixture(): HudIncrement[] {
  const rows: HudIncrement[] = [];
  const shot = (frame: number, increment = 200000, readGap = 1) => rows.push({ frame, increment, readGap });
  const mag = (from: number, n: number, skip: number[] = []) => {
    for (let k = 0; k < n; k++) if (!skip.includes(k)) shot(from + 43 * k);
  };
  // 1 本目: 5 発目（272f）が総ダメージに出ない。段の増分が 2 回
  mag(100, 9, [4]);
  rows.push({ frame: 105, increment: STAGE, readGap: 1 }, { frame: 300, increment: STAGE, readGap: 1 });
  // 2 本目（444 + 172 = 616f から）。満タンのマガジンの後の窓が、リロードの空き + 刻み（215f）とちょうど同じ長さ
  mag(616, 9);
  mag(1175, 9);
  // 4 本目（1519 + 172 = 1691f から）: 3 発の後に部分チャージの発（1818f）、窓、2059f から 9 発
  mag(1691, 3);
  rows.push({ frame: 1818, increment: 123456, readGap: 1 });
  mag(2059, 9);
  // 最後のマガジン: 桁送りで割れた読み（2618f）と、読めない間に段と重なった読み（2661f の発を 2672f に）
  shot(2575);
  rows.push({ frame: 2618, increment: 199980, readGap: 1 }, { frame: 2628, increment: 20, readGap: 10 });
  rows.push({ frame: 2672, increment: 200000 + STAGE, readGap: 15 });
  shot(2704);
  return rows.sort((a, b) => a.frame - b.frame);
}

describe('shotValues', () => {
  it('距離ボーナス・コア・会心の有無の 8 通り', () => {
    const v = shotValues(grid);
    expect(v).toHaveLength(8);
    expect(v.filter((x) => x.core).map((x) => x.value)).toContain(250000);
    expect(v.filter((x) => !x.core).map((x) => x.value)).toContain(100000);
  });
});

describe('classifyIncrements', () => {
  it('段の増分は捨て、割れた読みと段に重なった読みは 1 発にする', () => {
    const { reads, others, dropped } = classifyIncrements(fixture(), grid);
    expect(others).toEqual([STAGE]);
    expect(dropped).toBe(2);
    const split = reads.find((r) => r.hi === 2628)!;
    expect(split).toMatchObject({ kind: 'full', increment: 200000, rows: 2 });
    expect(reads.find((r) => r.hi === 2672)).toMatchObject({ kind: 'full', lo: 2658 });
    expect(reads.filter((r) => r.kind === 'odd').map((r) => r.hi)).toEqual([1818]);
  });
});

describe('measureCadence', () => {
  it('刻み・リロードの空き・装弾数を増分の列から測る', () => {
    const { reads } = classifyIncrements(fixture(), grid);
    expect(measureCadence(reads)).toEqual({ interval: 43, reloadGap: 172, mag: 9 });
  });
});

describe('readChargeShots', () => {
  const read = readChargeShots(fixture(), grid);

  it('刻みの抜け・部分チャージの発・窓を見つける', () => {
    expect(read.shots.filter((s) => s.kind === 'missing').map((s) => s.frame)).toEqual([272]);
    expect(read.shots.filter((s) => s.kind === 'partial').map((s) => s.frame)).toEqual([1818]);
    expect(read.windows).toEqual([
      { before: 960, after: 1175 },
      { before: 1818, after: 2059 },
    ]);
    expect(read.shots).toHaveLength(9 + 9 + 9 + 4 + 9 + 4);
    expect(read.odd).toEqual([]);
  });

  it('リロード + 抜けに見える窓は、明けのマガジンの発の数（先読み）で窓と決める', () => {
    expect(read.shots.some((s) => s.kind === 'missing' && s.frame > 960 && s.frame < 1175)).toBe(false);
    expect(read.reloads).toEqual(expect.arrayContaining([444, 1519, 2403]));
  });

  it('読めない間にかかった発は、時刻の幅で格子に乗せる', () => {
    expect(read.shots.filter((s) => s.wide).map((s) => s.frame)).toEqual([2628, 2672]);
  });

  it('最後の増分が部分チャージの発なら、窓は戦闘の終わりまで', () => {
    const rows = fixture().filter((r) => r.frame <= 2059 + 43 * 2);
    rows.push({ frame: 2059 + 43 * 2 + 40, increment: 111111, readGap: 1 });
    const r = readChargeShots(rows, grid);
    expect(r.windows.at(-1)).toEqual({ before: 2059 + 43 * 2 + 40, after: undefined });
  });
});
