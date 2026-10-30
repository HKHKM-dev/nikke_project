// 1 パス目の最適化の段 2（plan/design-first-pass-perf.md 3.2・4 節）: 件の境目まで値を使い回す判定。境目のちょうど・件の作り直し・
// 前のフレームへの戻り・基礎の値の違いで計算し直すこと
import { describe, expect, it } from 'vitest';
import type { HeldItem } from '../holders.ts';
import { createSpanMemo } from '../spanMemo.ts';

/** 件の列（差し替えられる）と、計算した回数を数える使い回し */
function setup(lists: HeldItem[][]) {
  const calls: number[] = [];
  const memo = createSpanMemo(
    lists.length,
    (i) => lists[i]!,
    (frame, base: string) => {
      calls.push(frame);
      return `${base}:${lists.flat().filter((it) => it.start <= frame && frame < it.end).length}`;
    },
  );
  return { memo, calls };
}

describe('createSpanMemo', () => {
  it('件の境目を跨ぐまでは前の値を返し、境目のちょうどで計算し直す', () => {
    const { memo, calls } = setup([[{ start: 10, end: 20 }], [{ start: 15, end: 30 }]]);
    expect(memo(0, 'b')).toBe('b:0');
    expect(memo(9, 'b')).toBe('b:0');
    expect(memo(10, 'b')).toBe('b:1');
    expect(memo(14, 'b')).toBe('b:1');
    expect(memo(15, 'b')).toBe('b:2');
    expect(memo(19, 'b')).toBe('b:2');
    expect(memo(20, 'b')).toBe('b:1');
    expect(memo(30, 'b')).toBe('b:0');
    expect(memo(100, 'b')).toBe('b:0');
    expect(calls).toEqual([0, 10, 15, 20, 30]);
  });

  it('前のフレームへ戻っても、区間の外なら計算し直す', () => {
    const { memo, calls } = setup([[{ start: 10, end: 20 }]]);
    expect(memo(10, 'b')).toBe('b:1');
    expect(memo(11, 'b')).toBe('b:1');
    expect(memo(9, 'b')).toBe('b:0');
    expect(memo(10, 'b')).toBe('b:1');
    expect(calls).toEqual([10, 9, 10]);
  });

  it('件の列が作り直された（別の配列になった）ら、区間の中でも計算し直す', () => {
    const lists: HeldItem[][] = [[{ start: 10, end: 20 }]];
    const { memo, calls } = setup(lists);
    expect(memo(12, 'b')).toBe('b:1');
    lists[0] = [
      { start: 10, end: 20 },
      { start: 12, end: 40 },
    ];
    expect(memo(13, 'b')).toBe('b:2');
    expect(memo(19, 'b')).toBe('b:2');
    expect(calls).toEqual([12, 13]);
  });

  it('基礎の値が違えば計算し直す', () => {
    const { memo, calls } = setup([[{ start: 10, end: 20 }]]);
    expect(memo(12, 'a')).toBe('a:1');
    expect(memo(13, 'b')).toBe('b:1');
    expect(calls).toEqual([12, 13]);
  });

  it('件の列が 0 本なら、基礎の値が同じ間は 1 回だけ計算する', () => {
    const { memo, calls } = setup([]);
    expect(memo(0, 'b')).toBe('b:0');
    expect(memo(5000, 'b')).toBe('b:0');
    expect(calls).toEqual([0]);
  });
});
