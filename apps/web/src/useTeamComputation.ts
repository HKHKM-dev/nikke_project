// 画面の計算を Web Worker で回す（plan/design-unify-sim-calc.md 6.2 節）。
// 計算が終わるまでは前の結果を出したまま computing を立てる。最初の結果が届くまでは shown が null。
// 結果は、その計算の元（source。画面では CalcView）と組で返す。前の入力の結果を出している間に、いまの入力の値と
// 混ぜて描かないため（混ぜると、編成を切り替えた直後に、前の編成のキャラにいまの編成の宝物の段階を当てて落ちる）
import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import {
  LatestComputeQueue,
  type ComputeCache,
  type ComputeResponse,
  type ComputeSource,
  type Shown,
} from './compute.ts';

/** cache: 覚えている結果（compute.ts）。同じ入力は計算せずに出し、計算した結果は覚える */
export function useTeamComputation<T extends ComputeSource>(
  source: T,
  cache: ComputeCache,
): { shown: Shown<T> | null; computing: boolean } {
  const [shown, setShown] = useState<Shown<T> | null>(null);
  const [computing, setComputing] = useState(true);
  const queueRef = useRef<LatestComputeQueue<T> | null>(null);

  useEffect(() => {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    const queue = new LatestComputeQueue<T>(
      (request) => worker.postMessage(request),
      // 結果の表は大きいので、描き直しは入力の表示より後でよい。印は結果と一緒に消す
      (computed, from) => {
        // 覚えるのは計算できた結果だけ（Worker の停止などのエラーは、その時だけのもの）
        if (computed.ok) cache.set(from.input, computed);
        startTransition(() => {
          setShown({ computed, source: from });
          setComputing(false);
        });
      },
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
  }, [cache]);

  useEffect(() => {
    const queue = queueRef.current;
    if (queue === null) return;
    const hit = cache.get(source.input);
    if (hit === undefined) queue.request(source);
    else queue.resolve(source, hit);
    setComputing(queue.busy);
  }, [source, cache]);

  // 覚えている結果がある入力は、描くときにその場で出す（effect で出すと、切り替えた直後の描画に前の入力の結果が混ざる）
  const hit = useMemo(() => (shown?.source === source ? undefined : cache.get(source.input)), [shown, source, cache]);
  return hit === undefined ? { shown, computing } : { shown: { computed: hit, source }, computing: false };
}
