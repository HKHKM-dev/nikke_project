import { describe, expect, it } from 'vitest';
import {
  detectBuffWindows,
  detectCuts,
  estimateWindowGrid,
  fixedSpecGrid,
  groupMagazines,
  hitCountCandidates,
  parseAmmoSeries,
  segmentOf,
  shotsFromAmmo,
  shotsUpperBound,
  singleHitDistance,
  splitHits,
} from '../smg-hits.ts';

// リター（スペック固定 ON）の胴体。距離ボーナスの中は 11,329、コアは 17,429
const grid = fixedSpecGrid(8714.7);

describe('hitCountCandidates', () => {
  it('距離ボーナスが全部に付く所では、1 ヒットと 2 ヒットの増分が重ならない', () => {
    expect(hitCountCandidates(11329, grid, 4, 'all')).toEqual([1]);
    expect(hitCountCandidates(22658, grid, 4, 'all')).toEqual([2]);
    // コア + 会心 + 距離ボーナス（2.8 倍）は 1 ヒットだけ
    expect(hitCountCandidates(24401, grid, 4, 'all')).toEqual([1]);
  });

  it('距離ボーナスの無い所では「コア 1 = 胴体 2」が分けられない', () => {
    expect(hitCountCandidates(17429, grid, 4, 'none')).toEqual([1, 2]);
    expect(hitCountCandidates(8715, grid, 4, 'none')).toEqual([1]);
    // 格子に乗らない
    expect(hitCountCandidates(10000, grid, 4, 'none')).toEqual([]);
  });

  it('混ざる所（中遠 A）では、コア + 距離ボーナス（2.3 倍）と、胴体 + 距離ボーナスの胴体の 2 ヒットが重なる', () => {
    expect(hitCountCandidates(20044, grid, 4, 'mixed')).toEqual([1, 2]);
    expect(hitCountCandidates(20044, grid, 4, 'all')).toEqual([1]);
  });

  it('1 ヒットの増分の距離ボーナスを見分ける', () => {
    expect(singleHitDistance(11329, grid)).toBe(1);
    expect(singleHitDistance(13072, grid)).toBe(0);
    expect(singleHitDistance(22658, grid)).toBeUndefined();
  });
});

describe('shotsUpperBound', () => {
  const ammo = parseAmmoSeries(
    'frame\tvalue\tscore\tx\ty\n100\t50\t0.9\t1\t1\n103\t49\t0.9\t1\t1\n108\t47\t0.9\t1\t1\n130\t120\t0.9\t1\t1\n',
  );
  it('前と後で読めた残弾の差', () => {
    expect(shotsUpperBound(ammo, 100, 108)).toBe(3);
    expect(shotsUpperBound(ammo, 103, 108)).toBe(2);
    expect(shotsUpperBound(ammo, 101, 105)).toBe(3);
  });
  it('間にリロードの増えがあるか、読めた所が離れていれば出さない', () => {
    expect(shotsUpperBound(ammo, 108, 130)).toBeUndefined();
    expect(shotsUpperBound(ammo, 90, 103)).toBeUndefined();
  });
});

describe('splitHits', () => {
  it('前のフレームも読めた増分は 1 ヒットまで（撃ったのと同じフレームで総ダメージが増え、発は 1 フレームに 1 発まで）', () => {
    const rows = [
      { frame: 10, increment: 8715, readGap: 2 },
      { frame: 12, increment: 17429, readGap: 1 },
    ];
    const { increments } = splitHits(rows, grid, () => 'none', [], 2.43);
    expect(increments.map((x) => [x.hits, x.boundFrom, x.ambiguous])).toEqual([
      [1, 'interval', false],
      [1, 'frame', false],
    ]);
  });

  it('前のフレームが読めない増分は、残弾で撃った発の数を抑える。抑えても候補が 2 つ残れば決まらない', () => {
    const ammo = parseAmmoSeries('10\t60\n15\t58\n20\t57\n');
    const rows = [
      { frame: 15, increment: 17429, readGap: 5 },
      { frame: 20, increment: 17429, readGap: 5 },
    ];
    const { increments } = splitHits(rows, grid, () => 'none', ammo, 2.43);
    expect(increments.map((x) => [x.hits, x.bound, x.boundFrom, x.ambiguous])).toEqual([
      [2, 2, 'ammo', true],
      [1, 1, 'ammo', false],
    ]);
  });

  it('格子に乗らない増分は次の増分と足す', () => {
    const rows = [
      { frame: 10, increment: 5000, readGap: 1 },
      { frame: 13, increment: 6329, readGap: 3 },
    ];
    const { increments, unfit } = splitHits(rows, grid, () => 'all', [], 2.43);
    expect(increments.map((x) => [x.frame, x.increment, x.hits])).toEqual([[13, 11329, 1]]);
    expect(unfit).toEqual([]);
  });
});

describe('groupMagazines・segmentOf', () => {
  it('40f を超える空きで分け、ジャンプの前の最後の増分で区間を分ける', () => {
    const items = [10, 12, 15, 100, 103].map((frame) => ({ frame }));
    expect(groupMagazines(items).map((g) => g.length)).toEqual([3, 2]);
    expect([10, 15, 16, 100].map((f) => segmentOf(f, [15, 90]))).toEqual([0, 0, 1, 2]);
  });
});

describe('detectCuts', () => {
  // 装弾数 10・刻み 2f のマガジン（満タンの長さ 18f）。dist は距離ボーナスの付いた胴体（11,329）か、付かない胴体（8,715）
  const mag = (start: number, shots: number, dist: boolean) =>
    Array.from({ length: shots }, (_, i) => ({ frame: start + 2 * i, increment: dist ? 11329 : 8715, readGap: 1 }));
  it('切れたマガジンと距離ボーナスの替わり目から、5 つの切れ目を決める', () => {
    const rows = [
      ...mag(0, 10, true), // 中近
      ...mag(60, 4, true), // 中近（ジャンプで切れる）→ 1 回目 f66
      ...mag(200, 10, true), // 近
      ...mag(260, 10, true), // 近（ジャンプがマガジンの終わりと重なる）→ 2 回目 f278
      ...mag(400, 10, false), // 遠
      ...mag(460, 6, false), // 遠（切れる）→ 3 回目 f470
      ...mag(600, 10, false), // 中遠（B・C）→ 4 回目 f618（次から近）
      ...mag(700, 10, true), // 近
      ...mag(760, 5, true), // 近（切れる）→ 5 回目 f768
      ...mag(900, 10, false), // 遠
    ];
    expect(detectCuts(rows, grid, 10, 2, [200, 200, 150, 150])).toEqual([66, 278, 470, 618, 768]);
  });
});

describe('バーストの効果の窓（V-0215）', () => {
  // 録画 213 の値。近（距離ボーナス）で攻撃力▲の窓は胴体 14,472（1 ヒット 18,814・会心 26,050・コア 33,286）、
  // 遠（距離ボーナスなし）でクリティカルダメージ▲も乗る窓は会心の倍率 0.6246（会心 23,512）
  it('窓の増分から胴体と会心の倍率を測る', () => {
    const near = estimateWindowGrid([18814, 18814, 18814, 26050, 33286, 18814], grid, 'all');
    expect(near.grid.body).toBeCloseTo(14472.3, 0);
    expect(near.grid.crit).toBe(0.5);
    expect(near.fit).toBe(6);
    const far = estimateWindowGrid([14472, 14472, 23512, 14472, 28944, 14472], grid, 'none');
    expect(far.grid.body).toBe(14472);
    expect(far.grid.crit).toBeCloseTo(0.6246, 3);
    expect(far.fit).toBe(6);
  });

  it('中遠 A（距離ボーナスが混ざる）では、会心の倍率が並べば base に近いほう', () => {
    const { grid: g } = estimateWindowGrid([15730, 15730, 25555, 20449, 15730], grid, 'mixed');
    expect(g.body).toBe(15730);
    expect(g.crit).toBeCloseTo(0.6246, 3);
  });

  it('胴体の格子に乗らない増分のまとまりを窓にし、読み違いの単発は窓にしない', () => {
    const base = (from: number, n: number) =>
      Array.from({ length: n }, (_, i) => ({ frame: from + 2 * i, increment: 11329, readGap: 1 }));
    const rows = [
      ...base(0, 50),
      { frame: 100, increment: 8000, readGap: 1 }, // 読み違いの単発（前後 150f に窓の増分が無い）
      ...base(102, 100),
      ...Array.from({ length: 30 }, (_, i) => ({
        frame: 400 + 2 * i,
        increment: i % 5 === 0 ? 26050 : 18814,
        readGap: 1,
      })),
      ...base(460, 50),
    ];
    const windows = detectBuffWindows(rows, grid, () => 'all');
    expect(windows.map((w) => [w.start, w.end, w.fit, w.total])).toEqual([[400, 458, 30, 30]]);
    expect(windows[0]!.grid.body).toBeCloseTo(14472.3, 0);
  });

  it('splitHits は窓の格子、乗らなければ胴体の格子で分ける', () => {
    const near = estimateWindowGrid([18814], grid, 'all').grid;
    const rows = [
      { frame: 10, increment: 18814, readGap: 1 },
      { frame: 12, increment: 11329, readGap: 1 },
    ];
    const { increments, unfit } = splitHits(
      rows,
      () => [near, grid],
      () => 'all',
      [],
      2.45,
    );
    expect(increments.map((x) => x.hits)).toEqual([1, 1]);
    expect(unfit).toEqual([]);
  });

  it('撃った数 = 最初の残弾 − 撃たずに消えた弾（最大装弾数▲が切れた減り）。減って戻る読み違いは使わない', () => {
    // 174 から撃ち始め、173 のときに効果が切れて 120 になり、同じフレームで 1 発撃って 119。そこから 2.45f ごとに 1 発ずつ 1 まで
    // （最後の 0 は読めない）。途中の 18 を 10 と 2 フレーム読み違える
    const rows: string[] = ['100\t174', '101\t174', '103\t173', '104\t173'];
    let glitch = 0;
    for (let f = 105; ; f++) {
      const v = 119 - Math.floor((f - 105) / 2.45);
      if (v < 1) break;
      rows.push(`${f}\t${v === 18 && glitch++ < 2 ? 10 : v}`);
    }
    const r = shotsFromAmmo(parseAmmoSeries(rows.join('\n')), 100, 395, 2.45, [103, 105]);
    expect(r).toEqual({ shots: 121, first: 174, last: 1, capped: 1 });
  });
});
