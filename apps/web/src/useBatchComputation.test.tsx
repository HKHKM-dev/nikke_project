// @vitest-environment happy-dom
// 複数の編成の計算（useBatchComputation.ts）の割り振り: 手の空いた Worker に 1 件ずつ渡し、止まった Worker の件は取り戻してやり直す。
// 同じ件で止まり続けたらその件を失敗にし、動く Worker が無くなったら残りを失敗にして終える。dead の Worker は次の計算で作り直す
import type { TeamInput } from '@nikke/core';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeWorker, installFakeWorker, liveWorkers, requestTotal } from './__tests__/fakeWorker.ts';
import { ComputeCache, WORKER_RESTART_DELAY_MS, type Computed } from './compute.ts';
import { BATCH_MAX_RETRIES, useBatchComputation } from './useBatchComputation.ts';

const inputsOf = (...totals: number[]) => totals.map((total) => ({ total }) as unknown as TeamInput);

function renderBatch(inputs: readonly TeamInput[], workers: number) {
  const cache = new ComputeCache(64);
  return renderHook(({ inputs }) => useBatchComputation(inputs, cache, workers), { initialProps: { inputs } });
}

/** 送られた件（入力の total）を Worker ごとに */
const postedTotals = () => FakeWorker.instances.map((w) => w.posted.map(requestTotal));

const totalOf = (c: Computed | null) => (c?.ok ? c.result.totalDamage : c === null ? null : c.error);

/** 止まった Worker の作り直しを、あきらめるまで待つ */
const waitRestarts = () => act(() => vi.runAllTimers());

beforeEach(() => {
  vi.useFakeTimers();
  installFakeWorker();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useBatchComputation', () => {
  it('hands one input at a time to a free worker', () => {
    const { result } = renderBatch(inputsOf(1, 2, 3), 2);
    expect(postedTotals()).toEqual([[1], [2]]);
    expect(result.current.computing).toBe(true);
    act(() => FakeWorker.instances[1]!.reply());
    expect(postedTotals()).toEqual([[1], [2, 3]]);
    act(() => FakeWorker.instances[0]!.reply());
    act(() => FakeWorker.instances[1]!.reply());
    expect(result.current.computing).toBe(false);
    expect(result.current.results!.map(totalOf)).toEqual([1, 2, 3]);
  });

  it('takes back the input of a stopped worker and does it again', () => {
    const { result } = renderBatch(inputsOf(1, 2), 1);
    act(() => FakeWorker.instances[0]!.crash());
    act(() => vi.advanceTimersByTime(WORKER_RESTART_DELAY_MS));
    expect(postedTotals()).toEqual([[1], [1]]);
    act(() => liveWorkers()[0]!.reply());
    act(() => liveWorkers()[0]!.reply());
    expect(result.current.computing).toBe(false);
    expect(result.current.results!.map(totalOf)).toEqual([1, 2]);
  });

  it('fails an input that keeps stopping the workers, and computes the others', () => {
    const { result } = renderBatch(inputsOf(1, 2, 3, 4), 2);
    // 1 を受けた Worker は落ち、ほかの件には答える（答えると Worker の失敗の数は 0 に戻る）
    for (let step = 0; step < 20 && result.current.computing; step++) {
      act(() => {
        for (const w of liveWorkers()) if (w.lastTotal === 1) w.crash('1 で落ちた');
      });
      act(() => {
        for (const w of liveWorkers()) if (w.lastTotal !== undefined && w.lastTotal !== 1) w.reply();
      });
      act(() => vi.advanceTimersByTime(WORKER_RESTART_DELAY_MS));
    }
    expect(result.current.computing).toBe(false);
    const [first, ...rest] = result.current.results!;
    expect(first).toEqual({ ok: false, error: expect.stringContaining('1 で落ちた') });
    expect(rest.map(totalOf)).toEqual([2, 3, 4]);
    expect(
      postedTotals()
        .flat()
        .filter((t) => t === 1),
    ).toHaveLength(BATCH_MAX_RETRIES + 1);
  });

  it('fails the rest when no worker is left', () => {
    FakeWorker.failCreates = Infinity;
    const { result } = renderBatch(inputsOf(1, 2), 2);
    expect(result.current.computing).toBe(true);
    waitRestarts();
    expect(result.current.computing).toBe(false);
    expect(result.current.results!.map(totalOf)).toEqual([
      expect.stringContaining('Worker を作れません'),
      expect.stringContaining('Worker を作れません'),
    ]);
  });

  it('makes the dead workers again for the next inputs', () => {
    FakeWorker.failCreates = Infinity;
    const { result, rerender } = renderBatch(inputsOf(1), 1);
    waitRestarts();
    expect(result.current.computing).toBe(false);
    FakeWorker.failCreates = 0;
    rerender({ inputs: inputsOf(2) });
    expect(liveWorkers()).toHaveLength(1);
    act(() => liveWorkers()[0]!.reply());
    expect(result.current.computing).toBe(false);
    expect(result.current.results!.map(totalOf)).toEqual([2]);
  });

  it('does not stay computing when the remade worker cannot be made', () => {
    const { result } = renderBatch(inputsOf(1), 1);
    FakeWorker.failCreates = Infinity;
    act(() => FakeWorker.instances[0]!.crash());
    waitRestarts();
    expect(result.current.computing).toBe(false);
    expect(result.current.results!.map(totalOf)).toEqual([expect.stringContaining('Worker を作れません')]);
  });

  it('throws the workers away on unmount', () => {
    const { unmount } = renderBatch(inputsOf(1, 2), 2);
    expect(liveWorkers()).toHaveLength(2);
    unmount();
    expect(liveWorkers()).toHaveLength(0);
  });
});
