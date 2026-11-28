// 計算の Worker の見張り（computeWorker.ts）: 止まったら作り直して onRestart、続けて止まったら onGiveUp。Worker を作れないときも同じに扱う
import type { TeamInput } from '@nikke/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeWorker, installFakeWorker, liveWorkers } from './__tests__/fakeWorker.ts';
import { WORKER_HANG_MS, WORKER_MAX_RESTARTS, WORKER_RESTART_DELAY_MS } from './compute.ts';
import { superviseWorker } from './computeWorker.ts';

const request = (seq: number) => ({ seq, input: { total: seq } as unknown as TeamInput });

function supervise() {
  const handlers = {
    onMessage: vi.fn(),
    onMessageError: vi.fn(),
    onRestart: vi.fn(),
    onGiveUp: vi.fn(),
  };
  return { handlers, worker: superviseWorker(handlers) };
}

/** n 回目の作り直しまで待つ（作り直す前に待つ長さは、続けて止まった回数をかける） */
const waitRestart = (n: number) => vi.advanceTimersByTime(WORKER_RESTART_DELAY_MS * n);

beforeEach(() => {
  vi.useFakeTimers();
  installFakeWorker();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('superviseWorker', () => {
  it('passes the answers on', () => {
    const { handlers, worker } = supervise();
    expect(worker.post(request(1))).toBe(true);
    FakeWorker.instances[0]!.reply();
    expect(handlers.onMessage).toHaveBeenCalledWith(expect.objectContaining({ seq: 1 }));
  });

  it('makes a new worker after a crash, and does not send while waiting for it', () => {
    const { handlers, worker } = supervise();
    worker.post(request(1));
    FakeWorker.instances[0]!.crash('落ちた');
    expect(FakeWorker.instances[0]!.terminated).toBe(true);
    expect(worker.post(request(2))).toBe(false);
    waitRestart(1);
    expect(handlers.onRestart).toHaveBeenCalledWith('落ちた');
    expect(liveWorkers()).toHaveLength(1);
    expect(worker.post(request(3))).toBe(true);
    expect(liveWorkers()[0]!.posted.map((r) => r.seq)).toEqual([3]);
  });

  it('treats a request with no answer for WORKER_HANG_MS as a stop', () => {
    const { handlers, worker } = supervise();
    worker.post(request(1));
    vi.advanceTimersByTime(WORKER_HANG_MS);
    expect(FakeWorker.instances[0]!.terminated).toBe(true);
    waitRestart(1);
    expect(handlers.onRestart).toHaveBeenCalledWith(expect.stringContaining('答えがありません'));
  });

  it('gives up after WORKER_MAX_RESTARTS restarts in a row, and an answer resets the count', () => {
    const { handlers, worker } = supervise();
    for (let n = 1; n <= WORKER_MAX_RESTARTS; n++) {
      liveWorkers()[0]!.crash();
      waitRestart(n);
    }
    // 答えが届いたので、数え直す
    worker.post(request(1));
    liveWorkers()[0]!.reply();
    for (let n = 1; n <= WORKER_MAX_RESTARTS; n++) {
      liveWorkers()[0]!.crash();
      waitRestart(n);
    }
    expect(handlers.onGiveUp).not.toHaveBeenCalled();
    liveWorkers()[0]!.crash('また落ちた');
    expect(handlers.onGiveUp).toHaveBeenCalledWith(expect.stringContaining('また落ちた'));
    expect(handlers.onRestart).toHaveBeenCalledTimes(2 * WORKER_MAX_RESTARTS);
    expect(liveWorkers()).toHaveLength(0);
  });

  it('treats a worker that cannot be made as a stop, on the first try', () => {
    FakeWorker.failCreates = 1;
    const { handlers, worker } = supervise();
    expect(worker.post(request(1))).toBe(false);
    waitRestart(1);
    expect(handlers.onRestart).toHaveBeenCalledWith(expect.stringContaining('Worker を作れません'));
    expect(worker.post(request(2))).toBe(true);
  });

  it('treats a worker that cannot be made as a stop, when restarting', () => {
    const { handlers, worker } = supervise();
    worker.post(request(1));
    FakeWorker.failCreates = Infinity;
    FakeWorker.instances[0]!.crash();
    vi.runAllTimers();
    expect(handlers.onRestart).not.toHaveBeenCalled();
    expect(handlers.onGiveUp).toHaveBeenCalledWith(expect.stringContaining('Worker を作れません'));
  });

  it('does not restart on messageerror', () => {
    const { handlers } = supervise();
    FakeWorker.instances[0]!.dispatchEvent(new Event('messageerror'));
    expect(handlers.onMessageError).toHaveBeenCalledOnce();
    expect(FakeWorker.instances[0]!.terminated).toBe(false);
  });

  it('stops the worker and the timers on dispose', () => {
    const { handlers, worker } = supervise();
    worker.post(request(1));
    FakeWorker.instances[0]!.crash();
    worker.dispose();
    vi.advanceTimersByTime(WORKER_HANG_MS);
    expect(FakeWorker.instances).toHaveLength(1);
    expect(handlers.onRestart).not.toHaveBeenCalled();
  });
});
