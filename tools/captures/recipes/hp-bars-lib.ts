// 画面下の顔のカードの HP のバーを読む純粋な部分（レシピ hp-bars）。バーの白の長さを、上の水色のバー（満タンの幅）で割って
// HP の割合にする（V-0730・V-0790・V-0791・V-0797 の読み方）。フレームごとの測りは hp-bars.ts が録画から出し、
// キャッシュ hp-bars@<版>.tsv に置く。
import { median } from '../aim-lib.ts';

/** 切り出す帯（1920×1080。高さは偶数） */
export const STRIP = { x: 640, y: 1024, w: 640, h: 16 };
/** 白のバーを読む行（中央値を取る）と、水色のバーを読む行 */
export const WHITE_ROWS = [1033, 1035, 1037] as const;
export const CYAN_ROWS = [1025, 1026, 1027] as const;
/**
 * カードの置き場所（左から 5 つ。水色のバーの左端と右端の x）。編成の人数によらず同じ所に出て、空きの置き場所には
 * カードが無い（4 人の録画 1090 は 1〜4 つ目、3 人の 1220 は 1〜3 つ目、2 人の 1235 は 3・4 つ目）
 */
export const CARD_SLOTS = [
  { left: 672, right: 759 },
  { left: 792, right: 879 },
  { left: 924, right: 1012 },
  { left: 1056, right: 1144 },
  { left: 1176, right: 1264 },
] as const;
/** 置き場所の左右の探す幅（px） */
export const SEARCH = 6;
/** 白の明るさ（min(R,G,B)）の背景（バーの減った所の暗い色）。端の画素の按分の 0 */
export const WHITE_BG = 12;
/** 白の画素とみなす按分の下限 */
const HALF = 0.5;
/** 水色の G の背景と満ちた値（右端の按分） */
export const CYAN_BG = 15;
export const CYAN_FULL = 173;
/** 白のバーの明るさ（中の画素の min(R,G,B) の中央値）がこれより下の画は暗い（戦闘の終わりなど）とみて読まない */
export const DIM_LEVEL = 238;
/** 白の右に続く色の画素（シールド。min(R,G,B) が背景より明るく白より暗い）の数がこれ以上の画は、シールドありとする */
export const SHIELD_MIN = 3;

/** 1 フレーム・1 つの置き場所の測り。どれも px（小数）。読めない値は NaN */
export type CardRaw = {
  /** 白のバーの左端と右端（右端は終わりの次の位置。端の画素は明るさで按分。3 行の中央値） */
  whiteLeft: number;
  whiteRight: number;
  /** 白のバーの中の明るさ（min(R,G,B) の中央値） */
  level: number;
  /** 白の右に続くシールドの色の画素の数（3 行の中央値） */
  shield: number;
  /** 水色のバーの右端（終わりの次の位置。按分。3 行の中央値） */
  cyanRight: number;
};

export type HpRawRow = { frame: number; cards: CardRaw[] };

/** 帯の 1 行の画素（RGB） */
export type Pixel = (x: number, y: number) => readonly [number, number, number];

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * 1 行の値の列（x0 から）で、from 〜 to の中で最初に始まる「満ちた」連なりの端を按分で出す。frac は画素の満ち具合（0〜1）。
 * 左端は連なりの最初の画素の欠け（1 − frac）と左隣のにじみ（frac）で、右端は最後の画素の欠けと右隣のにじみで直す。
 * 右端の按分は fracRight（右の背景が左と違うとき）で測る
 */
export function runEdges(
  frac: (x: number) => number,
  from: number,
  to: number,
  fracRight: (x: number) => number = frac,
): { left: number; right: number; last: number } | undefined {
  let s = -1;
  for (let x = from; x <= to; x++)
    if (frac(x) >= HALF) {
      s = x;
      break;
    }
  if (s < 0) return undefined;
  let e = s;
  while (frac(e + 1) >= HALF) e++;
  const left = s + (1 - frac(s)) - frac(s - 1);
  const right = e + 1 - (1 - fracRight(e)) + fracRight(e + 1);
  return { left, right, last: e };
}

/** 1 フレーム・1 つの置き場所を測る */
export function measureCard(px: Pixel, slot: (typeof CARD_SLOTS)[number]): CardRaw {
  const cyanRights: number[] = [];
  for (const y of CYAN_ROWS) {
    const isCyan = (x: number) => {
      const [r, g, b] = px(x, y);
      return b > 150 && r < 120 && g > 120;
    };
    // 右端の付近から左へ、水色の連なりの右端を探す
    let e = -1;
    for (let x = slot.right + SEARCH; x >= slot.right - SEARCH; x--)
      if (isCyan(x)) {
        e = x;
        break;
      }
    if (e < 0 || !isCyan(e - 20)) continue;
    // 満ち具合は G。右隣に白いアイコンが重なる枠（録画 1221 の 3 つ目）があるので、白っぽい画素は 0 にする
    const g = (x: number) => {
      const [r, gr, b] = px(x, y);
      return Math.min(r, gr, b) > 100 ? 0 : clamp01((gr - CYAN_BG) / (CYAN_FULL - CYAN_BG));
    };
    cyanRights.push(e + 1 - (1 - g(e)) + g(e + 1));
  }
  const lefts: number[] = [];
  const rights: number[] = [];
  const levels: number[] = [];
  const shields: number[] = [];
  for (const y of WHITE_ROWS) {
    const min = (x: number) => Math.min(...px(x, y));
    // 明るさの満ちた値は、左端の後の 5 画素の中央値（暗い画でも按分が崩れない）
    const probe = slot.left + 3;
    const level = median([0, 1, 2, 3, 4].map((d) => min(probe + d)));
    if (level < WHITE_BG + 100) continue;
    const fracOver = (bg: number) => (x: number) => clamp01((min(x) - bg) / (level - bg));
    const first = runEdges(fracOver(WHITE_BG), slot.left - SEARCH, slot.left + SEARCH);
    if (first === undefined) continue;
    // バーの減った所の色は背景の透けで変わる（暗い ≈ 12 か灰色 ≈ 75）。白の 3〜7 画素右の中央値を右端の背景にする
    const behind = [3, 4, 5, 6, 7].map((d) => first.last + d).filter((x) => x <= slot.right);
    const bgRight = behind.length >= 3 ? median(behind.map(min)) : WHITE_BG;
    const run =
      bgRight < level - 40
        ? runEdges(fracOver(WHITE_BG), slot.left - SEARCH, slot.left + SEARCH, fracOver(Math.max(WHITE_BG, bgRight)))!
        : first;
    lefts.push(run.left);
    rights.push(run.right);
    levels.push(level);
    let k = 0;
    for (let x = run.last + 2; x <= slot.right + 1; x++) {
      const v = min(x);
      if (v > WHITE_BG + 40 && v < level - 40) k++;
      else break;
    }
    shields.push(k);
  }
  const med = (v: number[]) => (v.length === 0 ? NaN : median(v));
  return {
    whiteLeft: med(lefts),
    whiteRight: med(rights),
    level: med(levels),
    shield: med(shields),
    cyanRight: med(cyanRights),
  };
}

const fmt2 = (v: number) => (Number.isNaN(v) ? '' : v.toFixed(2));
const COLS = ['whiteLeft', 'whiteRight', 'level', 'shield', 'cyanRight'] as const;

export function formatHpTsv(rows: readonly HpRawRow[]): string {
  const head = ['frame', ...CARD_SLOTS.flatMap((_, i) => COLS.map((c) => `${c}${i + 1}`))];
  const lines = rows.map((r) => [r.frame, ...r.cards.flatMap((c) => COLS.map((k) => fmt2(c[k])))].join('\t'));
  return `${[head.join('\t'), ...lines].join('\n')}\n`;
}

export function parseHpTsv(text: string): HpRawRow[] {
  const lines = text.trim().split('\n').slice(1);
  return lines.map((line) => {
    const v = line.split('\t');
    const num = (s: string | undefined) => (s === undefined || s === '' ? NaN : Number(s));
    const cards = CARD_SLOTS.map((_, i) => {
      const at = 1 + i * COLS.length;
      return Object.fromEntries(COLS.map((k, j) => [k, num(v[at + j])])) as CardRaw;
    });
    return { frame: Number(v[0]), cards };
  });
}

/** 置き場所ごとの、録画を通した左端と満タンの右端（読めた画の中央値） */
export type CardGeometry = { position: number; left: number; full: number };

/** 置き場所のうち、水色のバーが半分より多くの画で読めた所（左から） */
export function presentPositions(rows: readonly HpRawRow[]): number[] {
  return CARD_SLOTS.map((_, i) => i).filter((i) => {
    const seen = rows.filter((r) => !Number.isNaN(r.cards[i]!.cyanRight)).length;
    const shown = rows.filter((r) => r.cards.some((c) => !Number.isNaN(c.cyanRight))).length;
    return shown > 0 && seen > shown / 2;
  });
}

export function geometryOf(rows: readonly HpRawRow[], position: number): CardGeometry {
  const at = (k: 'whiteLeft' | 'cyanRight') =>
    median(rows.map((r) => r.cards[position]![k]).filter((v) => !Number.isNaN(v)));
  return { position, left: at('whiteLeft'), full: at('cyanRight') };
}

/** 画を読まない理由。null は読めた */
export type Unread = 'hidden' | 'dim' | 'shield' | null;

/**
 * 1 フレーム・1 枚のカードの割合（%）。左端か満タンの右端が録画を通した値から 1.5px より外れる画（カードが隠れた・動いた）・
 * 白が満タンの右端を 1.5px より越える画（回復の数字などの白が重なった）と
 * 白の無い画は hidden、暗い画は dim、シールドの出ている画は shield（白の端がシールドの色とにじむ）として読まない
 */
export function ratioOf(c: CardRaw, g: CardGeometry): { ratio: number; unread: Unread } {
  if (
    Number.isNaN(c.whiteRight) ||
    Number.isNaN(c.cyanRight) ||
    Math.abs(c.whiteLeft - g.left) > 1.5 ||
    Math.abs(c.cyanRight - g.full) > 1.5 ||
    c.whiteRight > g.full + 1.5
  )
    return { ratio: NaN, unread: 'hidden' };
  const ratio = ((c.whiteRight - g.left) / (g.full - g.left)) * 100;
  if (c.level < DIM_LEVEL) return { ratio, unread: 'dim' };
  if (c.shield >= SHIELD_MIN) return { ratio, unread: 'shield' };
  return { ratio, unread: null };
}

/** 1 枚のカードの、測る間隔ごとの割合の列（読めない画は NaN） */
export type Sample = { frame: number; ratio: number; unread: Unread };

/** step フレームおき（フレーム番号が step の倍数）の測りの列 */
export function samplesOf(rows: readonly HpRawRow[], g: CardGeometry, step: number): Sample[] {
  return rows
    .filter((r) => r.frame % step === 0)
    .map((r) => {
      const { ratio, unread } = ratioOf(r.cards[g.position]!, g);
      return { frame: r.frame, ratio, unread };
    });
}

/** --opt ranges（a-b,c-d。両端を含む） */
export function parseRanges(text: string): { from: number; to: number }[] {
  return text
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '')
    .map((s) => {
      const m = /^(\d+)-(\d+)$/.exec(s);
      if (m === null) throw new Error(`--opt ranges は a-b をカンマで並べる: ${s}`);
      const from = Number(m[1]);
      const to = Number(m[2]);
      if (from > to) throw new Error(`--opt ranges の始めが終わりより後: ${s}`);
      return { from, to };
    });
}

/** 区間の中の読めた測りの中央値と、使った測りの数・読まなかった測りの数（理由ごと） */
export function rangeMedian(
  samples: readonly Sample[],
  range: { from: number; to: number },
): { value: number; used: number; skipped: Record<Exclude<Unread, null>, number> } {
  const skipped = { hidden: 0, dim: 0, shield: 0 };
  const values: number[] = [];
  for (const s of samples) {
    if (s.frame < range.from || s.frame > range.to) continue;
    if (s.unread === null) values.push(s.ratio);
    else skipped[s.unread]++;
  }
  return { value: values.length === 0 ? NaN : median(values), used: values.length, skipped };
}

export type Change = { frame: number; before: number; after: number };

/**
 * 伸び（sign 1）か縮み（sign −1）の所。読めた測りだけをつなぎ、前の測りから threshold（%）より大きく動き、次の測りでも
 * 前の測りから threshold より大きく動いたままの測りのフレーム。before は前の測り、after は次の測りの値
 */
export function changesOf(samples: readonly Sample[], threshold: number, sign: 1 | -1): Change[] {
  const read = samples.filter((s) => s.unread === null);
  const out: Change[] = [];
  let lastK = -2;
  for (let k = 1; k + 1 < read.length; k++) {
    const prev = read[k - 1]!.ratio;
    if (sign * (read[k]!.ratio - prev) <= threshold || sign * (read[k + 1]!.ratio - prev) <= threshold) continue;
    // 続く測りにまたがる動き（動きの途中の画）は 1 つにまとめ、最初の測りのフレームと最後の後の値にする
    if (k === lastK + 1) out.at(-1)!.after = read[k + 1]!.ratio;
    else out.push({ frame: read[k]!.frame, before: prev, after: read[k + 1]!.ratio });
    lastK = k;
  }
  return out;
}

/** 値がほぼ一定（前の段の始めから ±tol %）の段。読めた測りだけで、minLength フレーム以上のもの */
export function plateausOf(
  samples: readonly Sample[],
  tol: number,
  minLength: number,
): { from: number; to: number; value: number }[] {
  const read = samples.filter((s) => s.unread === null);
  const out: { from: number; to: number; value: number }[] = [];
  let start = 0;
  const close = (end: number) => {
    const seg = read.slice(start, end);
    if (seg.length > 0 && seg.at(-1)!.frame - seg[0]!.frame >= minLength)
      out.push({ from: seg[0]!.frame, to: seg.at(-1)!.frame, value: median(seg.map((s) => s.ratio)) });
  };
  for (let k = 1; k <= read.length; k++) {
    if (k === read.length || Math.abs(read[k]!.ratio - read[start]!.ratio) > tol) {
      close(k);
      start = k;
    }
  }
  return out;
}
