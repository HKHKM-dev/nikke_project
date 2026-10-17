// 中遠の着地点（C-0044 の A・B・C）を、4 区間目の的の足元の y から決める純粋な部分（レシピ midfar-landing。
// V-0373「読み方」の 2 と V-0386「読み方」の 1 の規則）。
import { median, mode } from './triggers.ts';

/** aim.ts の 1 フレームの測定のうち、足元に使う列（値は aim.ts の CSV の tgt_* と同じ） */
export type MidfarRow = {
  frame: number;
  /** 的の外接矩形（1920×1080 の座標）。的が無ければ undefined */
  x0?: number;
  y0?: number;
  x1?: number;
  y1?: number;
  /** 外接矩形が探す範囲の端に接している */
  clipped?: boolean;
  /** 照準の周りの明るい画素の割合（小数 2 桁） */
  fx?: number;
};

/** 中遠の足元の候補: 足元の y がこの範囲（ほかの区間の足元は 近 685・中近 608・遠 534〜542 で入らない） */
export const FOOT = { min: 550, max: 595 };
/** 区間の始まりの後に除くフレーム数 */
export const SKIP_AFTER_START = 150;
/** 爆発で隠れたコマ: fx がこれ以上 */
export const FX_HIDDEN = 0.3;
/** 外接矩形の高さがこれ以上のコマは除く（遮蔽物や照準の線とつながったもの） */
export const HEIGHT_MAX = 290;
/** 使えるコマがこれ未満なら着地点を決めない */
export const MIN_USED = 8;

/** 境目（V-0373・V-0386 で読む前に固定した値）。間と外は決めない */
export const LANDING_A_MIN = 580;
export const LANDING_B = { min: 568, max: 576 };
export const LANDING_C = { min: 558, max: 565 };

export type MidfarLanding = 'A' | 'B' | 'C' | '決まらない';

export function midfarLandingOf(foot: number | undefined, used: number): MidfarLanding {
  if (foot === undefined || used < MIN_USED) return '決まらない';
  if (foot >= LANDING_A_MIN) return 'A';
  if (foot >= LANDING_B.min && foot <= LANDING_B.max) return 'B';
  if (foot >= LANDING_C.min && foot <= LANDING_C.max) return 'C';
  return '決まらない';
}

function isCandidate(r: MidfarRow): boolean {
  return r.y1 !== undefined && r.y1 >= FOOT.min && r.y1 <= FOOT.max;
}

/** 区間の始まり: 足元が候補のコマが 3 つ続いた最初のコマ（散発的に出る遠の 588・594 のコマを避ける。V-0373「読み方」の 2） */
export function midfarStart(rows: readonly MidfarRow[]): number | undefined {
  for (let i = 0; i + 2 < rows.length; i++)
    if (isCandidate(rows[i]!) && isCandidate(rows[i + 1]!) && isCandidate(rows[i + 2]!)) return rows[i]!.frame;
  return undefined;
}

/** 線形補間の四分位（第 1・第 3） */
export function quartiles(values: readonly number[]): [number, number] | undefined {
  if (values.length === 0) return undefined;
  const s = [...values].sort((a, b) => a - b);
  const at = (q: number): number => {
    const p = (s.length - 1) * q;
    const lo = Math.floor(p);
    const hi = Math.ceil(p);
    return s[lo]! + (s[hi]! - s[lo]!) * (p - lo);
  };
  return [at(0.25), at(0.75)];
}

export type MidfarSummary = {
  /** 区間の始まり（start を与えたときはその値） */
  start: number | undefined;
  /** 足元・上端・高さ・幅の中央値（使えたコマ） */
  foot: number | undefined;
  top: number | undefined;
  height: number | undefined;
  width: number | undefined;
  /** 使えたコマと、足元が候補のコマ（区間の始まりから後・測った範囲の全体） */
  used: number;
  candidates: number;
  candidatesAll: number;
  footMode: number | undefined;
  footQuartiles: [number, number] | undefined;
  landing: MidfarLanding;
};

/**
 * 測った範囲のフレームから中遠の足元を出す。区間の始まり（start。無ければ midfarStart）の後 150f を除き、
 * 足元が候補で、隠れていない・端に接していない・高さが 290px 未満のコマの中央値を取る。
 */
export function summarizeMidfar(rows: readonly MidfarRow[], start = midfarStart(rows)): MidfarSummary {
  const all = rows.filter(isCandidate);
  const candidates = start === undefined ? [] : all.filter((r) => r.frame >= start);
  const used =
    start === undefined
      ? []
      : candidates.filter(
          (r) =>
            r.frame >= start + SKIP_AFTER_START &&
            r.clipped !== true &&
            r.fx !== undefined &&
            r.fx < FX_HIDDEN &&
            r.y1! - r.y0! < HEIGHT_MAX,
        );
  const foot = median(used.map((r) => r.y1!));
  return {
    start,
    foot,
    top: median(used.map((r) => r.y0!)),
    height: median(used.map((r) => r.y1! - r.y0!)),
    width: median(used.map((r) => r.x1! - r.x0!)),
    used: used.length,
    candidates: candidates.length,
    candidatesAll: all.length,
    footMode: mode(used.map((r) => r.y1!)),
    footQuartiles: quartiles(used.map((r) => r.y1!)),
    landing: midfarLandingOf(foot, used.length),
  };
}

const COLUMNS = ['frame', 'tgt_x0', 'tgt_y0', 'tgt_x1', 'tgt_y1', 'tgt_clipped', 'fx'] as const;

export function formatMidfarTsv(rows: readonly MidfarRow[]): string {
  const cell = (v: number | boolean | undefined): string =>
    v === undefined ? '' : typeof v === 'boolean' ? (v ? '1' : '0') : String(v);
  return [
    COLUMNS.join('\t'),
    ...rows.map((r) =>
      [r.frame, cell(r.x0), cell(r.y0), cell(r.x1), cell(r.y1), cell(r.clipped), cell(r.fx)].join('\t'),
    ),
  ].join('\n');
}

export function parseMidfarTsv(text: string): MidfarRow[] {
  const num = (s: string | undefined): number | undefined => (s === undefined || s === '' ? undefined : Number(s));
  return text
    .split('\n')
    .slice(1)
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const [frame, x0, y0, x1, y1, clipped, fx] = line.split('\t');
      const row: MidfarRow = { frame: Number(frame) };
      if (y1 === undefined || y1 === '') return row;
      return { ...row, x0: num(x0), y0: num(y0), x1: num(x1), y1: num(y1), clipped: clipped === '1', fx: num(fx) };
    });
}
