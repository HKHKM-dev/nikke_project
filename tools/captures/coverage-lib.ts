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
  /** 白い画素は、背景よりこれ以上明るいときだけ重なり（不明）にする（明るい霧を不明にしない） */
  whiteOverBg: number;
  /** 重なり（不明）の画素を、この px だけ膨らませる（数字の黒い縁・にじみを入れる） */
  overlayDilate: number;
  /** 的の画素を 3×3 で開く回数（背景の揺れでできた 1px の線を消す） */
  openTarget: number;
  /** 的の画素を 3×3 で閉じる回数（霧で薄い的の、まばらな点をつなぐ。手足の間の隙間より小さく） */
  closeTarget: number;
  /** 外（窓の縁）につながらない背景の穴のうち、面積がこれ（px）以下のものを的にする（光沢・白飛びの穴）。0 なら埋めない。
   * 足元の影で左右の足がつながると、脚の間の隙間も外につながらない穴になるので、面積で分ける */
  fillHoles: number;
  /** 的の基準点（重心）から除く、照準の中心の周りの半径（px） */
  anchorExclude: number;
  /** 正規の被覆率は、この発の数ごとに 1 発で出す（計算の量を抑える） */
  normalEvery: number;
  /** 撃っていないコマ: 最後の増分からこれ（f）より後、次の最初の増分のこれ（f）より前で、この間隔（f）ごとに取る */
  cleanAfter: number;
  cleanBefore: number;
  cleanStep: number;
  /** 撃っていないコマ・発のフレームの的の、照準の周りの明るい画素の割合（aim-lib の fx）がこれ以上なら使わない */
  maxFx: number;
  /** 自己検査で地図から抜いて確かめる見本の数の上限（時間に散らして選ぶ） */
  maxSamples: number;
  /** 正規の被覆率を出す s（一様は sGrid の全部） */
  sGridNormal: number[];
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

/** 白（照準のリング・十字・数字・着弾の芯）の色か */
export function isWhite(r: number, g: number, b: number): boolean {
  return Math.min(r, g, b) > 190 && Math.max(r, g, b) - Math.min(r, g, b) < 45;
}

/** 的の上に重なる表示（照準・数字・着弾の光・HUD の赤）の色か。白は、背景との比べを別にする（classifyRect） */
export function isOverlayColor(r: number, g: number, b: number): boolean {
  if (isWhite(r, g, b)) return true;
  if (g > 170 && b > 150 && r < g - 50) return true; // 水色（適正距離の照準）
  if (r > 190 && g > 100 && b < 110) return true; // オレンジ〜黄色（着弾の光・会心の数字）
  if (r > 150 && g < 100 && b < 100) return true; // 赤（HUD の残弾の箱・TARGET の帯・コアの光）
  return false;
}

/** 照準円の円（半透明の灰色で背景を暗くする）。中は tint で背景と比べ、縁の ±edge px は不明にする */
export type AimDisk = { x: number; y: number; r: number; edge: number; tint: { a: number; b: number }[] };

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
  cfg: Pick<CoverageConfig, 'dark' | 'overlayDilate' | 'openTarget' | 'closeTarget' | 'fillHoles' | 'whiteOverBg'>,
  hudBoxes: { x0: number; y0: number; x1: number; y1: number }[] = [],
): Window {
  const rect = { x0: Math.round(center.x) - half, y0: Math.round(center.y) - half, w: 2 * half + 1, h: 2 * half + 1 };
  return classifyRect(frame, frameW, bg, field, tint, rect, cfg, hudBoxes);
}

/** 矩形（画面の座標）の画素を分ける。classifyWindow の本体 */
export function classifyRect(
  frame: Uint8Array,
  frameW: number,
  bg: Uint8Array,
  field: { y0: number; y1: number },
  tint: { a: number; b: number }[],
  rect: { x0: number; y0: number; w: number; h: number },
  cfg: Pick<CoverageConfig, 'dark' | 'overlayDilate' | 'openTarget' | 'closeTarget' | 'fillHoles' | 'whiteOverBg'>,
  hudBoxes: { x0: number; y0: number; x1: number; y1: number }[] = [],
  disk?: AimDisk,
): Window {
  const { x0, y0, w, h } = rect;
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
      const bi = ((y - field.y0) * frameW + x) * 3;
      // 照準円（半透明の灰色の円）の中は、円の中で当てはめた係数で背景と比べる。縁の帯は不明
      let tt = tint;
      if (disk) {
        const dr = Math.hypot(x - disk.x, y - disk.y) - disk.r;
        if (Math.abs(dr) <= disk.edge) {
          labels[p] = UNKNOWN;
          continue;
        }
        if (dr < 0) tt = disk.tint;
      }
      let d = 0;
      d += r - (tt[0]!.a * bg[bi]! + tt[0]!.b);
      d += g - (tt[1]!.a * bg[bi + 1]! + tt[1]!.b);
      d += b - (tt[2]!.a * bg[bi + 2]! + tt[2]!.b);
      d /= 3;
      const over = isWhite(r, g, b) ? d > cfg.whiteOverBg : isOverlayColor(r, g, b);
      if (over || hudBoxes.some((q) => x >= q.x0 && x <= q.x1 && y >= q.y0 && y <= q.y1)) {
        overlay[p] = 1;
        continue;
      }
      labels[p] = d < -cfg.dark ? TARGET : BG;
    }
  }
  let target: Uint8Array = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) target[p] = labels[p] === TARGET ? 1 : 0;
  for (let k = 0; k < cfg.openTarget; k++) target = dilate(erode(target, w, h), w, h);
  if (cfg.closeTarget > 0) {
    for (let k = 0; k < cfg.closeTarget; k++) target = dilate(target, w, h);
    for (let k = 0; k < cfg.closeTarget; k++) target = erode(target, w, h);
  }
  let ov: Uint8Array = overlay;
  for (let k = 0; k < cfg.overlayDilate; k++) ov = dilate(ov, w, h);
  for (let p = 0; p < w * h; p++) {
    if (labels[p] === UNKNOWN) continue;
    labels[p] = ov[p] ? UNKNOWN : target[p] ? TARGET : BG;
  }
  if (cfg.fillHoles > 0) fillHoles(labels, w, h, cfg.fillHoles);
  return { x0, y0, w, h, labels };
}

/** 窓の縁から、的でない画素（背景・不明）を通ってたどり着けない背景の塊のうち、面積が maxArea 以下のものを的にする */
export function fillHoles(labels: Int8Array, w: number, h: number, maxArea: number): void {
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (p: number): void => {
    if (!seen[p] && labels[p] !== TARGET) {
      seen[p] = 1;
      stack.push(p);
    }
  };
  for (let i = 0; i < w; i++) {
    push(i);
    push((h - 1) * w + i);
  }
  for (let j = 0; j < h; j++) {
    push(j * w);
    push(j * w + w - 1);
  }
  while (stack.length) {
    const p = stack.pop()!;
    const x = p % w;
    if (x > 0) push(p - 1);
    if (x < w - 1) push(p + 1);
    if (p >= w) push(p - w);
    if (p < (h - 1) * w) push(p + w);
  }
  // たどり着けなかった背景を塊に分け、小さい塊だけ埋める
  for (let p0 = 0; p0 < w * h; p0++) {
    if (labels[p0] !== BG || seen[p0]) continue;
    const comp: number[] = [];
    seen[p0] = 1;
    stack.push(p0);
    while (stack.length) {
      const p = stack.pop()!;
      comp.push(p);
      const x = p % w;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
        if (q < 0 || q >= w * h || seen[q] || labels[q] !== BG) continue;
        seen[q] = 1;
        stack.push(q);
      }
    }
    if (comp.length <= maxArea) for (const p of comp) labels[p] = TARGET;
  }
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
  const N8 = [-1, 0, 1];
  const knownNeighbor = (p: number): boolean => {
    const x = p % w;
    const y = (p - x) / w;
    for (const dy of N8)
      for (const dx of N8) {
        const xx = x + dx;
        const yy = y + dy;
        if ((dx || dy) && xx >= 0 && xx < w && yy >= 0 && yy < h && labels[yy * w + xx] !== UNKNOWN) return true;
      }
    return false;
  };
  // 分かっている画素に接する不明から、外側の層ごとに埋める（層の中では、その層の前の値で多数決）
  let frontier: number[] = [];
  for (let p = 0; p < w * h; p++) if (labels[p] === UNKNOWN && knownNeighbor(p)) frontier.push(p);
  const queued = new Uint8Array(w * h);
  for (const p of frontier) queued[p] = 1;
  let filled = 0;
  while (frontier.length) {
    const assign: Label[] = frontier.map((p) => {
      const x = p % w;
      const y = (p - x) / w;
      let t = 0;
      let b = 0;
      for (const dy of N8)
        for (const dx of N8) {
          const xx = x + dx;
          const yy = y + dy;
          if ((dx === 0 && dy === 0) || xx < 0 || xx >= w || yy < 0 || yy >= h) continue;
          const l = labels[yy * w + xx];
          if (l === TARGET) t += 1;
          else if (l === BG) b += 1;
        }
      return t >= b ? TARGET : BG;
    });
    frontier.forEach((p, i) => (labels[p] = assign[i]!));
    filled += frontier.length;
    const next: number[] = [];
    for (const p of frontier) {
      const x = p % w;
      const y = (p - x) / w;
      for (const dy of N8)
        for (const dx of N8) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || xx >= w || yy < 0 || yy >= h) continue;
          const q = yy * w + xx;
          if (labels[q] === UNKNOWN && !queued[q]) {
            queued[q] = 1;
            next.push(q);
          }
        }
    }
    frontier = next;
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

/**
 * 中心（画面の座標）から画素の中心までの距離ごとの、的の画素と全部の画素の数（rMax まで）。窓の外の画素は背景として数える
 * （全部の画素には入れる）。
 */
export function radialHistogram(
  win: Window,
  center: { x: number; y: number },
  rMax: number,
): { target: Float64Array; all: Float64Array } {
  const n = Math.ceil(rMax / BIN) + 1;
  const target = new Float64Array(n);
  const all = new Float64Array(n);
  const r2max = rMax * rMax;
  for (let y = Math.floor(center.y - rMax); y <= Math.ceil(center.y + rMax); y++) {
    const dy = y - center.y;
    const j = y - win.y0;
    for (let x = Math.floor(center.x - rMax); x <= Math.ceil(center.x + rMax); x++) {
      const dx = x - center.x;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2max) continue;
      const k = Math.floor(Math.sqrt(d2) / BIN);
      all[k] = all[k]! + 1;
      const i = x - win.x0;
      if (i >= 0 && i < win.w && j >= 0 && j < win.h && win.labels[j * win.w + i] === TARGET)
        target[k] = target[k]! + 1;
    }
  }
  return { target, all };
}

/** 中心（画面の座標）を含む画素の分類（窓の外は背景） */
export function labelAt(win: Window, center: { x: number; y: number }): number {
  const i = Math.round(center.x) - win.x0;
  const j = Math.round(center.y) - win.y0;
  return i >= 0 && i < win.w && j >= 0 && j < win.h ? win.labels[j * win.w + i]! : BG;
}

/**
 * s の格子ごとの被覆率（一様・正規）。s = 0（と R が 0.5px 未満）は、照準の中心を含む画素の値（的なら 1、確率の地図なら確率）。
 * 一様は半径 R 以内の画素の数の比、正規は exp(−r²/2σ²)（σ = R/√2）を重みにした比（3R まで）。
 */
export function coverageOf(
  hist: { target: Float64Array; all: Float64Array },
  sGrid: readonly number[],
  centerIsTarget: boolean | number,
  sGridNormal: readonly number[] = sGrid,
): { uniform: number[]; normal: number[] } {
  const atCenter = typeof centerIsTarget === 'number' ? centerIsTarget : centerIsTarget ? 1 : 0;
  // 一様: 半径の小さい順の累積
  const cumT = new Float64Array(hist.all.length);
  const cumA = new Float64Array(hist.all.length);
  let ct = 0;
  let ca = 0;
  for (let k = 0; k < hist.all.length; k++) {
    ct += hist.target[k]!;
    ca += hist.all[k]!;
    cumT[k] = ct;
    cumA[k] = ca;
  }
  const uniform = sGrid.map((s) => {
    const R = CIRCLE_PX_PER_SCALE * s;
    if (R < 0.5) return atCenter;
    const k = Math.min(hist.all.length - 1, Math.floor(R / BIN));
    return cumA[k] ? cumT[k]! / cumA[k]! : NaN;
  });
  const normal = sGridNormal.map((s) => {
    const R = CIRCLE_PX_PER_SCALE * s;
    if (R < 0.5) return atCenter;
    let nt = 0;
    let na = 0;
    const kN = Math.min(hist.all.length - 1, Math.floor((3 * R) / BIN));
    const twoSigma2 = R * R; // 2σ² = R²
    for (let k = 0; k <= kN; k++) {
      if (!hist.all[k]) continue;
      const r = (k + 0.5) * BIN;
      const wgt = Math.exp(-(r * r) / twoSigma2);
      nt += hist.target[k]! * wgt;
      na += hist.all[k]! * wgt;
    }
    return na ? nt / na : NaN;
  });
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

/**
 * 照準の表示（リング・内側の 4 本の印・中心の点・下の縦線、十字の 4 本の腕、画面を横切る細い横線・縦線）を、形から不明にする。
 * 色だけでは、照準の線の縁のにじみ（霧より暗い灰色）を的と取り違える。type・size は aim-lib の findAim の値。
 */
export function maskReticle(
  win: Window,
  aim: { x: number; y: number },
  type: 'ring' | 'cross',
  size: number,
  pad = 4,
): void {
  const at = (x: number, y: number): void => {
    const i = Math.round(x) - win.x0;
    const j = Math.round(y) - win.y0;
    if (i >= 0 && i < win.w && j >= 0 && j < win.h) win.labels[j * win.w + i] = UNKNOWN;
  };
  const reach = (Number.isFinite(size) ? size : 30) + 25;
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
      const r = Math.hypot(dx, dy);
      let hit = false;
      if (r <= 4 + pad / 2) hit = true; // 中心の点
      if (Math.abs(dx) <= 1 || Math.abs(dy) <= 1) hit = true; // 画面を横切る細い線
      if (type === 'ring' && Number.isFinite(size)) {
        if (Math.abs(r - size) <= 2 + pad) hit = true; // リング
        // 内側の斜めの 4 本の印（中心から 6〜22px）
        if (r >= 5 && r <= 22 && Math.abs(Math.abs(dx) - Math.abs(dy)) <= 2 + pad) hit = true;
        // 下の縦線（リングの下から 14px）
        if (Math.abs(dx) <= 2 + pad / 2 && dy >= size - 2 && dy <= size + 14 + pad) hit = true;
      } else {
        // 十字の 4 本の腕（中心から size〜size+20px）
        const inner = Number.isFinite(size) ? size : 12;
        const along = Math.max(Math.abs(dx), Math.abs(dy));
        const across = Math.min(Math.abs(dx), Math.abs(dy));
        if (across <= 2 + pad / 2 && along >= inner - 2 && along <= inner + 20 + pad) hit = true;
      }
      if (hit) at(aim.x + dx, aim.y + dy);
    }
  }
  // 画面を横切る細い線は窓の端まで
  for (let i = 0; i < win.w; i++) for (const o of [-1, 0, 1]) at(win.x0 + i, aim.y + o);
  for (let j = 0; j < win.h; j++) for (const o of [-1, 0, 1]) at(aim.x + o, win.y0 + j);
}

/**
 * 的の確率の地図（基準点からの位置ごとに、見えていた見本の数 vis と、そのうち的だった数 tgt）。
 * 撃っていないコマの見本を基準点で重ね、見えていない画素（不明）は数えない。確率 = tgt ÷ vis（vis が 0 なら背景とみなす）。
 */
export type ProbMap = { x0: number; y0: number; w: number; h: number; tgt: Float32Array; vis: Float32Array };

export function newMap(x0: number, y0: number, w: number, h: number): ProbMap {
  return { x0, y0, w, h, tgt: new Float32Array(w * h), vis: new Float32Array(w * h) };
}

/** 見本の窓を、基準点 anchor が地図の原点に重なるように足す（sign = −1 で引く） */
export function accumulate(map: ProbMap, win: Window, anchor: { x: number; y: number }, sign = 1): void {
  const ox = Math.round(anchor.x);
  const oy = Math.round(anchor.y);
  for (let j = 0; j < win.h; j++) {
    const my = win.y0 + j - oy - map.y0;
    if (my < 0 || my >= map.h) continue;
    for (let i = 0; i < win.w; i++) {
      const mx = win.x0 + i - ox - map.x0;
      if (mx < 0 || mx >= map.w) continue;
      const l = win.labels[j * win.w + i];
      if (l === UNKNOWN) continue;
      const q = my * map.w + mx;
      map.vis[q] = map.vis[q]! + sign;
      if (l === TARGET) map.tgt[q] = map.tgt[q]! + sign;
    }
  }
}

/** 地図の点の確率（地図の外・見えていた見本が無い点は 0） */
export function probAt(map: ProbMap, x: number, y: number): number {
  const mx = Math.round(x) - map.x0;
  const my = Math.round(y) - map.y0;
  if (mx < 0 || mx >= map.w || my < 0 || my >= map.h) return 0;
  const v = map.vis[my * map.w + mx]!;
  return v > 0 ? map.tgt[my * map.w + mx]! / v : 0;
}

/** 地図の上で、中心（基準点からの位置）からの距離ごとの、確率の和と画素の数（radialHistogram の地図版） */
export function mapHistogram(
  map: ProbMap,
  center: { x: number; y: number },
  rMax: number,
): { target: Float64Array; all: Float64Array; hidden: number } {
  const n = Math.ceil(rMax / BIN) + 1;
  const target = new Float64Array(n);
  const all = new Float64Array(n);
  let hidden = 0;
  const r2max = rMax * rMax;
  for (let y = Math.floor(center.y - rMax); y <= Math.ceil(center.y + rMax); y++) {
    const dy = y - center.y;
    const my = y - map.y0;
    for (let x = Math.floor(center.x - rMax); x <= Math.ceil(center.x + rMax); x++) {
      const dx = x - center.x;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2max) continue;
      const k = Math.floor(Math.sqrt(d2) / BIN);
      all[k] = all[k]! + 1;
      const mx = x - map.x0;
      if (mx < 0 || mx >= map.w || my < 0 || my >= map.h) continue;
      const v = map.vis[my * map.w + mx]!;
      if (v > 0) target[k] = target[k]! + map.tgt[my * map.w + mx]! / v;
      else hidden += 1;
    }
  }
  return { target, all, hidden };
}
