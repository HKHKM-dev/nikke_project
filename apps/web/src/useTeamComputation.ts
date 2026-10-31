// (B) の段 B-2（plan/design-unify-sim-calc.md 6.2 節）: 画面の計算を Web Worker で回す。
// 計算が終わるまでは前の結果を出したまま computing を立てる。最初の結果が届くまでは shown が null。
// 結果は、その計算の元（source。画面では CalcView）と組で返す。前の入力の結果を出している間に、いまの入力の値と
// 混ぜて描かないため（編成を切り替えた直後に、前の編成のキャラにいまの編成の宝物の段階を当てて落ちていた）
import { startTransition, useEffect, useRef, useState } from 'react';
import { LatestComputeQueue, type ComputeResponse, type ComputeSource, type Shown } from './compute.ts';

export function useTeamComputation<T extends ComputeSource>(source: T): { shown: Shown<T> | null; computing: boolean } {
  const [shown, setShown] = useState<Shown<T> | null>(null);
  const [computing, setComputing] = useState(true);
  const queueRef = useRef<LatestComputeQueue<T> | null>(null);

  useEffect(() => {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    const queue = new LatestComputeQueue<T>(
      (request) => worker.postMessage(request),
      // 結果の表は大きいので、描き直しは入力の表示より後でよい。印は結果と一緒に消す
      (computed, from) =>
        startTransition(() => {
          setShown({ computed, source: from });
          setComputing(false);
        }),
    );
    worker.addEventListener('message', (e: MessageEvent<ComputeResponse>) => queue.receive(e.data));
    worker.addEventListener('error', (e) =>
      queue.stop(`計算の Worker が止まりました（画面を読み込み直してください）: ${e.message || '不明なエラー'}`),
    );
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
    queue.request(source);
    setComputing(queue.busy);
  }, [source]);

  return { shown, computing };
}
