// 画面の計算（plan/design-unify-sim-calc.md 6.2 節）。Web Worker（worker.ts）とテストの両方がこれを呼ぶ。
// 使うのは core の関数だけ。入力（TeamInput）は構造化複製で Worker に渡り、返すのは画面が読むもの（ScreenResult）だけ
// （plan/design-ui-rebuild.md 5.1 節。内訳は CLI の npm run sim で見る）
import { runSimulation, simTeamResult, type ModelNote, type TeamInput, type TeamResult } from '@nikke/core';

/** スロットの結果のうち、画面が読むもの */
export type ScreenSlotResult = { resourceId: number; totalDamage: number; notes: ModelNote[] };

/** 計算の結果のうち、画面が読むもの（総ダメージ・スロットのダメージと注記・敵の出来事の注記） */
export type ScreenResult = {
  totalDamage: number;
  slots: (ScreenSlotResult | null)[];
  enemyNotes: ModelNote[];
};

export function screenResult(result: TeamResult): ScreenResult {
  return {
    totalDamage: result.totalDamage,
    slots: result.slots.map((s) =>
      s === null ? null : { resourceId: s.character.resourceId, totalDamage: s.totalDamage, notes: s.notes },
    ),
    enemyNotes: result.enemyNotes,
  };
}

export type Computed = { ok: true; result: ScreenResult } | { ok: false; error: string };

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function compute(input: TeamInput): Computed {
  try {
    return { ok: true, result: screenResult(simTeamResult(input, runSimulation(input))) };
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
 * 入力の鍵（ComputeCache）。中身が同じ入力は同じ鍵になる。JSON に無い値（Map・Set・NaN・Infinity・undefined）も
 * 取り違えないように印を付けて書く（JSON.stringify のままだと Map は {}、Infinity は null になり、違う入力が同じ鍵になる）
 */
export function inputKey(input: TeamInput): string {
  return JSON.stringify(input, (_key, value: unknown) => {
    if (value instanceof Map) return { $map: [...value.entries()] };
    if (value instanceof Set) return { $set: [...value.values()] };
    if (typeof value === 'number' && !Number.isFinite(value)) return { $number: String(value) };
    if (value === undefined) return { $undefined: true };
    return value;
  });
}

/**
 * 計算の結果を入力の鍵で覚える（編成を切り替えたとき・ほかの編成だけ変えたときに、同じ入力を計算し直さない）。
 * 今の編成の計算（useTeamComputation）と全編成の合計（useBatchComputation）で 1 つを共有する。
 * 鍵は入力のオブジェクトごとに 1 回だけ作り、結果は新しく使った順に limit 件まで残す
 */
export class ComputeCache {
  readonly #results = new Map<string, Computed>();
  readonly #keys = new WeakMap<TeamInput, string>();
  readonly #limit: number;

  constructor(limit = 16) {
    this.#limit = limit;
  }

  #key(input: TeamInput): string {
    let key = this.#keys.get(input);
    if (key === undefined) {
      key = inputKey(input);
      this.#keys.set(input, key);
    }
    return key;
  }

  get(input: TeamInput): Computed | undefined {
    const key = this.#key(input);
    const hit = this.#results.get(key);
    if (hit !== undefined) {
      this.#results.delete(key);
      this.#results.set(key, hit);
    }
    return hit;
  }

  set(input: TeamInput, computed: Computed): void {
    const key = this.#key(input);
    this.#results.delete(key);
    this.#results.set(key, computed);
    while (this.#results.size > this.#limit) this.#results.delete(this.#results.keys().next().value!);
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
  /** stale: 計算中に resolve で答えを出した要求（届いた結果は捨てる） */
  #inFlight: { seq: number; source: T; stale: boolean } | null = null;
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
    return this.#inFlight !== null && !this.#inFlight.stale;
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

  /**
   * 計算せずに答えが分かった元（ComputeCache で覚えていた結果）。すぐ渡し、待っている入力は捨てる。計算中の要求の結果は、
   * 届いても古いので捨てる
   */
  resolve(source: T, computed: Computed): void {
    this.#latest = source;
    this.#pending = null;
    if (this.#inFlight !== null) this.#inFlight.stale = true;
    this.#deliver(computed, source);
  }

  receive(response: ComputeResponse): void {
    if (this.#inFlight === null || response.seq !== this.#inFlight.seq) return;
    const { source, stale } = this.#inFlight;
    this.#inFlight = null;
    if (stale && this.#pending === null) return;
    if (this.#pending !== null) {
      this.#flush();
      return;
    }
    this.#deliver(response.computed, source);
  }

  /** 計算中の要求に答えが届かないとき（結果を受け取れないなど）。待っている入力も捨てて、エラーを出す。次の入力はまた送る */
  fail(error: string): void {
    const stale = this.#inFlight?.stale === true && this.#pending === null;
    this.#inFlight = null;
    // resolve で答えを出した後の古い要求の失敗は、出した答えを上書きしない
    if (stale) return;
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
      this.#inFlight = { seq, source, stale: false };
    } catch (e) {
      // 構造化複製できない入力（DataCloneError）など
      this.#deliver({ ok: false, error: errorMessage(e) }, source);
    }
  }
}
