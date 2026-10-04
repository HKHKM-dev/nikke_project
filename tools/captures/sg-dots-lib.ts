// SG の着弾点を探す所（sg-dots.ts が点を探し、sg-map.ts が当たる確率の地図の見込みの数を置く。V-0128・V-0129）
import type { Aim } from './aim-lib.ts';
import { UNKNOWN, maskReticle, type Window } from './coverage-lib.ts';

/** 点を探す範囲（照準の中心から。SG の照準円の半径 約 71px と余白 15px。上に流れる数字を拾わないよう、広げすぎない） */
export const SEARCH_R = 86;
/** 窓の余白 */
export const MARGIN = 140;
/**
 * 点を探さない HUD（照準からの相対）: 残弾の箱とスキルのアイコン、その下の白いゲージ。ゲージは光ったり伸びたりして
 * 点と取り違える（録画 109 の f6248。2026-10-04）
 */
export const DOT_HUD = [
  { x0: -135, x1: -30, y0: -32, y1: 36 },
  { x0: -140, x1: 5, y0: 36, y1: 60 },
];

/** 照準の印と残弾の箱を除く画素（窓の座標。不明 = 除く） */
export function exclusionOf(aim: Aim): Window {
  const rect = { x0: Math.round(aim.x) - MARGIN, y0: Math.round(aim.y) - MARGIN, w: 2 * MARGIN + 1, h: 2 * MARGIN + 1 };
  const excl: Window = { ...rect, labels: new Int8Array(rect.w * rect.h) };
  maskReticle(excl, aim, aim.type, aim.size);
  for (let j = 0; j < excl.h; j++)
    for (let i = 0; i < excl.w; i++) {
      const dx = excl.x0 + i - aim.x;
      const dy = excl.y0 + j - aim.y;
      if (DOT_HUD.some((b) => dx >= b.x0 && dx <= b.x1 && dy >= b.y0 && dy <= b.y1))
        excl.labels[j * excl.w + i] = UNKNOWN;
    }
  return excl;
}

/** 画素 (x, y) で点を探すか（照準の中心から SEARCH_R 以内で、除く所でない。照準は撃つ 1 コマ前のもの） */
export function searchable(excl: Window, aim: { x: number; y: number }, x: number, y: number): boolean {
  if (Math.hypot(x - Math.round(aim.x), y - Math.round(aim.y)) > SEARCH_R) return false;
  const i = x - excl.x0;
  const j = y - excl.y0;
  return !(i >= 0 && i < excl.w && j >= 0 && j < excl.h && excl.labels[j * excl.w + i] === UNKNOWN);
}
