// plan/verifications.md の検証記録の項に足す行（予測との比べ）を 1 か所で組む（records-check とテストが共有）。
// 最小構成の警告は plan/minimal.md に移した（plan/design-minimal-relevance.md 5 節）。
import type { Observation } from './observations.ts';
import { comparePredictions, renderPredictionLines, type PredictionFile } from './predictions.ts';

export function verificationExtraLines(
  observations: readonly Observation[],
  predictions: readonly PredictionFile[],
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const p of predictions) out.set(p.verification, renderPredictionLines(comparePredictions(p, observations)));
  return out;
}
