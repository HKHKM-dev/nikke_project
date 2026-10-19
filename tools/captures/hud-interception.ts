// 迎撃戦の画面上部のボスの段階の数値「被ダメージ/段階の HP」（例: 79,191/8,404,000）の左の値を読む純粋な部分（V-0462）。
// hud.ts --screen interception が使い、hud-interception.test.ts でテストする。録画は読まない。
//
// 数字は高さ約 12px の斜体で、白ではなく背景の帯より少し明るい灰色（min(R,G,B) が数字 170〜210・帯 130〜150・影 50〜100）。
// 2 値化すると、細い横線が消えて 1 字が割れるか、斜めの隣の字とつながり、字に切り分けられない（V-0462「読み方」）。
// そこで切り分けずに、灰色のまま見本と照合する:
//   1. 切り出しを 4 倍に拡大し、斜体の傾きを戻す（せん断）
//   2. 変わらない右側「/8,404,000」を見本で探し、斜線の左端 xs を決める
//   3. 文字列は中央揃えなので、xs から左の値の幅が決まり、桁数と「1」の数（「1」だけ字送りが狭い）の候補が決まる
//   4. 候補ごとに、右から左へ動的計画で各字を照合し、照合の平均が最も高い文字列を取る。6 と 8 は上半分だけで照合し直す
// 段階が変わると右側（段階の HP）が変わるので、見本の右側は段階 1（8,404,000）だけ。

/** 切り出し（元の画の px） */
export const CROP = { x: 890, y: 122, w: 140, h: 20 } as const;
/** 拡大の倍率 */
export const SCALE = 4;
/** 斜体の傾き（拡大した画で、1px 上がるごとに右へずれる px） */
export const SHEAR = 0.25;
/** 字の帯（拡大した画の行） */
export const BAND: readonly [number, number] = [4, 64];
/** 右側の変わらない文字列 */
export const SUFFIX = '/8,404,000';

const W = CROP.w * SCALE;
const H = CROP.h * SCALE;
const PAD = Math.ceil(SHEAR * H);
/** せん断した画の幅と、帯の高さ */
export const SHEARED_W = W + PAD;
export const BAND_H = BAND[1] - BAND[0];

/** 字送り（拡大・せん断した画の px）。斜線の位置の動きから逆算した値（V-0462「読み方」） */
const ADVANCE: Record<string, number> = { '1': 12.5, ',': 11.5, '/': 15.5 };
const DIGIT_ADVANCE = 20.5;
export const advanceOf = (c: string): number => ADVANCE[c] ?? DIGIT_ADVANCE;
export const widthOf = (s: string): number => [...s].reduce((t, c) => t + advanceOf(c), 0);
/** 照合の窓の幅（字送りの左右に 1px ずつ足す） */
export const cellWidth = (c: string): number => Math.round(advanceOf(c)) + 2;
export const SUFFIX_WIDTH = Math.round(widthOf(SUFFIX)) + 4;

/** せん断した灰色の帯（SHEARED_W × BAND_H、行優先。画の外は NaN） */
export type Strip = Float32Array;

export type InterceptionTemplates = {
  /** 右側（斜線の左端の 2px 左から SUFFIX_WIDTH） */
  suffix: number[];
  /** 字（0〜9 とカンマ）。字の左端の 1px 左から cellWidth */
  glyphs: Record<string, number[]>;
  /** 斜線の左端 − 左の値の幅 / 2（中央揃えの中心に当たる量） */
  center: number;
  /** 見本にしたフレーム（録画 id・フレーム・左の値） */
  samples: { recording: string; frame: number; value: number }[];
};

/** 見本のファイルの形。灰色の値は 0〜255 の整数にして base64 で持つ（数の並びのままだと 200KB を超える） */
export type InterceptionTemplatesFile = Omit<InterceptionTemplates, 'suffix' | 'glyphs'> & {
  suffix: string;
  glyphs: Record<string, string>;
};

const encode = (values: readonly number[]): string =>
  Buffer.from(Uint8Array.from(values, (v) => Math.max(0, Math.min(255, Math.round(v))))).toString('base64');
const decode = (text: string): number[] => Array.from(Buffer.from(text, 'base64'));

export function encodeTemplates(t: InterceptionTemplates): InterceptionTemplatesFile {
  return {
    ...t,
    suffix: encode(t.suffix),
    glyphs: Object.fromEntries(Object.entries(t.glyphs).map(([c, g]) => [c, encode(g)])),
  };
}

export function decodeTemplates(f: InterceptionTemplatesFile): InterceptionTemplates {
  return {
    ...f,
    suffix: decode(f.suffix),
    glyphs: Object.fromEntries(Object.entries(f.glyphs).map(([c, g]) => [c, decode(g)])),
  };
}

export type InterceptionRead = { value: number; text: string; suffixScore: number; minScore: number };

/** 拡大した切り出し（W × H の rgb24）を、min(R,G,B) のせん断した帯にする */
export function toStrip(rgb: Uint8Array): Strip {
  const sum = new Float32Array(SHEARED_W * BAND_H);
  const count = new Float32Array(SHEARED_W * BAND_H);
  for (let y = BAND[0]; y < BAND[1]; y++) {
    const shift = Math.round(SHEAR * (y - H)) + PAD;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      const j = (y - BAND[0]) * SHEARED_W + x + shift;
      sum[j]! += Math.min(rgb[i]!, rgb[i + 1]!, rgb[i + 2]!);
      count[j]! += 1;
    }
  }
  return sum.map((v, i) => (count[i]! > 0 ? v / count[i]! : Number.NaN));
}

/** 帯の [x, x + w) を行優先で取り出す（画の外は 0） */
export function patch(strip: Strip, x: number, w: number): number[] {
  const out: number[] = [];
  const x0 = Math.round(x);
  for (let y = 0; y < BAND_H; y++) {
    for (let dx = 0; dx < w; dx++) {
      const xx = x0 + dx;
      const v = xx >= 0 && xx < SHEARED_W ? strip[y * SHEARED_W + xx]! : Number.NaN;
      out.push(Number.isNaN(v) ? 0 : v);
    }
  }
  return out;
}

/** 正規化相互相関（明るさと濃淡の幅によらない） */
export function ncc(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
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

/** 右側の見本の左端（斜線の左端の 2px 左）と照合の値。中心から取りうる範囲（左の値が 1〜7 桁）だけを探す */
export function findSuffix(
  strip: Strip,
  t: Pick<InterceptionTemplates, 'suffix' | 'center'>,
): { x: number; score: number } {
  const lo = Math.max(0, Math.floor(t.center) - 2);
  const hi = Math.min(SHEARED_W - SUFFIX_WIDTH, Math.ceil(t.center) + 96);
  let best = { x: -1, score: -2 };
  for (let x = lo; x <= hi; x++) {
    const score = ncc(patch(strip, x, SUFFIX_WIDTH), t.suffix);
    if (score > best.score) best = { x, score };
  }
  return best;
}

/**
 * 左の値の幅に合う（桁数, 「1」の数）の組。斜線の位置は元の画の px（拡大した画で 4px）に丸まるので、
 * 「1」の数は幅からの計算値の切り捨てと切り上げの両方を候補にする（差が 0.6 以内）
 */
export function layoutCandidates(leftWidth: number): { digits: number; ones: number }[] {
  const out: { digits: number; ones: number }[] = [];
  for (let digits = 1; digits <= 7; digits++) {
    const commas = Math.floor((digits - 1) / 3);
    const ones = (digits * DIGIT_ADVANCE + commas * advanceOf(',') - leftWidth) / (DIGIT_ADVANCE - advanceOf('1'));
    for (const k of new Set([Math.floor(ones), Math.ceil(ones)])) {
      if (k >= 0 && k <= digits && Math.abs(ones - k) <= 0.6) out.push({ digits, ones: k });
    }
  }
  return out;
}

/** 字 c を右端 right の左に置いたときの照合。位置は ±2px で合わせる。6 と 8 は上半分の照合を半分の重みで足す */
function glyphScore(strip: Strip, t: InterceptionTemplates, c: string, right: number): number {
  const w = cellWidth(c);
  let score = -2;
  let at = 0;
  for (let d = -2; d <= 2; d++) {
    const s = ncc(patch(strip, right - advanceOf(c) + d - 1, w), t.glyphs[c]!);
    if (s > score) {
      score = s;
      at = d;
    }
  }
  if (c === '6' || c === '8') {
    const half = (BAND_H >> 1) * w;
    const upper = patch(strip, right - advanceOf(c) + at - 1, w).slice(0, half);
    score = 0.5 * score + 0.5 * ncc(upper, t.glyphs[c]!.slice(0, half));
  }
  return score;
}

/** 斜線の左端 slashLeft から左の値を読む。候補の組ごとに右から左へ動的計画で照合し、平均の最も高い文字列 */
export function readLeft(
  strip: Strip,
  t: InterceptionTemplates,
  slashLeft: number,
): { text: string; scores: number[] } | null {
  type State = { sum: number; text: string; scores: number[] };
  let best: (State & { mean: number }) | null = null;
  for (const { digits, ones } of layoutCandidates((slashLeft - t.center) * 2)) {
    // dp[o] = 右から j 桁で「1」を o 個使ったときの最良
    let dp: (State | undefined)[] = [{ sum: 0, text: '', scores: [] }];
    for (let j = 0; j < digits; j++) {
      const next: (State | undefined)[] = [];
      dp.forEach((st, o) => {
        if (st === undefined) return;
        const right = slashLeft - Math.floor(j / 3) * advanceOf(',') - (j - o) * DIGIT_ADVANCE - o * advanceOf('1');
        for (const c of '0123456789') {
          const o2 = o + (c === '1' ? 1 : 0);
          if (o2 > ones) continue;
          const sc = glyphScore(strip, t, c, right);
          const cand = {
            sum: st.sum + sc,
            text: c + (j > 0 && j % 3 === 0 ? ',' : '') + st.text,
            scores: [sc, ...st.scores],
          };
          if (next[o2] === undefined || next[o2]!.sum < cand.sum) next[o2] = cand;
        }
      });
      dp = next;
    }
    const fin = dp[ones];
    if (fin && (best === null || fin.sum / digits > best.mean)) best = { ...fin, mean: fin.sum / digits };
  }
  return best === null ? null : { text: best.text, scores: best.scores };
}

/** 照合の下限。右側がこれより悪いフレーム（数値が隠れている）と、これより悪い字を含む読みは捨てる */
export const MIN_SUFFIX_SCORE = 0.9;
export const MIN_GLYPH_SCORE = 0.6;

/** 1 フレームを読む。読めなければ null */
export function readStrip(strip: Strip, t: InterceptionTemplates): InterceptionRead | null {
  const suffix = findSuffix(strip, t);
  if (suffix.score < MIN_SUFFIX_SCORE) return null;
  const r = readLeft(strip, t, suffix.x + 2);
  if (r === null || r.text === '') return null;
  const minScore = Math.min(...r.scores);
  if (minScore < MIN_GLYPH_SCORE) return null;
  return { value: Number(r.text.replace(/,/g, '')), text: r.text, suffixScore: suffix.score, minScore };
}

/**
 * 見本を作る。右側の見本は、最初に中央揃えの見込み（中心 initialCenter）の位置で作って各フレームで探し直し、
 * 字の見本は斜線の左端から字送りで置いた位置で作る（2・3 回目は前の見本で ±2px 位置を合わせる）
 */
export function makeTemplates(
  samples: { strip: Strip; recording: string; frame: number; value: number }[],
  initialCenter = 197.75,
): InterceptionTemplates {
  const average = (rows: number[][]) => rows[0]!.map((_, i) => rows.reduce((t, r) => t + r[i]!, 0) / rows.length);
  const lefts = samples.map((s) => s.value.toLocaleString('en-US'));
  const suffix0 = average(
    samples.map((s, i) => patch(s.strip, initialCenter + widthOf(lefts[i]!) / 2 - 2, SUFFIX_WIDTH)),
  );
  const slash = samples.map((s) => findSuffix(s.strip, { suffix: suffix0, center: initialCenter }).x + 2);
  let glyphs: Record<string, number[]> = {};
  for (let pass = 1; pass <= 3; pass++) {
    const rows: Record<string, number[][]> = {};
    samples.forEach((s, i) => {
      let x = slash[i]!;
      for (const c of [...lefts[i]!].reverse()) {
        x -= advanceOf(c);
        const prev = glyphs[c];
        if (prev !== undefined) {
          let best = { d: 0, score: -2 };
          for (let d = -2; d <= 2; d++) {
            const score = ncc(patch(s.strip, x + d - 1, cellWidth(c)), prev);
            if (score > best.score) best = { d, score };
          }
          x += best.d;
        }
        (rows[c] ??= []).push(patch(s.strip, x - 1, cellWidth(c)));
      }
    });
    glyphs = Object.fromEntries(Object.entries(rows).map(([c, r]) => [c, average(r)]));
  }
  const missing = [...'0123456789,'].filter((c) => glyphs[c] === undefined);
  if (missing.length > 0) throw new Error(`見本に無い字: ${missing.join(' ')}`);
  const centers = samples.map((_, i) => slash[i]! - widthOf(lefts[i]!) / 2).sort((a, b) => a - b);
  return {
    suffix: average(samples.map((s, i) => patch(s.strip, slash[i]! - 2, SUFFIX_WIDTH))).map(Math.round),
    glyphs: Object.fromEntries(Object.entries(glyphs).map(([c, g]) => [c, g.map(Math.round)])),
    center: centers[centers.length >> 1]!,
    samples: samples.map(({ recording, frame, value }) => ({ recording, frame, value })),
  };
}
