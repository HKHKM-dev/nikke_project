import { describe, expect, it } from 'vitest';
import { arCuts, arGridValues, readArIncrement, tallyAr, type ArGrid } from '../ar-cores.ts';

// I-DOLL・サン（スペック固定 ON）と、S2 の攻撃力▲の状態の胴体（`0423-01`）
const sun: ArGrid = { bodies: [9972.6445, 10880.55], core: 1, crit: 0.5, distance: 0.3 };
const v = (core: 0 | 1, crit: 0 | 1, dist: 0 | 1, atk = 0) =>
  Math.round(sun.bodies[atk]! * (1 + core + 0.5 * crit + 0.3 * dist));

describe('arGridValues', () => {
  it('コア・会心・距離ボーナス × 胴体の数だけ、1 ヒットごとに四捨五入した値が出る', () => {
    const vs = arGridValues(sun);
    expect(vs).toHaveLength(16);
    expect(vs[0]!.value).toBe(9973);
    // 中近の胴体（距離ボーナス）。587 の最初の増分
    expect(vs.find((x) => x.core === 0 && x.crit === 0 && x.dist === 1 && x.atk === 0)!.value).toBe(12964);
  });
});

describe('readArIncrement', () => {
  const vs = arGridValues(sun);

  it('前のフレームも読めた増分は 1 ヒットだけ', () => {
    // コア（距離ボーナスなし）= 胴体 2 ヒットとほぼ同じ値だが、1 ヒットまでならコア 1
    const r = readArIncrement(v(1, 0, 0), 1, vs, 0);
    expect(r.kind).toBe('hits');
    if (r.kind === 'hits') expect(r.parts.map((p) => p.core)).toEqual([1]);
  });

  it('読めなかった後の増分は、1 ヒットごとに四捨五入した値の和で読む（同じ距離ボーナス・同じ胴体）', () => {
    const r = readArIncrement(v(0, 0, 1) + v(1, 1, 1), 4, vs, 0);
    expect(r.kind).toBe('hits');
    if (r.kind === 'hits') {
      expect(r.parts).toHaveLength(2);
      expect(r.parts.reduce((s, p) => s + p.core, 0)).toBe(1);
    }
  });

  it('ヒットの数かコアの数が一通りに決まらなければ落とす', () => {
    // 胴体 2 ヒット（9973 × 2 = 19946）とコア 1 ヒット（19945）は差 1。差 1 を許すと決まらない
    expect(readArIncrement(19946, 2, vs, 1).kind).toBe('ambiguous');
    expect(readArIncrement(19946, 2, vs, 0)).toMatchObject({ kind: 'hits' });
  });

  it('格子に乗らない増分', () => {
    expect(readArIncrement(10000, 1, vs, 0).kind).toBe('unfit');
  });
});

describe('arCuts', () => {
  // 発の間 5f・装弾数 4（満タンの長さ 15f）。リロードの空き 50f
  const mag = (start: number, n = 4) => Array.from({ length: n }, (_, i) => ({ frame: start + 5 * i }));
  it('満タンに届かない連射の終わりと、長い空きの前を切れ目にし、近すぎる候補は飛ばす', () => {
    const rows = [
      ...mag(0),
      ...mag(65),
      ...mag(130, 2), // 切れたマガジン → 切れ目 135
      ...mag(1700),
      ...mag(1765), // この後の空きが 200f → 切れ目 1780
      ...mag(1980, 2), // 1780 から近い切れたまとまり → 飛ばす
      ...mag(2045),
      ...mag(3400, 3), // 最後のまとまりは切れ目にしない
    ];
    expect(arCuts(rows, 4, 5, 180, 1500)).toEqual([135, 1780]);
  });
});

describe('tallyAr', () => {
  it('区間ごとに数え、ジャンプに接するマガジンと落とした増分を含むマガジンを完全から外す', () => {
    const rows: { frame: number; increment: number; readGap: number }[] = [];
    const push = (start: number, values: number[]) =>
      values.forEach((x, i) => rows.push({ frame: start + 5 * i, increment: x, readGap: 1 }));
    const body = v(0, 0, 0);
    // 区間 0（切れ目 f200 まで）: 3 マガジン（4 発）。真ん中のマガジンは 1 発がコア
    push(0, [body, body, body, body]);
    push(65, [body, v(1, 0, 0), body, body]);
    push(130, [body, body, body, body]);
    // 区間 1: 2 マガジン（最初と最後なので完全でない）。2 つ目に格子に乗らない増分
    push(300, [body, body, body, body]);
    push(365, [body, 10000, body, body]);
    const t = tallyAr(rows, { ...sun, bodies: [sun.bodies[0]!] }, [200], { interval: 5, mag: 4, tol: 0, segments: 2 });
    expect(t.segments[0]).toMatchObject({ hits: 12, cores: 1 });
    expect(t.segments[1]).toMatchObject({ hits: 7, cores: 0 });
    expect(t.unfit).toBe(1);
    expect(t.magazines.filter((m) => m.complete).map((m) => m.start)).toEqual([65]);
  });
});
