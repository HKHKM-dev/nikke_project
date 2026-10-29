// fb-window-k.ts の計算（V-0492「読み方」の 4〜7）。fb-window-cores の着地点ごとの数から、K・K_out・R_B・R_A と σ を出す。
import { LANDINGS, type Landing, type LandingCount } from './recipes/fb-window-cores.ts';

export type RecordingCounts = { recording: string; counts: Record<Landing, LandingCount> };

/** fb-window-cores の観測値の値（24 個）を着地点ごとの数にする */
export function countsFromValue(value: readonly number[]): Record<Landing, LandingCount> {
  if (value.length !== LANDINGS.length * 4) throw new Error(`値は ${LANDINGS.length * 4} 個（${value.length} 個）`);
  return Object.fromEntries(
    LANDINGS.map((l, i) => [
      l,
      { inCores: value[i * 4]!, inHits: value[i * 4 + 1]!, outCores: value[i * 4 + 2]!, outHits: value[i * 4 + 3]! },
    ]),
  ) as Record<Landing, LandingCount>;
}

export type Side = 'in' | 'out';
const cores = (c: LandingCount, s: Side) => (s === 'in' ? c.inCores : c.outCores);
const hitsOf = (c: LandingCount, s: Side) => (s === 'in' ? c.inHits : c.outHits);

export type Ratio = {
  value: number;
  /** 2 項分布（target のコアの数と ctrl の率の両方の揺れ） */
  binomial: number;
  /** 対照の率が無くて除いた target のヒット */
  dropped: number;
  hits: number;
};

/**
 * target の side のコアの数 ÷ Σ（target の side の各ヒットに、ctrl の ctrlSide の同じ着地点の率を当てた値）。
 * ctrl に率が無い着地点の target のヒットは除く
 */
export function ratio(
  target: readonly RecordingCounts[],
  side: Side,
  ctrl: readonly RecordingCounts[],
  ctrlSide: Side,
): Ratio {
  let c = 0;
  let e = 0;
  let v = 0;
  let vc = 0;
  let dropped = 0;
  let hits = 0;
  for (const l of LANDINGS) {
    const tc = target.reduce((s, r) => s + cores(r.counts[l], side), 0);
    const th = target.reduce((s, r) => s + hitsOf(r.counts[l], side), 0);
    const cc = ctrl.reduce((s, r) => s + cores(r.counts[l], ctrlSide), 0);
    const ch = ctrl.reduce((s, r) => s + hitsOf(r.counts[l], ctrlSide), 0);
    if (th === 0) continue;
    if (ch === 0) {
      dropped += th;
      continue;
    }
    const p = cc / ch;
    c += tc;
    e += th * p;
    v += th * p * (1 - p);
    vc += (th * th * p * (1 - p)) / ch;
    hits += th;
  }
  const value = c / e;
  return { value, binomial: value * Math.sqrt(v / c ** 2 + vc / e ** 2), dropped, hits };
}

export type Estimate = Ratio & { jackknife: number; sigma: number; leaveOneOut: number[] };

/** ratio に、録画を 1 本ずつ抜いた jackknife の σ と、判定の σ（jackknife と 2 項分布の大きいほう）を足す */
export function estimate(
  target: readonly RecordingCounts[],
  side: Side,
  ctrl: readonly RecordingCounts[],
  ctrlSide: Side,
): Estimate {
  const full = ratio(target, side, ctrl, ctrlSide);
  const ids = [...new Set([...target, ...ctrl].map((r) => r.recording))];
  const loo = ids.map(
    (id) =>
      ratio(
        target.filter((r) => r.recording !== id),
        side,
        ctrl.filter((r) => r.recording !== id),
        ctrlSide,
      ).value,
  );
  const ok = loo.filter(Number.isFinite);
  const n = ok.length;
  const mean = ok.reduce((a, b) => a + b, 0) / n;
  const jackknife = n > 1 ? Math.sqrt(((n - 1) / n) * ok.reduce((a, k) => a + (k - mean) ** 2, 0)) : NaN;
  return { ...full, jackknife, sigma: Math.max(jackknife, full.binomial), leaveOneOut: loo };
}

const EMPTY: LandingCount = { inCores: 0, inHits: 0, outCores: 0, outHits: 0 };

/** landings に無い着地点の数を 0 にする（ratio は数の無い着地点を飛ばすので、その着地点を使わないのと同じ） */
export function restrictLandings(r: RecordingCounts, landings: readonly Landing[]): RecordingCounts {
  return {
    recording: r.recording,
    counts: Object.fromEntries(LANDINGS.map((l) => [l, landings.includes(l) ? r.counts[l] : EMPTY])) as Record<
      Landing,
      LandingCount
    >,
  };
}

/**
 * V-0492「読み方」の 4〜6: K・K_out（A ÷ B）と、参考の R_B・R_A（同じ録画の群の窓の中 ÷ 窓の外）。
 * landings を渡すと、その着地点だけで出す（V-0542「読み方」の 2・3）
 */
export function fbWindowK(
  allA: readonly RecordingCounts[],
  allB: readonly RecordingCounts[],
  landings: readonly Landing[] = LANDINGS,
) {
  const a = allA.map((r) => restrictLandings(r, landings));
  const b = allB.map((r) => restrictLandings(r, landings));
  return {
    k: estimate(a, 'in', b, 'in'),
    kOut: estimate(a, 'out', b, 'out'),
    rB: estimate(b, 'in', b, 'out'),
    rA: estimate(a, 'in', a, 'out'),
  };
}
