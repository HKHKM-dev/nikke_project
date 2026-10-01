// SG の 1 トリガーの増分を、当たったペレットの数 h・会心・コアに分ける（純粋な関数。V-0062・V-0069・V-0070・V-0073 の読み方）。
//
// スペック固定 ON（units）: 1 ペレットの胴体 B の 0.1 倍を単位にすると、増分は整数 N になる。
//   近（距離ボーナス ×1.3）: N = 13h + 5u（u = 会心 + 2 × コア。会心は +5 単位、コアは +10 単位で、距離ボーナスは乗らない）。
//     h は一意に決まる（13h ≡ N (mod 5) から h は 5 おきの 2 候補になり、小さい方は u が 13 以上要るので大きい方を取る）。
//   近以外: N = 10h + 5u。h と u は分けられない（会心 2 個 = コア 1 個 = 胴体 1 個）。h は会心率・コア命中率を置いた見積もり。
// スペック固定 OFF（exact）: 会心の上乗せが胴体の半分でなく、コアが胴体 2 個より 1〜2 少ない（丸めで揺れる）ので、どの区間でも
//   h・会心・コアが増分から決まる。胴体と会心の上乗せは厳密、コアは ±slack の幅を持たせる。候補が複数のときは
//   h が最大（会心・コアが少ない）のものを取る（「余りが 1〜2 のトリガーをコア 1 個」の規則と同じ）。

export type UnitsSolution =
  | { kind: 'near'; h: number; u: number; N: number; alternatives: number }
  | { kind: 'far'; N: number }
  | { kind: 'none'; N: number };

/**
 * スペック固定 ON の分解。unit は B / 10。maxPellets は組の発の数 × 10。
 * 近として解けるときは near（h・u）、近以外の刻み（5 の倍数）に乗るときは far、どちらでもないときは none。
 * N が 5 の倍数のときは近でも解ける（h が 5 の倍数）ので、どちらにも読める。regimeOfUnits で扱う。
 */
export function solveUnits(
  increment: number,
  unit: number,
  near: boolean,
  maxPellets: number,
  eps = 0.05,
): UnitsSolution {
  const raw = increment / unit;
  const N = Math.round(raw);
  if (Math.abs(raw - N) > eps * Math.max(1, maxPellets / 10)) return { kind: 'none', N: raw };
  if (!near) return N % 5 === 0 && N >= 10 ? { kind: 'far', N } : { kind: 'none', N };
  const candidates: { h: number; u: number }[] = [];
  for (let h = maxPellets; h >= 1; h--) {
    const r = N - 13 * h;
    if (r < 0 || r % 5 !== 0) continue;
    const u = r / 5;
    if (u <= 3 * h) candidates.push({ h, u });
  }
  const best = candidates[0];
  return best === undefined ? { kind: 'none', N } : { kind: 'near', ...best, N, alternatives: candidates.length - 1 };
}

/**
 * スペック固定 ON の regime: 近の刻みにしか乗らない（N が 5 の倍数でない）なら near（確か）、5 の倍数なら far（近でも h が 5 の倍数なら
 * 5 の倍数になるので、確かではない）。窓で見るときは windowRegime の 'units' を使う
 */
export function regimeOfUnits(increment: number, unit: number, maxPellets: number): 'near' | 'far' | 'unknown' {
  const near = solveUnits(increment, unit, true, maxPellets);
  const far = solveUnits(increment, unit, false, maxPellets);
  if (near.kind === 'near' && far.kind !== 'far') return 'near';
  if (far.kind === 'far') return 'far';
  return 'unknown';
}

export type ExactValues = {
  /** 胴体の 1 ペレット */
  body: number;
  /** 会心の上乗せ（会心の 1 ペレット − 胴体） */
  critAdd: number;
  /** コアの上乗せの最小（コアの 1 ペレット − 胴体。画面のコアの値は胴体 2 個より 2 少ない） */
  coreAdd: number;
  /** コアの 1 ペレットが coreAdd より多くなりうる幅（0〜slack。V-0070 の録画では 2B − 2〜2B） */
  slack: number;
};

export type ExactSolution =
  { kind: 'ok'; h: number; c: number; k: number; residual: number; alternatives: number } | { kind: 'none' };

/**
 * スペック固定 OFF の分解。values は、その区間の 1 ペレットの値（近は胴体だけ ×1.3）。
 * 会心かつコアのペレットは、会心 1 とコア 1 の 2 個と同じ値（胴体 1 個ぶんの差）とみなす。h・会心の数・コアの数は同じになる。
 * 残差（増分 − 計算値）は 0 以上、コアの数 × slack 以下を許す（コアの値が 1〜2 揺れる）。候補が複数なら h が最大、次にコアが
 * 少ないもの（「余りが 1〜2 のトリガーをコア 1 個」の規則と同じ）。
 */
export function solveExact(increment: number, values: ExactValues, maxPellets: number): ExactSolution {
  const candidates: { h: number; c: number; k: number; residual: number }[] = [];
  for (let h = maxPellets; h >= 1; h--) {
    for (let k = 0; k <= h; k++) {
      for (let c = 0; c <= h; c++) {
        if (c + k > h + Math.min(c, k)) continue;
        const residual = increment - (h * values.body + c * values.critAdd + k * values.coreAdd);
        if (residual >= 0 && residual <= values.slack * k) candidates.push({ h, c, k, residual });
      }
    }
  }
  const best = candidates[0];
  return best === undefined ? { kind: 'none' } : { kind: 'ok', ...best, alternatives: candidates.length - 1 };
}

/**
 * 会心の上乗せを、増分に厳密に合う発が最も多くなるように決める（画面の数値の ±range。V-0070 の 110〜112 では、画面の会心の
 * 数値と HUD の増分の刻みが 1 違う）。bodies は胴体の候補（近は ×1.3 の切り捨てと切り上げ）。コアの上乗せは動かさず、
 * 合う発はコア無しで数える（コアの揺れを許すと何でも合う）。
 */
export function calibrateExact(
  increments: readonly { increment: number; maxPellets: number }[],
  bodies: readonly number[],
  critAddHint: number,
  coreAdd: number,
  slack: number,
  range = 3,
): ExactValues & { fits: number } {
  let best: (ExactValues & { fits: number }) | undefined;
  for (const body of bodies) {
    for (let critAdd = critAddHint - range; critAdd <= critAddHint + range; critAdd++) {
      // コアの揺れを許すと何でも合ってしまうので、胴体と会心だけ（コア 0）で厳密に合う発を数える
      const exact: ExactValues = { body, critAdd, coreAdd, slack: 0 };
      const fits = increments.filter((g) => {
        const sol = solveExact(g.increment, exact, g.maxPellets);
        return sol.kind === 'ok' && sol.k === 0;
      }).length;
      if (best === undefined || fits > best.fits) best = { body, critAdd, coreAdd, slack, fits };
    }
  }
  return best!;
}

/**
 * スペック固定 OFF の regime。近の 10 ペレット（1.3B × 10 = 13B）は、近以外の 7 ペレット + コア 3 個とも読めるので、両方に解ける発は
 * unknown。近以外の発が近に解けることは無い（刻みが合わない）ので、far は確か
 */
export function regimeOfExact(
  increment: number,
  nearValues: ExactValues,
  farValues: ExactValues,
  maxPellets: number,
): 'near' | 'far' | 'unknown' {
  const near = solveExact(increment, nearValues, maxPellets).kind === 'ok';
  const far = solveExact(increment, farValues, maxPellets).kind === 'ok';
  if (near && !far) return 'near';
  if (far && !near) return 'far';
  return 'unknown';
}

/** 当たったペレットが 10・9・8・7 以下だったトリガーの数（V-0069 の近の分布。発の数が 1 の組だけ数える） */
export function distribution(hits: readonly number[]): [number, number, number, number] {
  const out: [number, number, number, number] = [0, 0, 0, 0];
  for (const h of hits) {
    if (h >= 10) out[0]++;
    else if (h === 9) out[1]++;
    else if (h === 8) out[2]++;
    else out[3]++;
  }
  return out;
}
