// 複数の編成の計算（全編成の合計 = usePartyTotals、最適編成計算 = OptimalPartyPanel）: Web Worker（worker.ts）を workers 個持ち、1 件ずつ手の空いた Worker に渡す。
// 入力が変わったら、計算中の件の答えは待って捨て、新しい入力の分を始めからやり直す（Worker に待ちの列を積まない）。
// 全部の答えが揃うまでは前の結果を出したまま computing を立てる。null の入力（空の編成・読み込み中）は計算せず、結果も null。
// 覚えている結果（ComputeCache）がある入力は計算しない（編成を切り替えた・今の編成だけ変えたときに、ほかの編成を計算し直さない）
// 覚えている結果は、入力が変わった最初の描画から出す
import type { TeamInput } from '@nikke/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { superviseWorker, type SupervisedWorker } from './computeWorker.ts';
import { errorMessage, type ComputeCache, type Computed } from './compute.ts';

type Inputs = readonly (TeamInput | null)[];
/** next: 次に見る入力の位置。retry: 止まった Worker から取り戻した件（先にやり直す） */
type Job = { inputs: Inputs; results: (Computed | null)[]; next: number; retry: number[] };
type Slot = {
  worker: SupervisedWorker | null;
  inFlight: { seq: number; job: Job; index: number } | null;
  dead: boolean;
};

/** 最適編成計算のように数百件を回すときの Worker の数。画面の分に 1 コア残し、最大 8 */
export function batchWorkerCount(): number {
  const cores = typeof navigator === 'undefined' ? 2 : (navigator.hardwareConcurrency ?? 2);
  return Math.min(8, Math.max(1, cores - 1));
}

export function useBatchComputation(
  inputs: Inputs,
  cache: ComputeCache,
  workers = 1,
): {
  results: readonly (Computed | null)[] | null;
  /** 入力ごとに、いまの入力の結果がまだ無いか（出しているのは前の結果か、何も無い） */
  pending: readonly boolean[];
  computing: boolean;
} {
  const [shown, setShown] = useState<{ inputs: Inputs; results: readonly (Computed | null)[] } | null>(null);
  const startRef = useRef<((job: Job) => void) | null>(null);

  useEffect(() => {
    let seq = 0;
    let current: Job | null = null;
    let giveUpMessage = '';
    const slots: Slot[] = Array.from({ length: Math.max(1, workers) }, () => ({
      worker: null,
      inFlight: null,
      dead: false,
    }));

    /** 次にやる件の位置（覚えている結果がある件は、その場で埋めて飛ばす）。もう無ければ undefined */
    const take = (job: Job): number | undefined => {
      const retried = job.retry.shift();
      if (retried !== undefined) return retried;
      for (; job.next < job.inputs.length; job.next++) {
        const input = job.inputs[job.next];
        if (input === null || input === undefined) continue;
        const hit = cache.get(input);
        if (hit === undefined) return job.next++;
        job.results[job.next] = hit;
      }
      return undefined;
    };

    const pump = () => {
      if (current === null) return;
      const job = current;
      const allDead = slots.every((s) => s.dead);
      let exhausted = false;
      for (const slot of slots) {
        if (slot.dead) continue;
        while (slot.inFlight === null) {
          const index = take(job);
          if (index === undefined) {
            exhausted = true;
            break;
          }
          slot.inFlight = { seq: ++seq, job, index };
          try {
            slot.worker!.post({ seq: slot.inFlight.seq, input: job.inputs[index]! });
          } catch (e) {
            // 構造化複製できない入力（DataCloneError）など
            job.results[index] = { ok: false, error: errorMessage(e) };
            slot.inFlight = null;
          }
        }
      }
      if (allDead) {
        // 動く Worker がもう無い。残りの件は失敗にして終える
        for (let index = take(job); index !== undefined; index = take(job)) {
          job.results[index] = { ok: false, error: giveUpMessage };
        }
        exhausted = true;
      }
      if (exhausted && !slots.some((s) => s.inFlight?.job === job)) {
        current = null;
        setShown({ inputs: job.inputs, results: job.results });
      }
    };

    slots.forEach((slot) => {
      // 動いていた 1 件を取り戻して、やり直しの列に積む
      const reclaim = () => {
        if (slot.inFlight === null) return;
        if (slot.inFlight.job === current) slot.inFlight.job.retry.push(slot.inFlight.index);
        slot.inFlight = null;
      };
      slot.worker = superviseWorker({
        onMessage: (data) => {
          if (slot.inFlight === null || data.seq !== slot.inFlight.seq) return;
          const { job, index } = slot.inFlight;
          slot.inFlight = null;
          job.results[index] = data.computed;
          if (data.computed.ok) cache.set(job.inputs[index]!, data.computed);
          pump();
        },
        onMessageError: () => {
          if (slot.inFlight !== null)
            slot.inFlight.job.results[slot.inFlight.index] = { ok: false, error: '計算の結果を受け取れませんでした' };
          slot.inFlight = null;
          pump();
        },
        // 止まった Worker に送った 1 件は答えが来ないので、その件を取り戻して、作り直した Worker（かほかの Worker）でやり直す
        onRestart: () => {
          reclaim();
          pump();
        },
        // この Worker はもう使えない。その件はほかの Worker に回す（全部使えなければ pump が失敗にして終える）
        onGiveUp: (message) => {
          giveUpMessage = message;
          slot.dead = true;
          reclaim();
          pump();
        },
      });
    });

    startRef.current = (job) => {
      current = job;
      pump();
    };
    return () => {
      startRef.current = null;
      for (const slot of slots) slot.worker?.dispose();
    };
  }, [cache, workers]);

  useEffect(() => {
    startRef.current?.({ inputs, results: inputs.map(() => null), next: 0, retry: [] });
  }, [inputs]);

  // 入力が変わった直後の描画では、覚えている結果をその場で出す（effect を待つと、前の入力の結果を別の並びに当てて描く）。
  // 覚えていない入力は、前の結果のその位置を出したまま computing を立てる
  return useMemo(() => {
    if (shown?.inputs === inputs) return { results: shown.results, pending: inputs.map(() => false), computing: false };
    const pending = inputs.map(() => false);
    const results = inputs.map((input, i) => {
      if (input === null) return null;
      const hit = cache.get(input);
      if (hit !== undefined) return hit;
      pending[i] = true;
      return shown?.results[i] ?? null;
    });
    const computing = pending.includes(true);
    return { results: shown === null && computing ? null : results, pending, computing };
  }, [shown, inputs, cache]);
}
