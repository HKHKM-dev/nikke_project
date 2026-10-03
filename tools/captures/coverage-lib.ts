// 被覆率（照準円のうち的の当たり判定に入る割合）を、発ごとに数える部品（純粋な関数）。coverage.ts が使う。
// plan/design-bullet-hit-rate-frame-coverage.md 2 節。
//
// - 照準の周りの窓の画素を「的・背景・不明」に分ける。不明は、照準のリング・ポップアップの数字・着弾の光・HUD の赤い表示など、
//   的の上に重なって的か背景かが見えない画素。不明は、周りの分かっている画素から埋める（2 節 3 の前処理）。
// - 照準の中心からの距離ごとに、的の画素と全部の画素を数え（m(r)）、照準円の大きさ s の格子ごとの被覆率を一度に出す（2 節 4）。
//   一様: 半径 R の中の的の画素 ÷ 半径 R の中の画素。正規: 重み exp(−r²/2σ²)（σ = R/√2）を付けた同じ比。
// - 発のフレームは、HUD の増分のまとまり（マガジン）と連射の間隔から割り出す（V-0118 の数え方。2 節 1）。

/** 照準円の画面上の半径 = 0.285 × CDN の値（C-0038） */
export const CIRCLE_PX_PER_SCALE = 0.285;

export type CoverageConfig = {
  /** 設定の版。設定を変えたら上げる（出力に残す。2 節 6） */
  version: number;
  /** s の格子（CDN の単位。0 は「照準の中心の画素が的か」） */
  sGrid: number[];
  /** 範囲の武器の s（1 発ごとの C_t を出す値と、不明の割合を測る円） */
  sShot: number;
  /** 背景より暗い（明るさの差 < −dark）画素を的とする */
  dark: number;
  /** 重なり（不明）の画素を、この px だけ膨らませる（数字の黒い縁・にじみを入れる） */
  overlayDilate: number;
  /** 的の画素を 3×3 で開く回数（背景の揺れでできた 1px の線を消す） */
  openTarget: number;
  /** sShot の照準円の中で、埋める前に不明だった画素の割合がこれを超える発は落とす */
  maxUnknown: number;
  /** HUD の増分の空きがこれ（f）を超えたら、まとまり（マガジン）を分ける */
  magazineGap: number;
  /** 区間の切れ目: 空きの前後で、的の足元の y がこれ（px）以上、または照準の高さの幅がこの割合以上変わる */
  sectionDy: number;
  sectionDw: number;
  /** 近 B: 照準の高さの幅がこれ（px）以上（C-0155） */
  nearBMinWidth: number;
  /** 中遠の着地点の足元の y（C-0044） */
  midFarFootY: { midFarA: number; midFarB: number; midFarC: number };
};

export type Label = 0 | 1 | -1;
export const BG = 0;
export const TARGET = 1;
export const UNKNOWN = -1;

/** 的の上に重なる表示（照準・数字・着弾の光・HUD の赤）の色か */
export function isOverlayColor(r: number, g: number, b: number): boolean {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  if (mn > 190 && mx - mn < 45) return true; // 白（照準のリング・十字・数字・着弾の芯）
  if (g > 170 && b > 150 && r < g - 50) return true; // 水色（適正距離の照準）
  if (r > 190 && g > 100 && b < 110) return true; // オレンジ〜黄色（着弾の光・会心の数字）
  if (r > 150 && g < 100 && b < 100) return true; // 赤（HUD の残弾の箱・TARGET の帯・コアの光）
  return false;
}

/** 窓（照準の周りの正方形）の画素の分類。x0・y0 は窓の左上の画面の座標 */
export type Window = { x0: number; y0: number; w: number; h: number; labels: Int8Array };

/**
 * 窓の画素を分ける。frame は全画面の RGB（1920 幅）、bg は戦場（y fieldY0〜fieldY1）の全解像度の背景。
 * tint は背景を今のフレームの色に合わせる係数（チャンネルごとに a·bg + b）。hudBox は不明にする HUD の矩形（画面の座標）。
 */
export function classifyWindow(
  frame: Uint8Array,
  frameW: number,
  bg: Uint8Array,
  field: { y0: number; y1: number },
  tint: { a: number; b: number }[],
  center: { x: number; y: number },
  half: number,
  cfg: Pick<CoverageConfig, 'dark' | 'overlayDilate' | 'openTarget'>,
  hudBoxes: { x0: number; y0: number; x1: number; y1: number }[] = [],
): Window {
  const x0 = Math.round(center.x) - half;
  const y0 = Math.round(center.y) - half;
  const w = 2 * half + 1;
  const h = 2 * half + 1;
  const labels = new Int8Array(w * h);
  const overlay = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) {
    const y = y0 + j;
    for (let i = 0; i < w; i++) {
      const x = x0 + i;
      const p = j * w + i;
      if (x < 0 || x >= frameW || y < field.y0 || y >= field.y1) {
        labels[p] = UNKNOWN;
        continue;
      }
      const fi = (y * frameW + x) * 3;
      const r = frame[fi]!;
      const g = frame[fi + 1]!;
      const b = frame[fi + 2]!;
      if (isOverlayColor(r, g, b) || hudBoxes.some((q) => x >= q.x0 && x <= q.x1 && y >= q.y0 && y <= q.y1)) {
        overlay[p] = 1;
        continue;
      }
      const bi = ((y - field.y0) * frameW + x) * 3;
      let d = 0;
      d += r - (tint[0]!.a * bg[bi]! + tint[0]!.b);
      d += g - (tint[1]!.a * bg[bi + 1]! + tint[1]!.b);
      d += b - (tint[2]!.a * bg[bi + 2]! + tint[2]!.b);
      labels[p] = d / 3 < -cfg.dark ? TARGET : BG;
    }
  }
  let target: Uint8Array = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) target[p] = labels[p] === TARGET ? 1 : 0;
  for (let k = 0; k < cfg.openTarget; k++) target = dilate(erode(target, w, h), w, h);
  let ov: Uint8Array = overlay;
  for (let k = 0; k < cfg.overlayDilate; k++) ov = dilate(ov, w, h);
  for (let p = 0; p < w * h; p++) {
    if (labels[p] === UNKNOWN) continue;
    labels[p] = ov[p] ? UNKNOWN : target[p] ? TARGET : BG;
  }
  return { x0, y0, w, h, labels };
}

/** 3×3 の収縮・膨張（窓の外は 0） */
export function erode(src: Uint8Array, w: number, h: number): Uint8Array {
  return morph(src, w, h, true);
}
export function dilate(src: Uint8Array, w: number, h: number): Uint8Array {
  return morph(src, w, h, false);
}
function morph(src: Uint8Array, w: number, h: number, isErode: boolean): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = isErode ? 1 : 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const yy = y + dy;
          const xx = x + dx;
          const m = yy >= 0 && yy < h && xx >= 0 && xx < w ? src[yy * w + xx]! : 0;
          if (isErode && !m) v = 0;
          if (!isErode && m) v = 1;
        }
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

/**
 * 不明の画素を、分かっている 8 近傍の多数決で外側から順に埋める（同数なら的）。窓の外につながる不明は最後まで残りうるので、
 * 残ったものは背景にする。埋めた画素の数を返す。
 */
export function fillUnknown(win: Window): number {
  const { w, h, labels } = win;
  let filled = 0;
  for (;;) {
    const next: [number, Label][] = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        if (labels[p] !== UNKNOWN) continue;
        let t = 0;
        let b = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const yy = y + dy;
            const xx = x + dx;
            if ((dx === 0 && dy === 0) || yy < 0 || yy >= h || xx < 0 || xx >= w) continue;
            const l = labels[yy * w + xx];
            if (l === TARGET) t += 1;
            else if (l === BG) b += 1;
          }
        }
        if (t + b > 0) next.push([p, t >= b ? TARGET : BG]);
      }
    }
    if (next.length === 0) break;
    for (const [p, l] of next) labels[p] = l;
    filled += next.length;
  }
  for (let p = 0; p < w * h; p++) if (labels[p] === UNKNOWN) labels[p] = BG;
  return filled;
}

/** 照準の中心（画面の座標）から半径 r 以内の画素のうち、条件を満たすものの割合 */
export function fractionWithin(
  win: Window,
  center: { x: number; y: number },
  r: number,
  pred: (label: number) => boolean,
): number {
  let n = 0;
  let k = 0;
  for (let j = 0; j < win.h; j++) {
    for (let i = 0; i < win.w; i++) {
      if (Math.hypot(win.x0 + i - center.x, win.y0 + j - center.y) > r) continue;
      n += 1;
      if (pred(win.labels[j * win.w + i]!)) k += 1;
    }
  }
  return n ? k / n : NaN;
}

/** 距離の刻み（px） */
export const BIN = 0.05;

/** 照準の中心（画面の座標）から画素の中心までの距離ごとの、的の画素と全部の画素の数（rMax まで） */
export function radialHistogram(
  win: Window,
  center: { x: number; y: number },
  rMax: number,
): { target: Float64Array; all: Float64Array } {
  const n = Math.ceil(rMax / BIN) + 1;
  const target = new Float64Array(n);
  const all = new Float64Array(n);
  for (let j = 0; j < win.h; j++) {
    for (let i = 0; i < win.w; i++) {
      const d = Math.hypot(win.x0 + i - center.x, win.y0 + j - center.y);
      if (d > rMax) continue;
      const k = Math.floor(d / BIN);
      all[k] = all[k]! + 1;
      if (win.labels[j * win.w + i] === TARGET) target[k] = target[k]! + 1;
    }
  }
  return { target, all };
}

/**
 * s の格子ごとの被覆率（一様・正規）。s = 0（と R が 0.5px 未満）は、照準の中心を含む画素が的なら 1。
 * 一様は半径 R 以内の画素の数の比、正規は exp(−r²/2σ²)（σ = R/√2）を重みにした比（3R まで）。
 */
export function coverageOf(
  hist: { target: Float64Array; all: Float64Array },
  sGrid: readonly number[],
  centerIsTarget: boolean,
): { uniform: number[]; normal: number[] } {
  const uniform: number[] = [];
  const normal: number[] = [];
  for (const s of sGrid) {
    const R = CIRCLE_PX_PER_SCALE * s;
    if (R < 0.5) {
      uniform.push(centerIsTarget ? 1 : 0);
      normal.push(centerIsTarget ? 1 : 0);
      continue;
    }
    let ut = 0;
    let ua = 0;
    let nt = 0;
    let na = 0;
    const kU = Math.min(hist.all.length - 1, Math.floor(R / BIN));
    const kN = Math.min(hist.all.length - 1, Math.floor((3 * R) / BIN));
    const twoSigma2 = R * R; // 2σ² = R²
    for (let k = 0; k <= Math.max(kU, kN); k++) {
      const r = (k + 0.5) * BIN;
      if (k <= kU) {
        ut += hist.target[k]!;
        ua += hist.all[k]!;
      }
      if (k <= kN) {
        const wgt = Math.exp(-(r * r) / twoSigma2);
        nt += hist.target[k]! * wgt;
        na += hist.all[k]! * wgt;
      }
    }
    uniform.push(ua ? ut / ua : NaN);
    normal.push(na ? nt / na : NaN);
  }
  return { uniform, normal };
}

/** HUD の増分のフレームを、空き（> gap）でまとまり（マガジン）に分ける */
export function magazinesOf(frames: readonly number[], gap: number): { first: number; last: number; hits: number }[] {
  const out: { first: number; last: number; hits: number }[] = [];
  for (const f of [...frames].sort((a, b) => a - b)) {
    const cur = out[out.length - 1];
    if (cur && f - cur.last <= gap) {
      cur.last = f;
      cur.hits += 1;
    } else out.push({ first: f, last: f, hits: 1 });
  }
  return out;
}

/**
 * 連射の間隔（f）。最初と最後の増分の間が (maxAmmo − 1) 発ぶんに見えるまとまり（名目の間隔の ±10%）の、間隔の中央値。
 * 見つからなければ名目の間隔（3600 ÷ rateOfFire）。
 */
export function shotIntervalOf(
  mags: readonly { first: number; last: number }[],
  maxAmmo: number,
  rateOfFire: number,
): number {
  const nominal = 3600 / rateOfFire;
  const v = mags
    .map((m) => (m.last - m.first) / (maxAmmo - 1))
    .filter((x) => x > nominal * 0.9 && x < nominal * 1.1)
    .sort((a, b) => a - b);
  if (v.length === 0) return nominal;
  const m = v.length >> 1;
  return v.length % 2 ? v[m]! : (v[m - 1]! + v[m]!) / 2;
}

/** まとまりごとに、最初の増分から間隔ごとに、最後の増分までの発のフレーム（四捨五入）。まとまりの番号も返す */
export function shotFramesOf(
  mags: readonly { first: number; last: number }[],
  interval: number,
): { frame: number; magazine: number }[] {
  const out: { frame: number; magazine: number }[] = [];
  mags.forEach((m, i) => {
    for (let k = 0; m.first + k * interval <= m.last + 0.5; k++) {
      out.push({ frame: Math.round(m.first + k * interval), magazine: i });
    }
  });
  return out;
}

/** 区間の帯の並び（`data/enemies.json` の range-3min-jump の landings）から、区間ごとの着地点の id を決める */
export function landingOf(
  band: string,
  stats: { bandW: number; footY: number },
  cfg: Pick<CoverageConfig, 'nearBMinWidth' | 'midFarFootY'>,
): string {
  if (band === 'near') return stats.bandW >= cfg.nearBMinWidth ? 'nearB' : 'nearA';
  if (band === 'midFar') {
    let best = 'midFarB';
    let bd = Infinity;
    for (const [id, y] of Object.entries(cfg.midFarFootY)) {
      const d = Math.abs(stats.footY - y);
      if (d < bd) {
        bd = d;
        best = id;
      }
    }
    return best;
  }
  return band;
}

export function median(v: readonly number[]): number {
  const s = v.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (s.length === 0) return NaN;
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}
