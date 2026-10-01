// plan/verifications.md の検証記録の項に足す行（予測との比べ・最小構成の警告）を 1 か所で組む（records-check とテストが共有）。
import { renderMinimalLines, type MinimalWarning } from './minimal.ts';
import type { Observation } from './observations.ts';
import { comparePredictions, renderPredictionLines, type PredictionFile } from './predictions.ts';

export function verificationExtraLines(
  observations: readonly Observation[],
  predictions: readonly PredictionFile[],
  warnings: readonly MinimalWarning[],
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const p of predictions) out.set(p.verification, renderPredictionLines(comparePredictions(p, observations)));
  const ids = [...new Set(warnings.map((w) => w.verification))];
  for (const id of ids) {
    const own = warnings.filter((w) => w.verification === id);
    out.set(id, [...(out.get(id) ?? []), ...renderMinimalLines(own)]);
  }
  return out;
}
