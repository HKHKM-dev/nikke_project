import { describe, expect, it } from 'vitest';
import {
  fixedSpecGrid,
  groupMagazines,
  hitCountCandidates,
  parseAmmoSeries,
  segmentOf,
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
