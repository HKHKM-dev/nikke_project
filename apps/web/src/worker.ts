// (B) の段 B-2（plan/design-unify-sim-calc.md 6.2 節）: 画面の計算を回す Web Worker。useTeamComputation.ts が作る
import { respond, type ComputeRequest } from './compute.ts';

self.addEventListener('message', (e: MessageEvent<ComputeRequest>) =>
  respond(e.data, (response) => self.postMessage(response)),
);
