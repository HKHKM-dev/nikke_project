// 戦場の背景（全解像度の中央値）と、背景を今のフレームの色に合わせる係数（coverage.ts・sg-dots.ts が使う）。
import { FIELD, W, findLines, linesVisible, readFrames, type Rgb } from './aim-lib.ts';
import { isOverlayColor, median } from './coverage-lib.ts';

export const FIELD_H = FIELD.y1 - FIELD.y0;

/** 戦場（y FIELD.y0〜y1）の、first〜last の step ごとの戦闘中のフレーム（照準の線が見える）の画素ごとの中央値 */
export async function fieldBackground(
  video: string,
  first: number,
  last: number,
  step: number,
  log: (m: string) => void = () => {},
): Promise<Uint8Array> {
  const frames: Uint8Array[] = [];
  for await (const { img } of readFrames(video, first, last, step, { y: FIELD.y0, h: FIELD_H })) {
    if (linesVisible(findLines(img, FIELD.y0))) frames.push(img.data);
  }
  const n = frames.length;
  log(`背景: 戦闘中のフレーム ${n} の中央値`);
  const out = new Uint8Array(W * FIELD_H * 3);
  const col = new Uint8Array(n);
  for (let i = 0; i < out.length; i++) {
    for (let k = 0; k < n; k++) col[k] = frames[k]![i]!;
    col.sort();
    out[i] = col[n >> 1] ?? 0;
  }
  return out;
}

/** 背景を今のフレームの色に合わせる係数（点 (cx, cy) の周り ±200px の、重なりでない画素で。aim-lib の fitTint と同じ当てはめ） */
export function fitTintAround(
  img: Rgb,
  bg: Uint8Array,
  cx: number,
  cy: number,
  keep: (x: number, y: number) => boolean = () => true,
): { a: number; b: number }[] {
  const out: { a: number; b: number }[] = [];
  for (let c = 0; c < 3; c++) {
    const xs: number[] = [];
    const ys: number[] = [];
    for (let y = Math.max(FIELD.y0, Math.round(cy) - 200); y < Math.min(FIELD.y1, Math.round(cy) + 200); y += 5) {
      for (let x = Math.max(0, Math.round(cx) - 200); x < Math.min(W, Math.round(cx) + 200); x += 5) {
        const fi = (y * W + x) * 3;
        if (!keep(x, y) || isOverlayColor(img.data[fi]!, img.data[fi + 1]!, img.data[fi + 2]!)) continue;
        xs.push(bg[((y - FIELD.y0) * W + x) * 3 + c]!);
        ys.push(img.data[fi + c]!);
      }
    }
    let a = 1;
    let b = median(ys.map((y, k) => y - xs[k]!));
    for (const cut of [40, 20]) {
      let n = 0;
      let sx = 0;
      let sy = 0;
      let sxx = 0;
      let sxy = 0;
      for (let k = 0; k < xs.length; k++) {
        const x = xs[k]!;
        const y = ys[k]!;
        if (Math.abs(y - (a * x + b)) > cut) continue;
        n += 1;
        sx += x;
        sy += y;
        sxx += x * x;
        sxy += x * y;
      }
      const den = n * sxx - sx * sx;
      if (n < 30 || den <= 0) break;
      a = (n * sxy - sx * sy) / den;
      b = (sy - a * sx) / n;
    }
    out.push({ a, b });
  }
  return out;
}
