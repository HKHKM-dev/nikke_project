// (B) の段 B-2（plan/design-unify-sim-calc.md 6.2 節）: 画面の計算を Web Worker で回す。
// 計算が終わるまでは前の結果を出したまま computing を立てる。最初の結果が届くまでは computed が null
import type { TeamInput } from '@nikke/core';
import { startTransition, useEffect, useRef, useState } from 'react';
import { LatestComputeQueue, type Computed, type ComputeResponse } from './compute.ts';

export function useTeamComputation(input: TeamInput): { computed: Computed | null; computing: boolean } {
  const [computed, setComputed] = useState<Computed | null>(null);
  const [computing, setComputing] = useState(true);
  const queueRef = useRef<LatestComputeQueue | null>(null);

  useEffect(() => {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    const queue = new LatestComputeQueue(
      (request) => worker.postMessage(request),
      // 結果の表は大きいので、描き直しは入力の表示より後でよい。印は結果と一緒に消す
      (result) =>
        startTransition(() => {
          setComputed(result);
          setComputing(false);
        }),
    );
    worker.addEventListener('message', (e: MessageEvent<ComputeResponse>) => queue.receive(e.data));
    worker.addEventListener('error', (e) => queue.fail(`計算の Worker が止まりました: ${e.message || '不明なエラー'}`));
    worker.addEventListener('messageerror', () => queue.fail('計算の結果を受け取れませんでした'));
    queueRef.current = queue;
    return () => {
      queueRef.current = null;
      worker.terminate();
    };
  }, []);

  useEffect(() => {
    const queue = queueRef.current;
    if (queue === null) return;
    queue.request(input);
    setComputing(queue.busy);
  }, [input]);

  return { computed, computing };
}
