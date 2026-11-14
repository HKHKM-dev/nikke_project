// 一時停止・戦闘履歴のパネルの検出（probe-result.ts）の純粋な部分。probe-result-lib.test.ts でテストする。録画は読まない。
// 数字は読まない（OCR は実用にならなかった。design-stage12.md 0.3 節）。パネルを探して切り出すまでが機械、読字は目視。
import type { Crop } from './ffmpeg.ts';

/** 座標の基準の大きさ。ほかの大きさの録画は比で直す */
export const BASE = { width: 1920, height: 1080 } as const;

export function scaleCrop(crop: Crop, width: number, height: number): Crop {
  const sx = width / BASE.width;
  const sy = height / BASE.height;
  return {
    x: Math.round(crop.x * sx),
    y: Math.round(crop.y * sy),
    w: Math.round(crop.w * sx),
    h: Math.round(crop.h * sy),
  };
}

// ---- 一時停止・戦闘履歴のパネルの検出 ----
//
// 検出は 2 つの特徴の AND:
//   1. 中央のカードが明るく、周囲が暗い（パネルが開くと背景が暗幕になる）
//   2. カード上部に青いヘッダー帯がある（これが無いと射撃場の出撃画面を拾ってしまう）
// 実測（録画 0004・0017・0021）では パネル 60〜87% に対し 出撃画面・戦闘中は 0〜24% と離れている。

/** 判定用の縮小サイズ。パネルが開いているかが分かれば十分なので粗くてよい */
export const PANEL_DETECT = { w: 64, h: 36 } as const;
/** パネル内部の白いカード（画面サイズに対する割合） */
const CARD = { x0: 0.37, y0: 0.22, x1: 0.64, y1: 0.85 };
/** パネル上部の青いヘッダー帯（画面サイズに対する割合） */
const HEADER = { x0: 0.36, y0: 0.03, x1: 0.65, y1: 0.2 };
/** 既定の閾値（明暗差は輝度の差、青は占有率） */
export const PANEL_THRESHOLDS = { contrast: 60, blue: 0.4 } as const;
/** パネル全体の切り出し（一時停止・戦闘履歴のどちらも収まる） */
export const PANEL_CROP: Crop = { x: 640, y: 40, w: 660, h: 990 };

export type PanelFeatures = { contrast: number; blue: number };

/** 縮小フレーム（PANEL_DETECT の大きさの rgb24）の、カードの明暗差と青ヘッダーの占有率 */
export function measurePanel(frame: Uint8Array): PanelFeatures {
  const { w: W, h: H } = PANEL_DETECT;
  const px = (v: number, n: number) => Math.round(v * n);
  const card = { x0: px(CARD.x0, W), x1: px(CARD.x1, W), y0: px(CARD.y0, H), y1: px(CARD.y1, H) };
  const head = { x0: px(HEADER.x0, W), x1: px(HEADER.x1, W), y0: px(HEADER.y0, H), y1: px(HEADER.y1, H) };
  let inner = 0;
  let innerCount = 0;
  let outer = 0;
  let outerCount = 0;
  let blueHit = 0;
  let blueCount = 0;
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const offset = (y * W + x) * 3;
      const r = frame[offset]!;
      const g = frame[offset + 1]!;
      const b = frame[offset + 2]!;
      const luma = (r * 299 + g * 587 + b * 114) / 1000;
      if (x >= card.x0 && x < card.x1 && y >= card.y0 && y < card.y1) {
        inner += luma;
        innerCount += 1;
      } else {
        outer += luma;
        outerCount += 1;
      }
      if (x >= head.x0 && x < head.x1 && y >= head.y0 && y < head.y1) {
        blueCount += 1;
        // NIKKE のパネルのヘッダーは彩度の高い青。背景の暗幕や白いカードとは離れている。
        if (b > r + 40 && b > 110) blueHit += 1;
      }
    }
  }
  return { contrast: inner / innerCount - outer / outerCount, blue: blueHit / blueCount };
}

export function isPanel(f: PanelFeatures, t: PanelFeatures = PANEL_THRESHOLDS): boolean {
  return f.contrast >= t.contrast && f.blue >= t.blue;
}

/** 判定が立った区間（サンプルのフレーム番号で、両端を含む） */
export type Run = { from: number; to: number };

/** 判定が立ったサンプルを、連続したものどうしでまとめる（samples はフレーム順） */
export function runsOf<T extends { frame: number }>(samples: readonly T[], hit: (s: T) => boolean): Run[] {
  const runs: Run[] = [];
  let current: Run | null = null;
  for (const s of samples) {
    if (hit(s)) {
      if (current === null) current = { from: s.frame, to: s.frame };
      else current.to = s.frame;
    } else if (current !== null) {
      runs.push(current);
      current = null;
    }
  }
  if (current !== null) runs.push(current);
  return runs;
}
