// (B) の段 B-2（plan/design-unify-sim-calc.md 6.2 節）: 画面の計算を回す Web Worker。useTeamComputation.ts が作る
import { compute, type ComputeRequest, type ComputeResponse } from './compute.ts';

self.addEventListener('message', (e: MessageEvent<ComputeRequest>) => {
  const response: ComputeResponse = { seq: e.data.seq, computed: compute(e.data.input) };
  self.postMessage(response);
});
