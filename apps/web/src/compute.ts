// (B) の段 B-2（plan/design-unify-sim-calc.md 6.2 節）: 画面の計算。Web Worker（worker.ts）とテストの両方がこれを呼ぶ。
// 使うのは core の関数だけ。入力（TeamInput）は構造化複製で Worker に渡り、返すのは画面が読む形（TeamResult）だけで、
// SimResult（射撃の列・ゲージの記録）は返さない（3.5 節。複製が重い）
import { runSimulation, simTeamResult, type TeamInput, type TeamResult } from '@nikke/core';

export type Computed = { ok: true; result: TeamResult } | { ok: false; error: string };

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function compute(input: TeamInput): Computed {
  try {
    return { ok: true, result: simTeamResult(input, runSimulation(input)) };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/** 画面 → Worker。seq は要求の通し番号 */
export type ComputeRequest = { seq: number; input: TeamInput };
/** Worker → 画面。seq は答えた要求の通し番号 */
export type ComputeResponse = { seq: number; computed: Computed };

/**
 * Worker が 1 件の要求に答える（worker.ts）。結果を送れなかったとき（構造化複製できない結果など）は、その要求にエラーの答えを返す。
 * Worker の error にしないので、画面が error を受けるのは Worker が本当に止まったとき（読み込みの失敗など）だけになる（LatestComputeQueue.stop）
 */
export function respond(request: ComputeRequest, post: (response: ComputeResponse) => void): void {
  const computed = compute(request.input);
  try {
    post({ seq: request.seq, computed });
  } catch (e) {
    post({ seq: request.seq, computed: { ok: false, error: `計算の結果を送れませんでした: ${errorMessage(e)}` } });
  }
}

/**
 * Worker に出す要求の順番を決める。Worker に渡すのは同時に 1 件だけで、計算中に来た入力は最後の 1 件だけを残す。
 * 計算中に新しい入力が来ていたら、届いた結果は古いので捨て、残した入力を出す（連打の間の値は計算しない）
 */
export class LatestComputeQueue {
  #seq = 0;
  #inFlight: number | null = null;
  #pending: TeamInput | null = null;
  #stopped: string | null = null;
  readonly #send: (request: ComputeRequest) => void;
  readonly #deliver: (computed: Computed) => void;

  constructor(send: (request: ComputeRequest) => void, deliver: (computed: Computed) => void) {
    this.#send = send;
    this.#deliver = deliver;
  }

  /** 計算中か（前の結果を出したまま「計算中」の印を出す） */
  get busy(): boolean {
    return this.#inFlight !== null;
  }

  request(input: TeamInput): void {
    if (this.#stopped !== null) {
      this.#deliver({ ok: false, error: this.#stopped });
      return;
    }
    this.#pending = input;
    if (this.#inFlight === null) this.#flush();
  }

  receive(response: ComputeResponse): void {
    if (response.seq !== this.#inFlight) return;
    this.#inFlight = null;
    if (this.#pending !== null) {
      this.#flush();
      return;
    }
    this.#deliver(response.computed);
  }

  /** 計算中の要求に答えが届かないとき（結果を受け取れないなど）。待っている入力も捨てて、エラーを出す。次の入力はまた送る */
  fail(error: string): void {
    this.#inFlight = null;
    this.#pending = null;
    this.#deliver({ ok: false, error });
  }

  /**
   * Worker が止まったとき（読み込みの失敗など）。止まった Worker に送っても答えは来ないので、後の入力にも同じエラーをすぐ返す
   * （送ると計算中のまま戻らない）
   */
  stop(error: string): void {
    this.#stopped = error;
    this.fail(error);
  }

  #flush(): void {
    const input = this.#pending!;
    this.#pending = null;
    const seq = ++this.#seq;
    try {
      this.#send({ seq, input });
      this.#inFlight = seq;
    } catch (e) {
      // 構造化複製できない入力（DataCloneError）など
      this.#deliver({ ok: false, error: errorMessage(e) });
    }
  }
}
