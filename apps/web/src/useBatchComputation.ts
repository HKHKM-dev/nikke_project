// 全編成の合計ダメージ（App.tsx）: 選んでいないほかの編成の計算を、1 つの Web Worker（worker.ts）で 1 件ずつ回す。
// 入力が変わったら、計算中の 1 件の答えを待って捨て、新しい入力の分を始めからやり直す（Worker に待ちの列を積まない）。
// 全部の答えが揃うまでは前の結果を出したまま computing を立てる。null の入力（空の編成・読み込み中）は計算せず、結果も null。
// 覚えている結果（ComputeCache）がある入力は計算しない（編成を切り替えた・今の編成だけ変えたときに、ほかの編成を計算し直さない）
// 覚えている結果は、入力が変わった最初の描画から出す
import type { TeamInput } from '@nikke/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { errorMessage, type ComputeCache, type ComputeResponse, type Computed } from './compute.ts';

type Inputs = readonly (TeamInput | null)[];
type Job = { inputs: Inputs; results: (Computed | null)[]; next: number };

export function useBatchComputation(
  inputs: Inputs,
  cache: ComputeCache,
): {
  results: readonly (Computed | null)[] | null;
  /** 入力ごとに、いまの入力の結果がまだ無いか（出しているのは前の結果か、何も無い） */
  pending: readonly boolean[];
  computing: boolean;
} {
  const [shown, setShown] = useState<{ inputs: Inputs; results: readonly (Computed | null)[] } | null>(null);
  const startRef = useRef<((job: Job) => void) | null>(null);

  useEffect(() => {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    let seq = 0;
    let current: Job | null = null;
    let inFlight: { seq: number; job: Job; index: number } | null = null;
    let stopped: string | null = null;

    const pump = () => {
      if (inFlight !== null || current === null) return;
      const job = current;
      for (; job.next < job.inputs.length; job.next++) {
        const input = job.inputs[job.next];
        if (input === null || input === undefined) continue;
        const hit = cache.get(input);
        if (hit === undefined) break;
        job.results[job.next] = hit;
      }
      if (job.next >= job.inputs.length) {
        current = null;
        setShown({ inputs: job.inputs, results: job.results });
        return;
      }
      const index = job.next++;
      if (stopped !== null) {
        job.results[index] = { ok: false, error: stopped };
        pump();
        return;
      }
      inFlight = { seq: ++seq, job, index };
      try {
        worker.postMessage({ seq: inFlight.seq, input: job.inputs[index] });
      } catch (e) {
        // 構造化複製できない入力（DataCloneError）など
        job.results[index] = { ok: false, error: errorMessage(e) };
        inFlight = null;
        pump();
      }
    };

    worker.addEventListener('message', (e: MessageEvent<ComputeResponse>) => {
      if (inFlight === null || e.data.seq !== inFlight.seq) return;
      const { job, index } = inFlight;
      inFlight = null;
      job.results[index] = e.data.computed;
      if (e.data.computed.ok) cache.set(job.inputs[index]!, e.data.computed);
      pump();
    });
    const fail = (error: string) => {
      if (inFlight !== null) inFlight.job.results[inFlight.index] = { ok: false, error };
      inFlight = null;
      pump();
    };
    worker.addEventListener('error', (e) => {
      stopped = `計算の Worker が止まりました（画面を読み込み直してください）: ${e.message || '不明なエラー'}`;
      fail(stopped);
    });
    worker.addEventListener('messageerror', () => fail('計算の結果を受け取れませんでした'));

    startRef.current = (job) => {
      current = job;
      pump();
    };
    return () => {
      startRef.current = null;
      worker.terminate();
    };
  }, [cache]);

  useEffect(() => {
    startRef.current?.({ inputs, results: inputs.map(() => null), next: 0 });
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
