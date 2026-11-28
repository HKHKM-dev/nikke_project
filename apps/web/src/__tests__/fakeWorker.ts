// 計算の Worker（computeWorker.ts の new Worker）の代わり。テストが答え・異常終了・作れないことを起こす。
// installFakeWorker で Worker を差し替え、テストの後に vi.unstubAllGlobals で戻す（vitest はファイルごとに隔離しない）
import { vi } from 'vitest';
import type { ComputeRequest, ComputeResponse, Computed } from '../compute.ts';

export class FakeWorker extends EventTarget {
  /** 作った順の Worker */
  static instances: FakeWorker[] = [];
  /** これが 0 より大きい間は、作ると投げる（1 回ごとに 1 減らす。Infinity ならずっと投げる） */
  static failCreates = 0;

  readonly posted: ComputeRequest[] = [];
  terminated = false;

  constructor() {
    super();
    if (FakeWorker.failCreates > 0) {
      FakeWorker.failCreates -= 1;
      throw new Error('Worker を作れない');
    }
    FakeWorker.instances.push(this);
  }

  postMessage(request: ComputeRequest): void {
    this.posted.push(request);
  }

  terminate(): void {
    this.terminated = true;
  }

  /** 最後に受けた要求 */
  get last(): ComputeRequest | undefined {
    return this.posted.at(-1);
  }

  /** 最後に受けた要求に答える（computed を省くと、入力の total を総ダメージにした結果） */
  reply(computed?: Computed): void {
    const request = this.last!;
    const total = (request.input as unknown as { total?: number }).total ?? 0;
    const data: ComputeResponse = {
      seq: request.seq,
      computed: computed ?? { ok: true, result: { totalDamage: total, slots: [], enemyNotes: [] } },
    };
    this.dispatchEvent(new MessageEvent('message', { data }));
  }

  /** 異常終了（error イベント） */
  crash(message = '落ちた'): void {
    this.dispatchEvent(Object.assign(new Event('error'), { message }));
  }
}

export function installFakeWorker(): void {
  FakeWorker.instances = [];
  FakeWorker.failCreates = 0;
  vi.stubGlobal('Worker', FakeWorker);
}

/** 動いている（止めていない）Worker */
export function liveWorkers(): FakeWorker[] {
  return FakeWorker.instances.filter((w) => !w.terminated);
}
