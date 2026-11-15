// 枠アイコンの上の残弾表示「残弾/最大」を読む純粋な部分（ammo.ts）。
//
// 表示は白のプロポーショナルフォントで、文字列全体が中央揃え（桁の数で位置が変わり、「1」は幅が狭い）。そこで「/」の位置を
// 見本との正規化相互相関で先に探し、その左の桁（残弾）と右の桁（最大）を、字ごとの幅で並べた位置で照合する。
// 桁の数の取り違え（「36」を「6」と読む）は、並びの外の 1 字ぶんに数字が無いことも点に入れて防ぐ。
// 最大は戦闘の途中で変わる（最大装弾数▲）ので、先に最大の列を復号し、その後で残弾を復号する（どちらも Viterbi）。
import type { Crop } from './ffmpeg.ts';

/** 1 フレームの min(R,G,B) */
export type Gray = { data: Uint8Array; w: number; h: number };

/** 字の見本。data は rows 行 ×（w + 2）列（字の左右に 1 列ずつの余白）。count は平均した見本の数 */
export type Glyph = { w: number; data: number[]; count: number };

export type Templates = {
  /** 見本を作った crop（読むときの crop の既定） */
  crop: Crop;
  /** 字の行（crop の中の y の始めと行の数） */
  y0: number;
  rows: number;
  glyphs: Record<string, Glyph>;
  /**
   * 字の左端から次の字の左端までの送り（px）の見本。鍵は字と次の字の種類（「6d」は 6 の次が数字、「6/」は次が「/」、「/d」は
   * 「/」の次の数字、「m6d」は最大の 6 の次の数字）。「/」の前後は数字と数字の間より空く
   */
  advances: Record<string, number[]>;
};

/**
 * 字の見本の鍵。最大（「/」の右）の数字は残弾より小さい字なので、別の見本（m を付けた鍵）にする
 */
export function glyphKey(ch: string, isMax: boolean): string {
  return isMax && ch !== '/' ? `m${ch}` : ch;
}

/** 残弾の数字か最大の数字の鍵の並び */
function digitKeys(isMax: boolean): string[] {
  return [...DIGITS].map((d) => glyphKey(d, isMax));
}

const median = (v: readonly number[]) => [...v].sort((a, b) => a - b)[v.length >> 1]!;

/**
 * 字の鍵 key から、次の字（next が d なら数字、/ なら「/」）までの送り。見本の無い字は、同じ大きさの数字の同じ種類の送りの中央値、
 * それも無ければ残弾の数字の送り
 */
export function advanceOf(t: Pick<Templates, 'advances'>, key: string, next: 'd' | '/'): number {
  const own = t.advances[`${key}${next}`];
  if (own !== undefined && own.length > 0) return median(own);
  for (const keys of [digitKeys(key.startsWith('m')), digitKeys(false)]) {
    const same = keys.flatMap((d) => t.advances[`${d}${next}`] ?? []);
    if (same.length > 0) return median(same);
  }
  const other = digitKeys(false).flatMap((d) => t.advances[`${d}${next === 'd' ? '/' : 'd'}`] ?? []);
  if (other.length === 0) throw new Error('見本に送りが無い');
  return median(other) + (next === 'd' ? -1 : 1);
}

export const DIGITS = '0123456789';
/** 字の画素とみなす明るさ（見本を作るとき。暗い背景の画から作る） */
export const INK = 170;

export function toGray(rgb: Uint8Array, w: number, h: number): Gray {
  const data = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) data[i] = Math.min(rgb[i * 3]!, rgb[i * 3 + 1]!, rgb[i * 3 + 2]!);
  return { data, w, h };
}

/** 照合で背景とみなす明るさ。これより暗い画素は 0 にそろえる（灰色の背景の濃淡で字の形が埋もれない） */
export const BG_CUT = 150;

/** x0 から w 列・y0 から rows 行の画素の、BG_CUT を引いた明るさ（外と BG_CUT 以下は 0） */
export function patch(img: Gray, x0: number, w: number, y0: number, rows: number): number[] {
  const out: number[] = [];
  for (let y = y0; y < y0 + rows; y++)
    for (let dx = 0; dx < w; dx++) {
      const x = x0 + dx;
      const v = x < 0 || x >= img.w || y < 0 || y >= img.h ? 0 : img.data[y * img.w + x]!;
      out.push(v > BG_CUT ? v - BG_CUT : 0);
    }
  return out;
}

export function ncc(a: readonly number[], b: readonly number[]): number {
  const n = a.length;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i]!;
    mb += b[i]!;
  }
  ma /= n;
  mb /= n;
  let s = 0;
  let sa = 0;
  let sb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i]! - ma;
    const db = b[i]! - mb;
    s += da * db;
    sa += da * da;
    sb += db * db;
  }
  return sa > 0 && sb > 0 ? s / Math.sqrt(sa * sb) : 0;
}

/** 字ごと・字の左端の x ごとの照合の点（範囲の外は −1） */
export type ScoreMap = Record<string, Float32Array>;

export function scoreMap(img: Gray, t: Templates): ScoreMap {
  const out: ScoreMap = {};
  for (const [ch, g] of Object.entries(t.glyphs)) {
    const m = new Float32Array(img.w).fill(-1);
    for (let x = 1; x + g.w + 1 <= img.w; x++) m[x] = ncc(patch(img, x - 1, g.w + 2, t.y0, t.rows), g.data);
    out[ch] = m;
  }
  return out;
}

/** x の ±radius の中の最もよい点と、その位置 */
function nearAt(m: Float32Array | undefined, x: number, radius = 1): { score: number; x: number } {
  let best = { score: -1, x };
  if (m === undefined) return best;
  for (let d = -radius; d <= radius; d++) {
    const v = m[x + d];
    if (v !== undefined && v > best.score) best = { score: v, x: x + d };
  }
  return best;
}

function near(m: Float32Array | undefined, x: number): number {
  return nearAt(m, x).score;
}

/** 平均の数字の幅（並びの外の 1 字ぶんに使う） */
function digitWidth(t: Templates, isMax: boolean): number {
  const ws = digitKeys(isMax)
    .map((d) => t.glyphs[d]?.w)
    .filter((w): w is number => w !== undefined);
  return ws.reduce((s, w) => s + w, 0) / ws.length;
}

/** 並びの外の 1 字ぶんに数字が無い点（1 − 最もよい数字の点。範囲の外は 1） */
function blankAt(map: ScoreMap, x: number, w: number, isMax: boolean): number {
  if (x < 1 || x + w + 1 > (map['/']?.length ?? 0)) return 1;
  let best = 0;
  for (const d of digitKeys(isMax)) best = Math.max(best, near(map[d], x));
  return 1 - best;
}

/** 「/」の候補にする、点の極大の数 */
const SLASH_CANDIDATES = 3;

/** 「/」の位置の候補（点の極大を点の高い順に count 個） */
export function slashCandidates(map: ScoreMap, count = SLASH_CANDIDATES): { x: number; score: number }[] {
  const m = map['/']!;
  const peaks: { x: number; score: number }[] = [];
  for (let x = 0; x < m.length; x++) {
    const v = m[x]!;
    if (v > -1 && v >= (m[x - 1] ?? -1) && v > (m[x + 1] ?? -1)) peaks.push({ x, score: v });
  }
  return peaks.sort((a, b) => b.score - a.score).slice(0, count);
}

/**
 * 「/」の左に右詰めで並べた value の点（字の点と、並びの外の 1 字ぶんの空きの点の平均）。side が right なら「/」の右に左詰め
 */
export function valueScore(map: ScoreMap, t: Templates, slashX: number, value: number, side: 'left' | 'right'): number {
  const s = String(value);
  let sum = 0;
  // 字の位置は、前の字の見つかった位置から送りの分だけ動かし、±1 で探す（中央揃えの半画素のずれが積もらない）。
  // 「/」の右の 1 字目は ±2 で探す（「/」と最大の小さい字の間は録画によって 1〜2 px 違う）
  if (side === 'left') {
    let x = slashX;
    for (let i = s.length - 1; i >= 0; i--) {
      const at = nearAt(map[s[i]!], x - advanceOf(t, s[i]!, i === s.length - 1 ? '/' : 'd'));
      sum += at.score;
      x = at.x;
    }
    sum += blankAt(map, Math.round(x - advanceOf(t, '0', 'd')), digitWidth(t, false), false);
  } else {
    let x = slashX + advanceOf(t, '/', 'd');
    for (const [i, ch] of [...s].entries()) {
      const key = glyphKey(ch, true);
      const at = nearAt(map[key], x, i === 0 ? 2 : 1);
      sum += at.score;
      x = at.x + advanceOf(t, key, 'd');
    }
    sum += blankAt(map, x, digitWidth(t, true), true);
  }
  return sum / (s.length + 1);
}

/** 1 フレームの読み: 「/」の点と、残弾・最大の値ごとの点（値 0..limit） */
export type FrameScores = { slash: number; left: Float32Array; right: Float32Array };

/**
 * 1 フレームの照合の点。「/」は、点の極大の候補のうち、「/」の点と左右の値の最もよい点の和が最も高いもの
 * （大きい字の 7 の斜めの線は「/」に似て、「/」より高い点になることがある）
 */
export function frameScores(img: Gray, t: Templates, limit: number): FrameScores {
  const map = scoreMap(img, t);
  let best: (FrameScores & { total: number }) | undefined;
  for (const c of slashCandidates(map)) {
    const left = new Float32Array(limit + 1);
    const right = new Float32Array(limit + 1);
    right[0] = -1;
    let topLeft = -1;
    let topRight = -1;
    for (let v = 0; v <= limit; v++) {
      left[v] = valueScore(map, t, c.x, v, 'left');
      topLeft = Math.max(topLeft, left[v]!);
      if (v === 0) continue;
      right[v] = valueScore(map, t, c.x, v, 'right');
      topRight = Math.max(topRight, right[v]!);
    }
    const total = c.score + topLeft + topRight;
    if (best === undefined || total > best.total) best = { slash: c.score, left, right, total };
  }
  if (best === undefined) {
    const none = new Float32Array(limit + 1).fill(-1);
    return { slash: -1, left: none, right: none };
  }
  return { slash: best.slash, left: best.left, right: best.right };
}

/** 表示が出ているとみなす「/」の点 */
export const SLASH_MIN = 0.6;
/** 表示が消えている（リロード中など）状態の照合の点 */
export const HIDDEN_SCORE = 0.55;
/** 2 発以上まとめて減る遷移の罰則（1 発あたり） */
export const DROP_PENALTY = 0.02;
/** 表示が消える・消えた状態から戻る遷移の罰則 */
export const HIDE_PENALTY = 0.3;
/** 弾丸チャージ（残弾が増える。--charge）の罰則 */
export const RISE_PENALTY = 0.4;
/** 最大が替わる罰則 */
export const MAX_SWITCH_PENALTY = 1;
/** 1 フレームに減ってよい最大の発数（描画落ちで録画が取りこぼすと 1 フレームに 2〜3 発減る） */
export const MAX_DROP = 8;

/**
 * 最大の候補: 「/」が見えたフレームで最もよい最大の値のうち、minFrames フレーム以上で最もよかったもの
 */
export function maxCandidates(frames: readonly FrameScores[], minFrames: number): number[] {
  const counts = new Map<number, number>();
  for (const f of frames) {
    if (f.slash < SLASH_MIN) continue;
    let best = 1;
    for (let v = 2; v < f.right.length; v++) if (f.right[v]! > f.right[best]!) best = v;
    counts.set(best, (counts.get(best) ?? 0) + 1);
  }
  return [...counts]
    .filter(([, n]) => n >= minFrames)
    .map(([v]) => v)
    .sort((a, b) => a - b);
}

/** 最大の列の復号（候補の中で、替わるたびに罰則）。「/」の見えないフレームは前の最大のまま */
export function decodeMax(frames: readonly FrameScores[], candidates: readonly number[]): number[] {
  if (candidates.length === 0) throw new Error('最大の候補が無い（--max で指定する）');
  if (candidates.length === 1) return frames.map(() => candidates[0]!);
  const k = candidates.length;
  const n = frames.length;
  const back: Int8Array[] = [];
  let prev = new Float64Array(k);
  for (let f = 0; f < n; f++) {
    const cur = new Float64Array(k);
    const bk = new Int8Array(k);
    let bestPrev = 0;
    for (let j = 1; j < k; j++) if (prev[j]! > prev[bestPrev]!) bestPrev = j;
    const fr = frames[f]!;
    for (let j = 0; j < k; j++) {
      const stay = prev[j]!;
      const sw = prev[bestPrev]! - MAX_SWITCH_PENALTY;
      cur[j] = stay >= sw ? stay : sw;
      bk[j] = stay >= sw ? j : bestPrev;
      if (fr.slash >= SLASH_MIN) cur[j]! += fr.right[candidates[j]!]!;
    }
    back.push(bk);
    prev = cur;
  }
  let state = 0;
  for (let j = 1; j < k; j++) if (prev[j]! > prev[state]!) state = j;
  const out: number[] = new Array(n);
  for (let f = n - 1; f >= 0; f--) {
    out[f] = candidates[state]!;
    state = back[f]![state]!;
  }
  return out;
}

/**
 * 残弾の復号。戻り値は各フレームの残弾（表示が消えている状態は null）。制約: 残弾は最大以下。同じマガジンの中では増えない
 * （1 フレームに最大 MAX_DROP 発まで減る）。表示が消えた後は、そのフレームの最大に戻る（リロード）か、消える前の値以下から続ける
 * （バーストの演出で HUD が隠れた間）。消えている状態は消える前の値を覚える。最大が替わったフレームではどの値にも移れる。
 * charge なら、残弾が増える遷移（弾丸チャージ）も罰則付きで許す
 */
export function decodeAmmo(
  frames: readonly FrameScores[],
  maxes: readonly number[],
  opts: { charge: boolean },
): (number | null)[] {
  const limit = Math.max(...maxes);
  const size = limit + 1;
  // 状態: 0..limit は見えている残弾、size + u は残弾 u で消えている
  const states = size * 2;
  const n = frames.length;
  const NEG = -1e9;
  const emit = (f: number, v: number) => {
    if (v > maxes[f]!) return NEG;
    const fr = frames[f]!;
    return 0.3 * fr.slash + 0.7 * fr.left[v]!;
  };
  const back: Int16Array[] = [];
  let prev = new Float64Array(states).fill(NEG);
  prev[size + maxes[0]!] = HIDDEN_SCORE;
  prev[maxes[0]!] = emit(0, maxes[0]!);
  back.push(new Int16Array(states).fill(-1));
  for (let f = 1; f < n; f++) {
    const cur = new Float64Array(states).fill(NEG);
    const bk = new Int16Array(states).fill(-1);
    const maxChanged = maxes[f] !== maxes[f - 1];
    const take = (to: number, from: number, score: number) => {
      if (score > cur[to]!) {
        cur[to] = score;
        bk[to] = from;
      }
    };
    // 消えている状態の中の最もよいもの（リロードの終わり）
    let hiddenBest = size;
    for (let u = 1; u < size; u++) if (prev[size + u]! > prev[hiddenBest]!) hiddenBest = size + u;
    // u < v（増える）の中の最もよい前の値（charge・最大の替わり目）
    let riseBest = NEG;
    let riseFrom = -1;
    for (let v = 0; v <= limit; v++) {
      for (let u = v; u <= Math.min(limit, v + MAX_DROP); u++) {
        const drop = DROP_PENALTY * Math.max(0, u - v - 1);
        take(v, u, prev[u]! - drop);
        take(v, size + u, prev[size + u]! - HIDE_PENALTY - drop);
      }
      if (maxChanged || opts.charge) {
        const pen = maxChanged ? DROP_PENALTY : RISE_PENALTY;
        if (riseFrom >= 0) take(v, riseFrom, riseBest - pen);
        // 最大の替わり目は、減る向きにも MAX_DROP を越えて移れる
        if (maxChanged) for (let u = v + MAX_DROP + 1; u <= limit; u++) take(v, u, prev[u]! - pen);
      }
      if (prev[v]! > riseBest) {
        riseBest = prev[v]!;
        riseFrom = v;
      }
      if (v === maxes[f]) take(v, hiddenBest, prev[hiddenBest]! - HIDE_PENALTY);
      cur[v]! += emit(f, v);
      // 消える・消えたまま
      take(size + v, v, prev[v]! - HIDE_PENALTY);
      take(size + v, size + v, prev[size + v]!);
      cur[size + v]! += HIDDEN_SCORE;
    }
    back.push(bk);
    prev = cur;
  }
  let state = 0;
  for (let s = 1; s < states; s++) if (prev[s]! > prev[state]!) state = s;
  const path: (number | null)[] = new Array(n);
  for (let f = n - 1; f >= 0; f--) {
    path[f] = state >= size ? null : state;
    state = back[f]![state]!;
  }
  return path;
}

/** 字の画素のある列の連なり（見本を作るときの字の切り出し）。y0〜y0+rows の行で min(R,G,B) が INK を越える列 */
export function inkRuns(img: Gray, y0: number, rows: number): { x: number; w: number }[] {
  const ink = (x: number) => {
    for (let y = y0; y < y0 + rows; y++) if (img.data[y * img.w + x]! > INK) return true;
    return false;
  };
  const out: { x: number; w: number }[] = [];
  let start = -1;
  for (let x = 0; x <= img.w; x++) {
    const on = x < img.w && ink(x);
    if (on && start < 0) start = x;
    if (!on && start >= 0) {
      out.push({ x: start, w: x - start });
      start = -1;
    }
  }
  return out;
}

/** 字の画素のある行の範囲（見本の行。band の中だけを見る） */
export function inkRows(
  img: Gray,
  x0: number,
  x1: number,
  band: { y0: number; rows: number },
): { y0: number; rows: number } | undefined {
  let lo = -1;
  let hi = -1;
  for (let y = band.y0; y < band.y0 + band.rows; y++) {
    let on = false;
    for (let x = x0; x < x1; x++) if (img.data[y * img.w + x]! > INK) on = true;
    if (on) {
      if (lo < 0) lo = y;
      hi = y;
    }
  }
  return lo < 0 ? undefined : { y0: lo, rows: hi - lo + 1 };
}

/** 見本の 1 つ: 画と、その表示の文字列（例 36/60） */
export type TemplateSample = { img: Gray; text: string };

/** 字の幅の上限と、字と字の間の上限（見本を作るときの字の列の選び方） */
export const GLYPH_MAX_W = 9;
export const GLYPH_MAX_GAP = 6;

/**
 * 列の連なりから、字の数だけ続き、どれも字の幅で、間が詰まった並びを選ぶ（左のマガジンのアイコンや明るい背景を外す）。
 * 候補が複数なら、並びの中央が center に最も近いもの
 */
export function textRuns(
  runs: readonly { x: number; w: number }[],
  length: number,
  center: number,
): { x: number; w: number }[] | undefined {
  let best: { x: number; w: number }[] | undefined;
  let bestDist = Infinity;
  for (let i = 0; i + length <= runs.length; i++) {
    const seq = runs.slice(i, i + length);
    const ok = seq.every(
      (r, k) => r.w <= GLYPH_MAX_W && (k === 0 || r.x - (seq[k - 1]!.x + seq[k - 1]!.w) <= GLYPH_MAX_GAP),
    );
    if (!ok) continue;
    const dist = Math.abs((seq[0]!.x + seq.at(-1)!.x + seq.at(-1)!.w) / 2 - center);
    if (dist < bestDist) {
      best = seq;
      bestDist = dist;
    }
  }
  return best;
}

/** 見本を作るときに字を探す行（crop の中。既定の crop 110×26 で字は 7〜17 行目） */
export const TEXT_BAND = { y0: 6, rows: 13 };

/**
 * 見本の画から字の見本を作る。字は、TEXT_BAND の行で INK を越える列の連なりを、文字列の右詰めで 1 つずつ当てる
 * （左のマガジンのアイコンは余る。暗い背景の画を選ぶ）。base があれば、その見本に重みを付けて平均する（別の録画の見本を足す）
 */
export function buildTemplates(samples: readonly TemplateSample[], crop: Crop, base?: Templates): Templates {
  if (samples.length === 0) throw new Error('見本が無い');
  // 行は、文字列の字の列の範囲で字の画素のある行（見本の中で最も広い範囲）
  const placed = samples.map(({ img, text }) => {
    const runs = textRuns(inkRuns(img, TEXT_BAND.y0, TEXT_BAND.rows), text.length, img.w / 2);
    if (runs === undefined)
      throw new Error(`「${text}」の字の数の、間の詰まった列の連なりが無い（背景の暗い画を選ぶ）`);
    return { img, text, runs };
  });
  // 足すときは元の見本の行に合わせる
  let y0 = base?.y0 ?? Infinity;
  let y1 = base === undefined ? -Infinity : base.y0 + base.rows - 1;
  if (base === undefined)
    for (const p of placed) {
      const r = inkRows(p.img, p.runs[0]!.x, p.runs.at(-1)!.x + p.runs.at(-1)!.w, TEXT_BAND);
      if (r === undefined) continue;
      y0 = Math.min(y0, r.y0);
      y1 = Math.max(y1, r.y0 + r.rows - 1);
    }
  const rows = y1 - y0 + 1;
  const widths = new Map<string, number[]>();
  const advances: Record<string, number[]> = Object.fromEntries(
    Object.entries(base?.advances ?? {}).map(([k, v]) => [k, [...v]]),
  );
  const keyAt = (text: string, i: number) => glyphKey(text[i]!, i > text.indexOf('/'));
  for (const p of placed)
    p.runs.forEach((r, i) => {
      const ch = keyAt(p.text, i);
      widths.set(ch, [...(widths.get(ch) ?? []), r.w]);
      const next = p.runs[i + 1];
      if (next !== undefined) (advances[`${ch}${p.text[i + 1] === '/' ? '/' : 'd'}`] ??= []).push(next.x - r.x);
    });
  const glyphs: Record<string, Glyph> = {};
  const sums = new Map<string, { w: number; sum: number[]; count: number }>();
  for (const [ch, g] of Object.entries(base?.glyphs ?? {}))
    sums.set(ch, { w: g.w, sum: g.data.map((v) => v * g.count), count: g.count });
  for (const p of placed)
    p.runs.forEach((r, i) => {
      const ch = keyAt(p.text, i);
      const w = sums.get(ch)?.w ?? median(widths.get(ch)!);
      const prev = sums.get(ch);
      // 字の列の左端は閾値で ±1 ぶれるので、2 つ目からはそれまでの平均に最もよく合う位置（±1）で切り出す
      let data = patch(p.img, r.x - 1, w + 2, y0, rows);
      if (prev !== undefined && prev.count > 0) {
        const mean = prev.sum.map((v) => v / prev.count);
        let best = ncc(data, mean);
        for (const d of [-1, 1]) {
          const cand = patch(p.img, r.x - 1 + d, w + 2, y0, rows);
          const score = ncc(cand, mean);
          if (score > best) {
            best = score;
            data = cand;
          }
        }
      }
      const s = prev ?? { w, sum: data.map(() => 0), count: 0 };
      data.forEach((v, k) => (s.sum[k]! += v));
      s.count++;
      sums.set(ch, s);
    });
  for (const [ch, s] of sums)
    glyphs[ch] = { w: s.w, data: s.sum.map((v) => Math.round((v / s.count) * 10) / 10), count: s.count };
  return { crop: base?.crop ?? crop, y0, rows, glyphs, advances };
}
