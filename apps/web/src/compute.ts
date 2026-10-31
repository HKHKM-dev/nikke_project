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

/** 計算の要求の元。input を Worker に送り、結果はこの元と組にして返す（画面は、結果をその計算の入力と組で読む） */
export type ComputeSource = { readonly input: TeamInput };

/** 計算の結果と、その計算の元 */
export type Shown<T> = { computed: Computed; source: T };

/**
 * Worker に出す要求の順番を決める。Worker に渡すのは同時に 1 件だけで、計算中に来た入力は最後の 1 件だけを残す。
 * 計算中に新しい入力が来ていたら、届いた結果は古いので捨て、残した入力を出す（連打の間の値は計算しない）。
 * 結果は、その計算の元（source）と組にして渡す。エラーは、最後に受けた元と組にする（まだ何も受けていなければ渡さない）
 */
export class LatestComputeQueue<T extends ComputeSource = ComputeSource> {
  #seq = 0;
  #inFlight: { seq: number; source: T } | null = null;
  #pending: T | null = null;
  /** 最後に受けた元。エラーと組にする（待ちのないときに Worker が止まっても、エラーを出すため） */
  #latest: T | null = null;
  #stopped: string | null = null;
  readonly #send: (request: ComputeRequest) => void;
  readonly #deliver: (computed: Computed, source: T) => void;

  constructor(send: (request: ComputeRequest) => void, deliver: (computed: Computed, source: T) => void) {
    this.#send = send;
    this.#deliver = deliver;
  }

  /** 計算中か（前の結果を出したまま「計算中」の印を出す） */
  get busy(): boolean {
    return this.#inFlight !== null;
  }

  request(source: T): void {
    if (this.#stopped !== null) {
      this.#deliver({ ok: false, error: this.#stopped }, source);
      return;
    }
    this.#latest = source;
    this.#pending = source;
    if (this.#inFlight === null) this.#flush();
  }

  receive(response: ComputeResponse): void {
    if (this.#inFlight === null || response.seq !== this.#inFlight.seq) return;
    const { source } = this.#inFlight;
    this.#inFlight = null;
    if (this.#pending !== null) {
      this.#flush();
      return;
    }
    this.#deliver(response.computed, source);
  }

  /** 計算中の要求に答えが届かないとき（結果を受け取れないなど）。待っている入力も捨てて、エラーを出す。次の入力はまた送る */
  fail(error: string): void {
    this.#inFlight = null;
    this.#pending = null;
    if (this.#latest !== null) this.#deliver({ ok: false, error }, this.#latest);
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
    const source = this.#pending!;
    this.#pending = null;
    const seq = ++this.#seq;
    try {
      this.#send({ seq, input: source.input });
      this.#inFlight = { seq, source };
    } catch (e) {
      // 構造化複製できない入力（DataCloneError）など
      this.#deliver({ ok: false, error: errorMessage(e) }, source);
    }
  }
}
