// RELOADING のバー（画面下中央）の読み取りの純粋な部分（plan/design-weapon-seconds.md 8 節）。reload.ts が使い、
// reload-bar.test.ts でテストする。録画は読まない。

export type BarOptions = {
  /** 白とみなす明るさ（min(R,G,B) がこれより大きい） */
  white: number;
  /** 列を白とみなす、白の画素の行数の下限 */
  minRows: number;
  /** バーの左端とみなす、crop の左からの位置の上限（これより右で始まる白は拾わない） */
  maxStart: number;
};

/**
 * 1 フレームの crop（rgb24）から、バーの長さ（px）を出す。
 * 列ごとに白の画素が minRows 行以上あれば白の列とし、maxStart までに始まる最初の白の列から続く白の列の数を長さにする
 */
export function barLength(rgb: Uint8Array, w: number, h: number, options: BarOptions): number {
  const isWhite = (x: number): boolean => {
    let rows = 0;
    for (let y = 0; y < h; y++) {
      const i = (y * w + x) * 3;
      if (Math.min(rgb[i]!, rgb[i + 1]!, rgb[i + 2]!) > options.white) rows++;
    }
    return rows >= options.minRows;
  };
  let start = -1;
  for (let x = 0; x <= Math.min(options.maxStart, w - 1); x++) {
    if (isWhite(x)) {
      start = x;
      break;
    }
  }
  if (start < 0) return 0;
  let x = start;
  while (x < w && isWhite(x)) x++;
  return x - start;
}

/** バーの 1 段（分割リロードでない武器は 1 回のリロードに 1 段） */
export type Chunk = {
  /** 見え始めたフレーム */
  start: number;
  /** 最後に見えたフレーム */
  last: number;
  /** バーが消えた（または空に戻った）フレーム = last + 1 */
  end: number;
  /** 最大の長さ（px） */
  max: number;
};

/** 1 回のリロード（段が近くに続くものをまとめる） */
export type Reload = { chunks: Chunk[] };

/** 段を分ける: 長さが 0 のフレーム、または前のフレームより dropPx 以上短くなったフレームで切る */
export function findChunks(lengths: readonly number[], firstFrame: number, dropPx = 20): Chunk[] {
  const out: Chunk[] = [];
  let current: Chunk | null = null;
  for (let i = 0; i < lengths.length; i++) {
    const len = lengths[i]!;
    const n = firstFrame + i;
    const prev = i > 0 ? lengths[i - 1]! : 0;
    const drop = current !== null && len > 0 && len < prev - dropPx;
    if (current !== null && (len === 0 || drop)) {
      out.push(current);
      current = null;
    }
    if (len > 0) {
      if (current === null) current = { start: n, last: n, end: n + 1, max: len };
      else {
        current.last = n;
        current.end = n + 1;
        current.max = Math.max(current.max, len);
      }
    }
  }
  if (current !== null) out.push(current);
  return out;
}

/** 段のあいだが maxGap フレーム以下なら 1 回のリロードにまとめる（分割リロードの段は 0〜数フレームで続く） */
export function groupReloads(chunks: readonly Chunk[], maxGap = 3): Reload[] {
  const out: Reload[] = [];
  for (const c of chunks) {
    const last = out.at(-1);
    if (last && c.start - last.chunks.at(-1)!.end <= maxGap) last.chunks.push(c);
    else out.push({ chunks: [c] });
  }
  return out;
}

/** 見えた最大の長さの代表（px）: 溝の幅以下で、最大の長さが上位の段（その最大の 90% 以上）の最大の長さの中央値。取り消しの判定と当てはめの範囲に使う */
export function fullLength(chunks: readonly Chunk[], trackPx: number): number {
  // 溝より長い白（戦闘の始まりの白い画面など）は数えない
  const maxes = chunks.map((c) => c.max).filter((m) => m <= trackPx);
  const top = Math.max(0, ...maxes);
  return median(maxes.filter((m) => m >= top * 0.9));
}

export type ChunkFit = {
  /** 伸び（px/f） */
  rate: number;
  /** 長さ 0 に遡ったフレーム（端数つき） */
  zero: number;
  /** 溝の幅 ÷ 伸び（バーが 0 から満ちるまでのフレーム数） */
  frames: number;
  /** 当てはめに使ったフレーム数 */
  points: number;
  /** 当てはめの残差の二乗平均の平方根（px） */
  rms: number;
};

/** 最小二乗の直線（y = intercept + rate × x）と残差の二乗平均の平方根。点が 3 つ未満なら null */
function leastSquares(
  xs: readonly number[],
  ys: readonly number[],
): { rate: number; intercept: number; rms: number } | null {
  if (xs.length < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < xs.length; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) ** 2;
  }
  if (sxx === 0) return null;
  const rate = sxy / sxx;
  const intercept = my - rate * mx;
  let ss = 0;
  for (let i = 0; i < xs.length; i++) ss += (ys[i]! - (intercept + rate * xs[i]!)) ** 2;
  return { rate, intercept, rms: Math.sqrt(ss / xs.length) };
}

export type FitOptions = {
  /** 当てはめに使う長さの範囲（見えた最大の長さに対する割合） */
  lo: number;
  hi: number;
  /** 当てはめ直すときに落とす残差（px）。Infinity なら落とさない */
  tolerance: number;
};

export const DEFAULT_FIT: FitOptions = { lo: 0.1, hi: 0.9, tolerance: Infinity };

/**
 * フレーム from〜last（両端を含む）のうち、長さが全長 full の lo〜hi のフレームで長さとフレームに直線を当てはめる。
 * 見え始めの薄いフレームと、満ちる直前のフレームは入れない。tolerance が有限なら、残差がそれを超える点
 * （武器のエフェクトなどがバーに重なったフレーム）を落として 3 回まで当てはめ直す。点が 3 つ未満なら null。
 * trackPx はバーの溝の幅（満ちたときの長さ）。バーは満ちたフレームで消えるので、見えた最大の長さ（full）は溝の幅より短い
 */
export function fitFrames(
  lengths: readonly number[],
  firstFrame: number,
  from: number,
  last: number,
  full: number,
  trackPx: number,
  options: FitOptions = DEFAULT_FIT,
): ChunkFit | null {
  let xs: number[] = [];
  let ys: number[] = [];
  for (let n = from; n <= last; n++) {
    const len = lengths[n - firstFrame]!;
    if (len >= full * options.lo && len <= full * options.hi) {
      xs.push(n);
      ys.push(len);
    }
  }
  let fit = leastSquares(xs, ys);
  for (let i = 0; i < 3 && fit !== null && Number.isFinite(options.tolerance); i++) {
    const f = fit;
    const keep = xs.map((x, j) => Math.abs(ys[j]! - (f.intercept + f.rate * x)) <= options.tolerance);
    if (keep.every(Boolean)) break;
    xs = xs.filter((_, j) => keep[j]);
    ys = ys.filter((_, j) => keep[j]);
    fit = leastSquares(xs, ys);
  }
  if (fit === null || fit.rate <= 0) return null;
  return {
    rate: fit.rate,
    zero: -fit.intercept / fit.rate,
    frames: trackPx / fit.rate,
    points: xs.length,
    rms: fit.rms,
  };
}

/** 段ごとの当てはめ（fitFrames を段の区間で呼ぶ） */
export function fitChunk(
  lengths: readonly number[],
  firstFrame: number,
  chunk: Chunk,
  full: number,
  trackPx: number,
  options: FitOptions = DEFAULT_FIT,
): ChunkFit | null {
  return fitFrames(lengths, firstFrame, chunk.start, chunk.last, full, trackPx, options);
}

/** 見えた最大の長さが full × ratio に届かない段（アイコンの移動・弾の光などの白）を捨てる */
export function dropTinyChunks(chunks: readonly Chunk[], full: number, ratio = 0.15): Chunk[] {
  return chunks.filter((c) => c.max >= full * ratio);
}

/** `hud.ts --mode jumps` の出力（frame\tvalue\tincrement\tgap）から、増分の出たフレームを取る */
export function parseHudJumps(text: string): number[] {
  const frames: number[] = [];
  for (const line of text.split(/\r?\n/)) {
    const n = Number(line.split('\t')[0]);
    if (line !== '' && Number.isInteger(n)) frames.push(n);
  }
  return frames.sort((a, b) => a - b);
}

/** 並んだフレームのうち、limit より前の最後のもの */
export function lastBefore(frames: readonly number[], limit: number): number | null {
  let out: number | null = null;
  for (const f of frames) {
    if (f < limit) out = f;
    else break;
  }
  return out;
}

/** 並んだフレームのうち、from 以後の最初のもの */
export function firstFrom(frames: readonly number[], from: number): number | null {
  for (const f of frames) if (f >= from) return f;
  return null;
}

/** 中央値（空なら 0） */
export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** 平均・標準偏差（不偏）・標準誤差・最小・最大。空なら null */
export function summarize(
  values: readonly number[],
): { n: number; mean: number; sd: number; se: number; min: number; max: number } | null {
  const n = values.length;
  if (n === 0) return null;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
  return { n, mean, sd, se: sd / Math.sqrt(n), min: Math.min(...values), max: Math.max(...values) };
}
