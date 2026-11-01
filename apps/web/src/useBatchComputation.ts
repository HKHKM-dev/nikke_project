// 全編成の合計ダメージ（App.tsx）: 選んでいないほかの編成の計算を、1 つの Web Worker（worker.ts）で 1 件ずつ回す。
// 入力が変わったら、計算中の 1 件の答えを待って捨て、新しい入力の分を始めからやり直す（Worker に待ちの列を積まない）。
// 全部の答えが揃うまでは前の結果を出したまま computing を立てる。null の入力（空の編成・読み込み中）は計算せず、結果も null
import type { TeamInput } from '@nikke/core';
import { useEffect, useRef, useState } from 'react';
import { errorMessage, type ComputeResponse, type Computed } from './compute.ts';

type Inputs = readonly (TeamInput | null)[];
type Job = { inputs: Inputs; results: (Computed | null)[]; next: number };

export function useBatchComputation(inputs: Inputs): {
  results: readonly (Computed | null)[] | null;
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
      while (job.next < job.inputs.length && job.inputs[job.next] === null) job.next++;
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
  }, []);

  useEffect(() => {
    startRef.current?.({ inputs, results: inputs.map(() => null), next: 0 });
  }, [inputs]);

  return { results: shown?.results ?? null, computing: shown?.inputs !== inputs };
}
