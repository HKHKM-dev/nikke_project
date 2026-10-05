// 近の着地点（C-0155）を、照準の高さでの的の幅から決める純粋な部分（レシピ near-landing。V-0069 の読み方の 3）。
import { median } from './triggers.ts';

/** aim.ts の 1 フレームの測定のうち、着地点に使う列（値は aim.ts の CSV と同じ丸め） */
export type AimTargetRow = {
  frame: number;
  /** 照準の中心の y（小数 1 桁）。照準が無ければ undefined */
  aimY: number | undefined;
  /** 的の外接矩形の上端の y。的が無ければ undefined */
  top: number | undefined;
  /** 照準の高さ ±30px の帯での的の幅（整数） */
  bandW: number | undefined;
  /** 照準の周り ±150px の明るい画素の割合（小数 2 桁） */
  fx: number | undefined;
};

/** ふだんの姿勢: 的の上端の y がこれ以上（腕を上げると 170 前後になる。V-0069） */
export const POSE_TOP_MIN = 250;
/** 爆発などで的が隠れている: fx がこれ以上（aim.ts の冒頭） */
export const FX_HIDDEN = 0.45;

/**
 * 着地点の範囲（V-0069・V-0070 の 14 本・近の 28 区間の幅。C-0155）。近 A は 356〜372px、近 B は 409px 以上で、
 * 間の値の区間は無い。範囲の外の幅は決めない。
 */
export const LANDING_A = { min: 356, max: 372 };
export const LANDING_B_MIN = 409;

export type Landing = 'A' | 'B' | '決まらない';

export function landingOf(width: number | undefined): Landing {
  if (width === undefined) return '決まらない';
  if (width >= LANDING_A.min && width <= LANDING_A.max) return 'A';
  if (width >= LANDING_B_MIN) return 'B';
  return '決まらない';
}

export type LandingSummary = {
  /** 使ったフレームの幅の中央値 */
  width: number | undefined;
  used: number;
  total: number;
  /** 使ったフレームの、的の上端の y と照準の中心の y の中央値 */
  top: number | undefined;
  aimY: number | undefined;
  landing: Landing;
};

/** 区間のフレームから、ふだんの姿勢で的が隠れていないものを選び、幅の中央値と着地点を出す */
export function summarizeLanding(rows: readonly AimTargetRow[]): LandingSummary {
  const used = rows.filter(
    (r) =>
      r.top !== undefined && r.top >= POSE_TOP_MIN && r.fx !== undefined && r.fx < FX_HIDDEN && r.bandW !== undefined,
  );
  const width = median(used.map((r) => r.bandW!));
  return {
    width,
    used: used.length,
    total: rows.length,
    top: median(used.map((r) => r.top!)),
    aimY: median(used.flatMap((r) => (r.aimY === undefined ? [] : [r.aimY]))),
    landing: landingOf(width),
  };
}

const COLUMNS = ['frame', 'aim_y', 'tgt_y0', 'tgt_band_w', 'fx'] as const;

export function formatAimTargetTsv(rows: readonly AimTargetRow[]): string {
  const cell = (v: number | undefined): string => (v === undefined ? '' : String(v));
  return [
    COLUMNS.join('\t'),
    ...rows.map((r) => [r.frame, cell(r.aimY), cell(r.top), cell(r.bandW), cell(r.fx)].join('\t')),
  ].join('\n');
}

export function parseAimTargetTsv(text: string): AimTargetRow[] {
  const num = (s: string | undefined): number | undefined => (s === undefined || s === '' ? undefined : Number(s));
  return text
    .split('\n')
    .slice(1)
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const [frame, aimY, top, bandW, fx] = line.split('\t');
      return { frame: Number(frame), aimY: num(aimY), top: num(top), bandW: num(bandW), fx: num(fx) };
    });
}
