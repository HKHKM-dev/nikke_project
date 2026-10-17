// plan/verifications.md の検証記録の項に足す行（予測との比べ）を 1 か所で組む（records-check とテストが共有）。
// 最小構成の警告は plan/minimal.md に移した（plan/design-minimal-relevance.md 5 節）。
import type { Observation, RecordsData } from './observations.ts';
import {
  comparePredictions,
  predictionStaleness,
  renderPredictionLines,
  type PredictionFile,
  type Staleness,
} from './predictions.ts';
import type { Verification } from './verifications.ts';

/** 開いている検証（調査中・保留）の ID */
export function openVerificationIds(verifications: readonly Verification[]): Set<string> {
  return new Set(verifications.filter((v) => v.state === '調査中' || v.state === '保留').map((v) => v.id));
}

/**
 * 予測の後のモデルの変更（plan/design-prediction-staleness.md 2 節）: 開いている検証の予測だけ、いまのモデルで出し直して
 * 保存した値と比べる。閉じた検証の予測は、そのときの撮影計画の記録として見ない
 */
export function openStaleness(
  predictions: readonly PredictionFile[],
  openIds: ReadonlySet<string>,
  data: RecordsData,
): Map<string, Staleness> {
  const out = new Map<string, Staleness>();
  for (const p of predictions) {
    if (!openIds.has(p.verification)) continue;
    const s = predictionStaleness(p, data);
    if (s !== undefined) out.set(p.verification, s);
  }
  return out;
}

export function verificationExtraLines(
  observations: readonly Observation[],
  predictions: readonly PredictionFile[],
  /** 検証記録 ID → 予測の後のモデルの変更（openStaleness） */
  staleness: ReadonlyMap<string, Staleness> = new Map(),
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const p of predictions)
    out.set(p.verification, renderPredictionLines(comparePredictions(p, observations, staleness.get(p.verification))));
  return out;
}
