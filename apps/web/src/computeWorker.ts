// 計算の Web Worker（worker.ts）を 1 つ持ち、止まったら作り直す。画面の計算（useTeamComputation）と全編成の合計（useBatchComputation）が使う。
// 止まるのは、読み込みの失敗・異常終了（error イベント）と、要求に答えが来ないとき（WORKER_HANG_MS の間）。
// 止まったら Worker を捨てて、少し待ってから作り直し、onRestart を呼ぶ（呼び手が、答えの来なかった要求を送り直す）。
// 作り直しが WORKER_MAX_RESTARTS 回続けて失敗したら、あきらめて onGiveUp を呼ぶ。Worker から答えが 1 つでも届けば、失敗の数は 0 に戻す
import {
  WORKER_HANG_MS,
  WORKER_MAX_RESTARTS,
  WORKER_RESTART_DELAY_MS,
  type ComputeRequest,
  type ComputeResponse,
} from './compute.ts';

export type SupervisedWorker = {
  /** 要求を送る。作り直しを待っている間は送らない（onRestart で送り直す）。構造化複製できない入力は、そのまま throw する */
  post(request: ComputeRequest): void;
  dispose(): void;
};

export function superviseWorker(handlers: {
  onMessage(response: ComputeResponse): void;
  /** 結果を受け取れなかった（messageerror）。Worker は生きているので、作り直さない */
  onMessageError(): void;
  /** Worker を作り直した。答えの来なかった要求を送り直す */
  onRestart(): void;
  /** 作り直してもだめだった。止まったままにする */
  onGiveUp(message: string): void;
}): SupervisedWorker {
  let worker: Worker | null = null;
  let failures = 0;
  let disposed = false;
  let restartTimer: ReturnType<typeof setTimeout> | undefined;
  let hangTimer: ReturnType<typeof setTimeout> | undefined;

  const disarm = () => {
    clearTimeout(hangTimer);
    hangTimer = undefined;
  };

  const fail = (reason: string) => {
    if (disposed) return;
    worker?.terminate();
    worker = null;
    disarm();
    failures += 1;
    if (failures > WORKER_MAX_RESTARTS) {
      handlers.onGiveUp(`計算の Worker が止まりました（画面を読み込み直してください）: ${reason}`);
      return;
    }
    restartTimer = setTimeout(() => {
      restartTimer = undefined;
      spawn();
      handlers.onRestart();
    }, WORKER_RESTART_DELAY_MS * failures);
  };

  const spawn = () => {
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    w.addEventListener('message', (e: MessageEvent<ComputeResponse>) => {
      if (w !== worker) return;
      failures = 0;
      disarm();
      handlers.onMessage(e.data);
    });
    w.addEventListener('error', (e) => {
      if (w === worker) fail(e.message || '不明なエラー');
    });
    w.addEventListener('messageerror', () => {
      if (w === worker) handlers.onMessageError();
    });
    worker = w;
  };
  spawn();

  return {
    post(request) {
      if (worker === null) return;
      worker.postMessage(request);
      // 答えが来るまでの時間を測り直す（来ないまま WORKER_HANG_MS たったら止まったと見なす）
      disarm();
      hangTimer = setTimeout(() => fail(`${WORKER_HANG_MS / 1000} 秒たっても答えがありません`), WORKER_HANG_MS);
    },
    dispose() {
      disposed = true;
      clearTimeout(restartTimer);
      disarm();
      worker?.terminate();
      worker = null;
    },
  };
}
