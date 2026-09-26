// 射撃場の録画から、照準の中心・コアの中心と半径・的の見かけの大きさと位置をフレームごとに測る（Stage 18-B2。
// plan/design-stage18.md 11.1 の 1・3、11.4）。
//   node tools/captures/aim.ts <動画> [--from N] [--to N] [--step 60] [--csv out.csv] [--debug-dir DIR]
//                                  [--bg-from N] [--bg-to N] [--bg-step 120]
//
// 1920×1080 の録画を前提にする。フレーム番号は index.md「フレーム番号の約束」（デコード順の通し番号）。
// 録画 54・56・57 は pts が 1/60 秒刻みで欠けが無く、fps=60 を通した番号と一致する。
//
// CSV の列（座標は画素の番号。画素の中心が整数）:
//   aim_x, aim_y   照準の中心。aim_conf: 十字は使えた線の本数 / 4（0.25 以下は線の行・列のまま ±1px）、リングは円に乗った方向の割合
//   aim_color      white / cyan（適正距離）/ yellow（フルバースト）/ unknown。aim_type: cross / ring
//   aim_size       十字: 中心から線の内側の端まで。リング: 半径。撃ち続けると段階的に広がる（録画 57 で 12.5 → 17.5 → 22.5）
//   aim_redmark    リング: 内側の斜めに赤い印があるか
//   core_x, core_y, core_r, core_hot  コアの中心・赤い光の半径・芯の画素数（見つからなければ空）
//   hitmark        当たった印（照準の斜め 4 方向の菱形）の色。印があるフレームは照準の中心に着弾のエフェクトも出る
//   dx, dy         照準 − コア
//   tgt_*          的の外接矩形・幅・高さ・中心・面積、tgt_band_w（照準の高さ ±30px の帯での幅）、
//                  tgt_clipped（探す範囲の端に接している）、fx（照準の周り ±150px の明るい画素の割合。0.45 以上は爆発などで的が隠れている）
//
// 照準: 照準の中心を通る細い横線・縦線が画面の端から端まで薄く通っているので、まず「端から端まで続く細い明るい線」の
// 行と列を探して粗い中心を出す（±1px）。リング（MG・SMG）は、暗い縁に挟まれた明るい線を 72 方向に探して円を当てはめる。
// 十字（AR など）は、4 本の腕の線（白・水色・黄色）を腕ごとに探し、線の画素の重心から中心を出し直す（隠れた線は使わない）。
// コア: 照準の近くで「白っぽい芯のまわりを赤い光が囲む」所を探す。当たった印・着弾のエフェクト・腕の赤い円盤・
// TARGET の文字と取り違えることがある（試作。--debug-dir の画像で確かめて使う）。
// 的: 戦場（y 120〜720）の背景を、戦闘中のフレーム（照準の線が見えるもの）の画素ごとの中央値で作り、背景より暗い画素の
// 連結成分のうち照準の近くのものを的とする（半分の解像度）。的は区間ごとに跳んで位置を変えるので、中央値に的は残らない。
// 背景に無い遮蔽物（壊れる前の緑の箱など）が的に接していると、外接矩形がそこまで広がる。遠い的の脚は霧で薄く、取れないことがある。
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { rawFrames } from './ffmpeg.ts';

const W = 1920;
const H = 1080;
/** 背景と的を探す戦場の範囲（全解像度の y） */
const FIELD = { y0: 120, y1: 720 };
/** 的は半分の解像度で探す */
const HALF_W = W / 2;
const HALF_H = (FIELD.y1 - FIELD.y0) / 2;
/** 的を探す範囲（照準から左右 ±px、画面の y の下限） */
const TARGET_HALF_W = 400;
const TARGET_Y_MAX = 700;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    from: { type: 'string', default: '0' },
    to: { type: 'string' },
    step: { type: 'string', default: '60' },
    csv: { type: 'string' },
    'debug-dir': { type: 'string' },
    'bg-from': { type: 'string' },
    'bg-to': { type: 'string' },
    'bg-step': { type: 'string', default: '120' },
  },
});

const video = positionals[0];
if (!video) {
  console.error(
    'usage: node tools/captures/aim.ts <動画> [--from N] [--to N] [--step 60] [--csv out.csv] [--debug-dir DIR]\n' +
      '                                  [--bg-from N] [--bg-to N] [--bg-step 120]',
  );
  process.exit(1);
}
const from = Number(values.from);
const to = values.to === undefined ? undefined : Number(values.to);
const step = Number(values.step);
const debugDir = values['debug-dir'];
const bgFrom = values['bg-from'] === undefined ? 0 : Number(values['bg-from']);
const bgTo = values['bg-to'] === undefined ? undefined : Number(values['bg-to']);
const bgStep = Number(values['bg-step']);

// ---------------------------------------------------------------------------------------------------------------------
// 画像の読み出し

type Rgb = { data: Buffer; w: number; h: number };

function selectExpr(first: number, last: number | undefined, every: number): string {
  const range = last === undefined ? `gte(n\\,${first})` : `between(n\\,${first}\\,${last})`;
  return every > 1 ? `${range}*not(mod(n-${first}\\,${every}))` : range;
}

async function* readFrames(
  first: number,
  last: number | undefined,
  every: number,
  crop?: { y: number; h: number },
): AsyncGenerator<{ frame: number; img: Rgb }> {
  const h = crop ? crop.h : H;
  const filters = [`select='${selectExpr(first, last, every)}'`];
  if (crop) filters.push(`crop=${W}:${crop.h}:0:${crop.y}`);
  const args = ['-v', 'error', '-i', video!, '-vf', filters.join(','), '-fps_mode', 'passthrough'];
  args.push('-f', 'rawvideo', '-pix_fmt', 'rgb24', '-');
  let n = first;
  for await (const buf of rawFrames(args, W * h * 3)) {
    yield { frame: n, img: { data: Buffer.from(buf), w: W, h } };
    n += every;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// 照準の中心

/** 3 チャンネルの和 */
function sum3(img: Rgb, x: number, y: number): number {
  const i = (y * img.w + x) * 3;
  return img.data[i]! + img.data[i + 1]! + img.data[i + 2]!;
}

type Lines = {
  x: number;
  y: number;
  /** 線の行（列）で「両隣より明るい」画素の割合 */
  fx: number;
  fy: number;
  /** その割合と、2 番目に高い行（列。線の ±4 を除く）の割合の比 */
  px: number;
  py: number;
};

/** 線が見えているとみなす条件 */
const LINE_MIN = 0.25;
const LINE_PROMINENCE = 1.8;

function linesVisible(l: Lines): boolean {
  return l.fx >= LINE_MIN && l.fy >= LINE_MIN && l.px >= LINE_PROMINENCE && l.py >= LINE_PROMINENCE;
}

/** 割合の最大と、最大の ±4 を除いた 2 番目との比 */
function peak(score: Float64Array, lo: number, hi: number): { at: number; f: number; prominence: number } {
  let at = lo;
  for (let i = lo; i < hi; i++) if (score[i]! > score[at]!) at = i;
  let second = 0;
  for (let i = lo; i < hi; i++) if (Math.abs(i - at) > 4) second = Math.max(second, score[i]!);
  return { at, f: score[at]!, prominence: second > 0 ? score[at]! / second : 99 };
}

/**
 * 端から端まで続く細い明るい線（照準の中心を通る横線・縦線）を探す。
 * 各行（列）で「上下（左右）2px 先の明るい方より、3 チャンネルの和で 15 以上明るい」画素の割合を数え、
 * 割合が最大の行（列）を線とする。全画面のときは、画面下の UI の横の縁を拾わないよう y 150〜900 で探す。
 */
function findLines(img: Rgb, yOffset = 0): Lines {
  const RIDGE = 15;
  const rowScore = new Float64Array(img.h);
  const yLo = Math.max(3, 150 - yOffset);
  const yHi = Math.min(img.h - 3, 900 - yOffset);
  for (let y = yLo; y < yHi; y++) {
    let hit = 0;
    let total = 0;
    for (let x = 40; x < img.w - 40; x += 3) {
      const r = sum3(img, x, y) - Math.max(sum3(img, x, y - 2), sum3(img, x, y + 2));
      total += 1;
      if (r > RIDGE) hit += 1;
    }
    rowScore[y] = hit / total;
  }
  const colScore = new Float64Array(img.w);
  for (let x = 60; x < img.w - 60; x++) {
    let hit = 0;
    let total = 0;
    for (let y = 3; y < img.h - 3; y += 3) {
      const r = sum3(img, x, y) - Math.max(sum3(img, x - 2, y), sum3(img, x + 2, y));
      total += 1;
      if (r > RIDGE) hit += 1;
    }
    colScore[x] = hit / total;
  }
  const row = peak(rowScore, yLo, yHi);
  const col = peak(colScore, 60, img.w - 60);
  return { x: col.at, y: row.at + yOffset, fx: col.f, fy: row.f, px: col.prominence, py: row.prominence };
}

type AimColor = 'white' | 'cyan' | 'yellow' | 'red' | 'unknown';

function classifyColor(r: number, g: number, b: number): AimColor {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  if (mn > 190 && mx - mn < 45) return 'white';
  if (g > 170 && b > 150 && r < g - 50) return 'cyan';
  if (r > 170 && g > 150 && b < g - 60) return 'yellow';
  if (r > 150 && g < 100 && b < 100) return 'red';
  return 'unknown';
}

type Aim = {
  x: number;
  y: number;
  /** 0..1。十字は使えた線の本数 / 4、リングは白い画素が見つかった方向の割合 */
  conf: number;
  color: AimColor;
  type: 'cross' | 'ring';
  /** 十字: 中心から線の内側の端までの距離（使えた線の平均）。リング: 半径 */
  size: number;
  /** リング: 内側の斜め 4 方向（中心から 8.5px）に赤い印があるか（MG の撃っている間の「×」、SMG の当たった印） */
  redMarks?: boolean;
};

function pixel(img: Rgb, x: number, y: number): [number, number, number] {
  const i = (y * img.w + x) * 3;
  return [img.data[i]!, img.data[i + 1]!, img.data[i + 2]!];
}

function median(v: number[]): number {
  if (v.length === 0) return NaN;
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** 十字の 4 本の腕の向き */
const ARMS = [
  { name: 'L', ux: -1, uy: 0 },
  { name: 'R', ux: 1, uy: 0 },
  { name: 'T', ux: 0, uy: -1 },
  { name: 'B', ux: 0, uy: 1 },
] as const;
/** 腕を探す範囲（中心からの距離）と、線の太さ方向に見る幅（±） */
const ARM_T0 = 6;
const ARM_T1 = 75;
const ARM_HALF = 3;
/** 線の長さとして認める範囲（px） */
const BAR_MIN = 10;
const BAR_MAX = 30;

type Arm = {
  name: string;
  /** 線の画素の重心（画素の番号の座標） */
  x: number;
  y: number;
  /** 中心（探したときの中心）から内側の端・外側の端までの距離 */
  tin: number;
  tout: number;
};

/**
 * 1 本の腕の線を探す。腕の方向の各距離 t で、太さ方向 ±3px のうち線の色の画素の割合 m(t) を数え、
 * m ≥ 3/7 が 1px の途切れを許して BAR_MIN〜BAR_MAX 続く最初の区間を線とする。端は m が区間の中央値の半分を切る所を
 * 線形補間で求め、重心は線の色との差で重みを付けて取る。
 */
function scanArm(
  img: Rgb,
  cx: number,
  cy: number,
  arm: (typeof ARMS)[number],
  cls: AimColor,
): { arm: Arm; colors: [number, number, number][] } | null {
  const px = Math.abs(arm.uy);
  const py = Math.abs(arm.ux);
  const m = new Float64Array(ARM_T1 + 2);
  const at = (t: number, o: number): [number, number] => [
    Math.round(cx + arm.ux * t + px * o),
    Math.round(cy + arm.uy * t + py * o),
  ];
  for (let t = ARM_T0 - 1; t <= ARM_T1 + 1; t++) {
    let hit = 0;
    for (let o = -ARM_HALF; o <= ARM_HALF; o++) {
      const [x, y] = at(t, o);
      if (x < 0 || y < 0 || x >= img.w || y >= img.h) continue;
      if (classifyColor(...pixel(img, x, y)) === cls) hit += 1;
    }
    m[t] = hit / (2 * ARM_HALF + 1);
  }
  let t = ARM_T0;
  while (t <= ARM_T1) {
    if (m[t]! < 3 / 7) {
      t += 1;
      continue;
    }
    let end = t;
    while (end + 1 <= ARM_T1 && (m[end + 1]! >= 3 / 7 || (end + 2 <= ARM_T1 && m[end + 2]! >= 3 / 7))) end += 1;
    const len = end - t + 1;
    if (len >= BAR_MIN && len <= BAR_MAX) {
      const plateau = median(Array.from(m.subarray(t, end + 1)));
      const half = plateau / 2;
      // 内側・外側の端（m が half を横切る位置）
      // 端の外側の m も half 以上なら（隣の画素まで線の色）、その画素の外側の縁を端とする
      const tin = m[t - 1]! >= half ? t - 1.5 : t - 1 + (half - m[t - 1]!) / (m[t]! - m[t - 1]!);
      const tout = m[end + 1]! >= half ? end + 1.5 : end + (m[end]! - half) / (m[end]! - m[end + 1]!);
      const colors: [number, number, number][] = [];
      for (let tt = t + 2; tt <= end - 2; tt++) {
        for (let o = -ARM_HALF; o <= ARM_HALF; o++) {
          const [x, y] = at(tt, o);
          if (x < 0 || y < 0 || x >= img.w || y >= img.h) continue;
          const c = pixel(img, x, y);
          if (classifyColor(...c) === cls) colors.push(c);
        }
      }
      if (colors.length < 12) return null;
      const ref: [number, number, number] = [0, 1, 2].map((k) => median(colors.map((c) => c[k]!))) as [
        number,
        number,
        number,
      ];
      let w = 0;
      let sx = 0;
      let sy = 0;
      for (let tt = t - 2; tt <= end + 2; tt++) {
        for (let o = -ARM_HALF - 2; o <= ARM_HALF + 2; o++) {
          const [x, y] = at(tt, o);
          if (x < 0 || y < 0 || x >= img.w || y >= img.h) continue;
          const [r, g, b] = pixel(img, x, y);
          const d = Math.hypot(r - ref[0], g - ref[1], b - ref[2]);
          const wgt = Math.min(1, Math.max(0, (90 - d) / 30));
          w += wgt;
          sx += wgt * x;
          sy += wgt * y;
        }
      }
      return { arm: { name: arm.name, x: sx / w, y: sy / w, tin, tout }, colors };
    }
    t = end + 1;
  }
  return null;
}

/**
 * 十字の 4 本の線から中心を出し直す。線の色（白・水色・黄色）は、腕の線が一番多く見つかる色とする。
 * 線は撃ち続けると外へ広がる（録画 57 で内側の端まで 12.5 → 24px）ので、長さと位置は腕ごとに探す。
 * 中心の x は「左右の線の重心の平均」「上下の線の重心の x」の中央値、y も同様。内側の端までの距離が他の線と 3px 以上
 * 違う線は、ポップアップの数字などを拾ったとみなして使わない。
 */
function refineCross(img: Rgb, cx0: number, cy0: number): Aim | null {
  let cx = cx0;
  let cy = cy0;
  let result: Aim | null = null;
  for (let iter = 0; iter < 3; iter++) {
    let best: { cls: AimColor; arms: Arm[] } | null = null;
    for (const cls of ['white', 'cyan', 'yellow'] as const) {
      const arms: Arm[] = [];
      for (const arm of ARMS) {
        const found = scanArm(img, cx, cy, arm, cls);
        if (found) arms.push(found.arm);
      }
      if (!best || arms.length > best.arms.length) best = { cls, arms };
    }
    if (!best || best.arms.length < 2) {
      // 腕が 1 本以下なら中心は線の行・列のまま（±1px）。1 本の色が白なら、ポップアップの数字の見込みが高い
      if (result) return result;
      const cls = best && best.arms.length === 1 ? best.cls : 'unknown';
      return { x: cx0, y: cy0, conf: (best?.arms.length ?? 0) / 4, color: cls, type: 'cross', size: NaN };
    }
    let arms = best.arms;
    if (arms.length >= 3) {
      const g = median(arms.map((a) => a.tin));
      arms = arms.filter((a) => Math.abs(a.tin - g) <= 3);
    }
    const by = Object.fromEntries(arms.map((a) => [a.name, a])) as Record<string, Arm | undefined>;
    const { L, R, T, B } = by;
    const xs: number[] = [];
    const ys: number[] = [];
    if (L && R) xs.push((L.x + R.x) / 2);
    if (T) xs.push(T.x);
    if (B) xs.push(B.x);
    if (T && B) ys.push((T.y + B.y) / 2);
    if (L) ys.push(L.y);
    if (R) ys.push(R.y);
    // 片側の腕しか無い向きは、線の見えている行・列（粗い中心）のまま
    const nx = xs.length ? median(xs) : cx0;
    const ny = ys.length ? median(ys) : cy0;
    // 内側の端までの距離は、出し直した中心から測り直す
    const inner = arms.map((a) => {
      const u = ARMS.find((d) => d.name === a.name)!;
      return a.tin - (u.ux * (nx - cx) + u.uy * (ny - cy));
    });
    result = { x: nx, y: ny, conf: arms.length / 4, color: best.cls, type: 'cross', size: median(inner) };
    const moved = Math.hypot(nx - cx, ny - cy);
    cx = nx;
    cy = ny;
    if (moved < 0.05) break;
  }
  return result;
}

/** リングの半径を探す範囲（MG は 26〜29px、SMG（録画 54）は 26〜33px を見た） */
const RING_R0 = 16;
const RING_R1 = 48;

/**
 * リングの照準（MG: 白・内側に「×」の印。SMG（録画 54）: 白・水色で下に切れ目と縦線）。72 方向に、暗い縁に挟まれた
 * 明るい線の半径を探し、見つかった点に円を当てはめる（外れた点を除いて 2 回）。
 */

function refineRing(img: Rgb, cx0: number, cy0: number): Aim | null {
  const N = 72;
  const pts: { x: number; y: number }[] = [];
  // 明るさ = max(R,G,B)（双線形補間。白・水色のリングの両方で高い）。リングは幅約 4px の線の両側に 1px ほどの暗い縁が
  // あるので、「線の幅の中の明るさの平均 − 両側の縁（±2.75px）の明るさの大きい方」が最大の半径を、その方向の線の中心とする
  const bright = (x: number, y: number): number => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    if (x0 < 0 || y0 < 0 || x0 + 1 >= img.w || y0 + 1 >= img.h) return 0;
    const fx = x - x0;
    const fy = y - y0;
    const v = (xx: number, yy: number): number => Math.max(...pixel(img, xx, yy));
    return (
      v(x0, y0) * (1 - fx) * (1 - fy) +
      v(x0 + 1, y0) * fx * (1 - fy) +
      v(x0, y0 + 1) * (1 - fx) * fy +
      v(x0 + 1, y0 + 1) * fx * fy
    );
  };
  for (let k = 0; k < N; k++) {
    const t = (2 * Math.PI * k) / N;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const at = (rr: number): number => bright(cx0 + rr * c, cy0 + rr * s);
    const score = (rr: number): number =>
      (at(rr - 1.25) + at(rr - 0.5) + at(rr + 0.5) + at(rr + 1.25)) / 4 - Math.max(at(rr - 2.75), at(rr + 2.75));
    let bestR = -1;
    let bestS = -1e9;
    for (let rr = RING_R0; rr <= RING_R1; rr += 0.25) {
      const sc = score(rr);
      if (sc > bestS) {
        bestS = sc;
        bestR = rr;
      }
    }
    if (bestS < 60 || at(bestR) < 200) continue;
    // 放物線で 0.25px より細かく
    const a = score(bestR - 0.25);
    const b = score(bestR + 0.25);
    const den = a - 2 * bestS + b;
    const rr = den < 0 ? bestR + (0.25 * (a - b)) / (2 * den) : bestR;
    pts.push({ x: cx0 + rr * c, y: cy0 + rr * s });
  }
  if (pts.length < N * 0.4) return null;
  // 粗い中心（線の行・列）は ±1px ほどなので、そこからの距離の中央値に近い点だけで当てはめ始める
  // （エフェクトの明るい縁などの外れた点に引っぱられないように）
  const r0 = median(pts.map((p) => Math.hypot(p.x - cx0, p.y - cy0)));
  let keep = pts.filter((p) => Math.abs(Math.hypot(p.x - cx0, p.y - cy0) - r0) < 2.5);
  let fit = keep.length >= N * 0.4 ? fitCircle(keep) : null;
  for (let iter = 0; iter < 2 && fit; iter++) {
    const f = fit;
    keep = pts.filter((p) => Math.abs(Math.hypot(p.x - f.x, p.y - f.y) - f.r) < 1.5);
    if (keep.length < N * 0.4) return null;
    fit = fitCircle(keep);
  }
  if (!fit || fit.r < RING_R0 + 2 || fit.r > RING_R1 - 2) return null;
  // 線の色: 当てはめた円の上の画素の色の多数決
  const votes = new Map<AimColor, number>();
  for (let k = 0; k < N; k++) {
    const t = (2 * Math.PI * k) / N;
    const x = Math.round(fit.x + fit.r * Math.cos(t));
    const y = Math.round(fit.y + fit.r * Math.sin(t));
    if (x < 0 || y < 0 || x >= img.w || y >= img.h) continue;
    const cls = classifyColor(...pixel(img, x, y));
    votes.set(cls, (votes.get(cls) ?? 0) + 1);
  }
  let color: AimColor = 'unknown';
  for (const [cls, v] of votes) if (cls !== 'unknown' && v >= N * 0.3 && v > (votes.get(color) ?? 0)) color = cls;
  // MG の内側の「×」の印（中心から約 8.5px、斜め 4 方向）が赤いか
  let red = 0;
  for (const [sx, sy] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ] as const) {
    if (classifyColor(...pixel(img, Math.round(fit.x + sx * 8.5), Math.round(fit.y + sy * 8.5))) === 'red') red += 1;
  }
  return { x: fit.x, y: fit.y, conf: keep.length / N, color, type: 'ring', size: fit.r, redMarks: red >= 2 };
}

/** 最小二乗の円（Kasa 法） */
function fitCircle(pts: { x: number; y: number }[]): { x: number; y: number; r: number } | null {
  const n = pts.length;
  if (n < 3) return null;
  let sx = 0;
  let sy = 0;
  for (const p of pts) {
    sx += p.x;
    sy += p.y;
  }
  const mx = sx / n;
  const my = sy / n;
  let suu = 0;
  let svv = 0;
  let suv = 0;
  let suuu = 0;
  let svvv = 0;
  let suvv = 0;
  let svuu = 0;
  for (const p of pts) {
    const u = p.x - mx;
    const v = p.y - my;
    suu += u * u;
    svv += v * v;
    suv += u * v;
    suuu += u * u * u;
    svvv += v * v * v;
    suvv += u * v * v;
    svuu += v * u * u;
  }
  const a1 = (suuu + suvv) / 2;
  const a2 = (svvv + svuu) / 2;
  const det = suu * svv - suv * suv;
  if (Math.abs(det) < 1e-9) return null;
  const uc = (a1 * svv - a2 * suv) / det;
  const vc = (a2 * suu - a1 * suv) / det;
  return { x: uc + mx, y: vc + my, r: Math.sqrt(uc * uc + vc * vc + (suu + svv) / n) };
}

function findAim(img: Rgb): { aim: Aim | null; lines: Lines } {
  const lines = findLines(img);
  if (!linesVisible(lines)) return { aim: null, lines };
  // 線は 1〜2px 幅なので、粗い中心は線の行・列のまま使う
  // リング（MG）を先に見る。十字の線はリングの半径の範囲に 4 方向しか無いので、リングとは取り違えない
  const ring = refineRing(img, lines.x, lines.y);
  if (ring) return { aim: ring, lines };
  const cross = refineCross(img, lines.x, lines.y);
  if (cross && cross.conf >= 0.5) return { aim: cross, lines };
  // 十字もリングも見つからないときは、線の行・列を中心とする（conf 0〜0.25）
  return { aim: cross, lines };
}

// ---------------------------------------------------------------------------------------------------------------------
// コア

type Core = {
  x: number;
  y: number;
  r: number;
  /** 芯（白っぽい画素）の画素数 */
  area: number;
};

/** コアを探す範囲（照準の中心から ±px）。AR は撃っている間 13〜18px、リロード中 約 50px ずれる（design-stage18.md 11.4） */
const CORE_WIN = 90;
/** コアとして認める照準からの距離の上限（px） */
const CORE_MAX_DIST = 65;

/**
 * コアの赤い光の色（R が高く G・B が低い。G と B は同程度）。会心のオレンジの数字（G ≫ B）は外す。
 */
function isCoreRed(r: number, g: number, b: number): boolean {
  return r >= 140 && r - Math.max(g, b) >= 45 && b >= g - 40;
}

/** コアの芯（白〜白っぽいピンク）の色 */
function isCoreHot(r: number, g: number, b: number): boolean {
  return r >= 220 && Math.min(g, b) >= 140 && r >= Math.max(g, b) - 25;
}

/**
 * 当たった印（照準の中心の斜め 4 方向の菱形。赤・白・水色）の色。斜めの各方向（中心から x・y とも 4〜20px）で
 * その色の画素が 5 つ以上ある方向が 3 つ以上なら、その色を返す。無ければ ''。
 * 印が出ているフレームは、照準の中心に着弾のエフェクトも出るので、コアの位置の読み取りは印の無いフレームより信頼できない。
 * MG のリングの内側の「×」も同じ位置にあるので、MG では常に white か red になる。
 */
function hitMarker(img: Rgb, aim: Aim): AimColor | '' {
  // リングの照準では、リングの線（斜めに中心から r/√2）を拾わないよう内側だけを見る
  const tMax = aim.type === 'ring' ? Math.min(20, Math.floor((aim.size - 4) / Math.SQRT2)) : 20;
  const quads = new Map<AimColor, number>();
  for (const [sx, sy] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ] as const) {
    const n = new Map<AimColor, number>();
    for (let t = 4; t <= tMax; t++) {
      for (let o = -3; o <= 3; o++) {
        const x = Math.round(aim.x + sx * t + o);
        const y = Math.round(aim.y + sy * t - o * sx * sy);
        if (x < 0 || y < 0 || x >= img.w || y >= img.h) continue;
        const [r, g, b] = pixel(img, x, y);
        const cls: AimColor | null =
          r >= 180 && g < 80 && b < 90 && r - Math.max(g, b) >= 110
            ? 'red'
            : Math.min(r, g, b) > 225
              ? 'white'
              : g > 190 && b > 170 && r < g - 70
                ? 'cyan'
                : null;
        if (cls) n.set(cls, (n.get(cls) ?? 0) + 1);
      }
    }
    for (const [cls, v] of n) if (v >= 5) quads.set(cls, (quads.get(cls) ?? 0) + 1);
  }
  let best: AimColor | '' = '';
  for (const [cls, v] of quads) if (v >= 3 && (best === '' || v > (quads.get(best) ?? 0))) best = cls;
  return best;
}

/**
 * 照準の周り（±CORE_WIN）で「白っぽい芯のまわりを赤い光が囲む」所を探す。
 * 1. 芯の色の画素のうち、半径 4〜8px の輪の 60% 以上が赤い光の色のものを芯とみなし、連結した塊にまとめる。
 * 2. 芯の画素数 × 輪の赤さ × exp(−(照準からの距離 / 60)²) が最大の塊を選ぶ。
 * 3. 中心は芯の塊の重心、半径は中心から赤い光が途切れるまでの距離（32 方向の中央値）。
 * 4. その円の中の赤い光の重心が芯からずれている・円が埋まっていないものは、コアとみなさない。
 * 白いポップアップが芯に重なるもの・照準から 65px より遠いもの・周りにオレンジ〜黄色のエフェクトが多いものは空欄にする。
 * 腕の赤い円盤（照準から 80px 前後）やバーストのエフェクトを拾わないため。
 */
function findCore(img: Rgb, aim: Aim): Core | null {
  const x0 = Math.max(0, Math.round(aim.x) - CORE_WIN);
  const y0 = Math.max(0, Math.round(aim.y) - CORE_WIN);
  const x1 = Math.min(img.w - 1, Math.round(aim.x) + CORE_WIN);
  const y1 = Math.min(img.h - 1, Math.round(aim.y) + CORE_WIN);
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const red = new Uint8Array(w * h);
  const hot = new Uint8Array(w * h);
  const white = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = pixel(img, x0 + x, y0 + y);
      red[y * w + x] = isCoreRed(r, g, b) ? 1 : 0;
      hot[y * w + x] = isCoreHot(r, g, b) ? 1 : 0;
      white[y * w + x] = Math.min(r, g, b) > 200 && Math.max(r, g, b) - Math.min(r, g, b) < 30 ? 1 : 0;
    }
  }
  const ring: [number, number][] = [];
  for (const rr of [4, 6, 8]) {
    for (let k = 0; k < 16; k++)
      ring.push([Math.round(rr * Math.cos((k * Math.PI) / 8)), Math.round(rr * Math.sin((k * Math.PI) / 8))]);
  }
  const seed = new Float32Array(w * h);
  for (let y = 8; y < h - 8; y++) {
    for (let x = 8; x < w - 8; x++) {
      if (!hot[y * w + x]) continue;
      let nr = 0;
      let nw = 0;
      for (const [dx, dy] of ring) {
        const q = (y + dy) * w + x + dx;
        nr += red[q]!;
        nw += white[q]!;
      }
      const fr = nr / ring.length;
      // 白いポップアップ（数字）が輪にかかるものは除く
      if (fr >= 0.6 && nw / ring.length < 0.15) seed[y * w + x] = fr;
    }
  }
  // 芯の塊
  const label = new Int32Array(w * h).fill(-1);
  const stack: number[] = [];
  let best: { score: number; px: number[] } | null = null;
  for (let s0 = 0; s0 < w * h; s0++) {
    if (!seed[s0] || label[s0]! >= 0) continue;
    const px: number[] = [];
    let sum = 0;
    label[s0] = 0;
    stack.push(s0);
    while (stack.length) {
      const p = stack.pop()!;
      px.push(p);
      sum += seed[p]!;
      const x = p % w;
      for (const q of [p - 1, p + 1, p - w, p + w, p - w - 1, p - w + 1, p + w - 1, p + w + 1]) {
        if (q < 0 || q >= w * h || Math.abs((q % w) - x) > 1) continue;
        if (seed[q] && label[q]! < 0) {
          label[q] = 0;
          stack.push(q);
        }
      }
    }
    let cx = 0;
    let cy = 0;
    for (const p of px) {
      cx += p % w;
      cy += Math.floor(p / w);
    }
    cx = x0 + cx / px.length;
    cy = y0 + cy / px.length;
    const score = sum * Math.exp(-((Math.hypot(cx - aim.x, cy - aim.y) / 60) ** 2));
    if (px.length >= 2 && (!best || score > best.score)) best = { score, px };
  }
  if (!best) return null;
  // 中心は芯の塊の重心。半径は、中心から 32 方向に赤い光・芯の色が 2px 途切れるまで進んだ距離の中央値
  // （TARGET の文字の帯などに続く方向があっても中央値は動きにくい）
  let scx = 0;
  let scy = 0;
  for (const p of best.px) {
    scx += p % w;
    scy += Math.floor(p / w);
  }
  scx /= best.px.length;
  scy /= best.px.length;
  const reach: number[] = [];
  for (let k = 0; k < 32; k++) {
    const c = Math.cos((k * Math.PI) / 16);
    const sn = Math.sin((k * Math.PI) / 16);
    let last = 0;
    let miss = 0;
    for (let t = 1; t <= 40; t += 0.5) {
      const x = Math.round(scx + t * c);
      const y = Math.round(scy + t * sn);
      if (x < 0 || y < 0 || x >= w || y >= h) {
        last = NaN;
        break;
      }
      const q = y * w + x;
      if (red[q] || hot[q]) {
        last = t;
        miss = 0;
      } else if (++miss >= 4) break;
    }
    reach.push(last);
  }
  if (reach.some((v) => Number.isNaN(v))) return null;
  const radius = median(reach);
  if (radius < 3) return null;
  // 赤い光が芯を中心にした円になっているか（赤い画素の重心が芯から半径の 35% 以内・円の中の 50% 以上が赤い光）。
  // 腕の赤い円盤の縁やエフェクトの赤に芯の色がかかった所は、ここで落ちる
  let n = 0;
  let inside = 0;
  let mx = 0;
  let my = 0;
  for (let y = Math.floor(scy - radius); y <= Math.ceil(scy + radius); y++) {
    for (let x = Math.floor(scx - radius); x <= Math.ceil(scx + radius); x++) {
      if (x < 0 || y < 0 || x >= w || y >= h || Math.hypot(x - scx, y - scy) > radius) continue;
      inside += 1;
      const q = y * w + x;
      if (!red[q] && !hot[q]) continue;
      n += 1;
      mx += x;
      my += y;
    }
  }
  if (n / inside < 0.5 || Math.hypot(mx / n - scx, my / n - scy) > Math.max(2.5, 0.35 * radius)) return null;
  if (Math.hypot(x0 + scx - aim.x, y0 + scy - aim.y) > CORE_MAX_DIST) return null;
  // 半径の 1〜2.5 倍の輪に、オレンジ〜黄色（R も G も高く B が低い）の画素が 20% 以上あればエフェクトとみなす
  let ringN = 0;
  let fxN = 0;
  for (let y = Math.floor(scy - 2.5 * radius); y <= Math.ceil(scy + 2.5 * radius); y++) {
    for (let x = Math.floor(scx - 2.5 * radius); x <= Math.ceil(scx + 2.5 * radius); x++) {
      const d = Math.hypot(x - scx, y - scy);
      if (d < radius || d > 2.5 * radius || x < 0 || y < 0 || x >= w || y >= h) continue;
      ringN += 1;
      const [r, g, b] = pixel(img, x0 + x, y0 + y);
      if (r > 190 && g > 130 && b < g - 50) fxN += 1;
    }
  }
  if (ringN > 0 && fxN / ringN > 0.2) return null;
  return { x: x0 + scx, y: y0 + scy, r: radius, area: best.px.length };
}

// ---------------------------------------------------------------------------------------------------------------------
// 的（背景との差）

/** 戦場の範囲を 2×2 平均で半分の解像度にする。入力は全画面または戦場の範囲の切り出し */
function toHalfField(img: Rgb, yOffset: number): Uint8Array {
  const out = new Uint8Array(HALF_W * HALF_H * 3);
  for (let hy = 0; hy < HALF_H; hy++) {
    const y = FIELD.y0 + hy * 2 - yOffset;
    for (let hx = 0; hx < HALF_W; hx++) {
      const x = hx * 2;
      for (let c = 0; c < 3; c++) {
        const i00 = (y * img.w + x) * 3 + c;
        const i10 = i00 + 3;
        const i01 = i00 + img.w * 3;
        const v = img.data[i00]! + img.data[i10]! + img.data[i01]! + img.data[i01 + 3]!;
        out[(hy * HALF_W + hx) * 3 + c] = (v + 2) >> 2;
      }
    }
  }
  return out;
}

async function buildBackground(): Promise<{ bg: Uint8Array; used: number; seen: number }> {
  const frames: Uint8Array[] = [];
  let seen = 0;
  const crop = { y: FIELD.y0, h: FIELD.y1 - FIELD.y0 };
  for await (const { img } of readFrames(bgFrom, bgTo, bgStep, crop)) {
    seen += 1;
    const lines = findLines(img, FIELD.y0);
    // 戦闘中（照準の線が見える）フレームだけを使う
    if (!linesVisible(lines)) continue;
    frames.push(toHalfField(img, FIELD.y0));
  }
  const n = frames.length;
  const bg = new Uint8Array(HALF_W * HALF_H * 3);
  const col = new Uint8Array(n);
  for (let i = 0; i < bg.length; i++) {
    for (let k = 0; k < n; k++) col[k] = frames[k]![i]!;
    col.sort();
    bg[i] = col[n >> 1] ?? 0;
  }
  return { bg, used: n, seen };
}

type Target = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  area: number;
  /** 照準の高さ ±30px の帯での的の幅 */
  bandW: number;
  /** 照準の周り ±150px のうち、明るい画素（ポップアップ・爆発・照準）から 6px 以内の割合 */
  fx: number;
  /** 外接矩形が探す範囲（y 120〜700・照準の左右 ±400px）の端に接している（的が範囲の外にはみ出している見込み） */
  clipped: boolean;
  mask: Uint8Array;
};

/** 3×3 の収縮（erode）・膨張（dilate） */
function morph3(src: Uint8Array, erode: boolean): Uint8Array {
  const out = new Uint8Array(src.length);
  for (let y = 0; y < HALF_H; y++) {
    for (let x = 0; x < HALF_W; x++) {
      let v = erode ? 1 : 0;
      for (let dy = -1; dy <= 1 && v === (erode ? 1 : 0); dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const yy = y + dy;
          const xx = x + dx;
          const m = yy >= 0 && yy < HALF_H && xx >= 0 && xx < HALF_W ? src[yy * HALF_W + xx]! : 0;
          if (erode && !m) {
            v = 0;
            break;
          }
          if (!erode && m) {
            v = 1;
            break;
          }
        }
      }
      out[y * HALF_W + x] = v;
    }
  }
  return out;
}

/**
 * 背景 bg を今のフレームの色に合わせる係数（チャンネルごとに frame ≈ a·bg + b）。被弾の赤いフラッシュのような
 * 画面全体の色のずれを打ち消す。差の大きい画素（的・ポップアップ）を外して 2 回当てはめる。
 */
function fitTint(half: Uint8Array, bg: Uint8Array): { a: number; b: number }[] {
  const out: { a: number; b: number }[] = [];
  for (let c = 0; c < 3; c++) {
    const d: number[] = [];
    for (let i = c; i < half.length; i += 33) d.push(half[i]! - bg[i]!);
    let a = 1;
    let b = median(d);
    for (let iter = 0; iter < 2; iter++) {
      const cut = iter === 0 ? 40 : 20;
      let n = 0;
      let sx = 0;
      let sy = 0;
      let sxx = 0;
      let sxy = 0;
      for (let i = c; i < half.length; i += 33) {
        const x = bg[i]!;
        const y = half[i]!;
        if (Math.abs(y - (a * x + b)) > cut) continue;
        n += 1;
        sx += x;
        sy += y;
        sxx += x * x;
        sxy += x * y;
      }
      const den = n * sxx - sx * sx;
      if (n < 100 || den <= 0) break;
      a = (n * sxy - sx * sy) / den;
      b = (sy - a * sx) / n;
    }
    out.push({ a, b });
  }
  return out;
}

/**
 * 背景より暗い画素（明るさの差 < −DARK）を取り、白・オレンジの画素（ポップアップの数字・照準）から 6px 以内を除き、
 * 3×3 で膨らませてから連結成分を数える（照準の周りのポップアップは、連結を数えるときだけ通す）。照準の近く（±60px）にかかる成分のうち最大のものを的とし、その外接矩形から
 * 12px（半分の解像度で 6px）以内にある面積 40 以上の成分を足していく（ポップアップで分かれた部分をつなぐ）。
 * 照準の左の残弾の箱（暗い灰色）は照準からの位置で除く。座標は全解像度で返す。
 */
function findTarget(half: Uint8Array, bg: Uint8Array, aim: Aim | null): Target | null {
  const DARK = 22;
  const n = HALF_W * HALF_H;
  const tint = fitTint(half, bg);
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    let d = 0;
    for (let c = 0; c < 3; c++) d += half[i * 3 + c]! - (tint[c]!.a * bg[i * 3 + c]! + tint[c]!.b);
    mask[i] = d / 3 < -DARK ? 1 : 0;
  }
  // ポップアップの数字（白・オレンジの文字と黒い縁）と照準の線は、明るい画素から 6px（半分の解像度で 3px）以内を
  // 的の画素から除く（外接矩形を広げない）。ただし照準の周り（左右 ±150px・照準より上と下 40px まで）では、
  // ポップアップで分かれた的の部分をつなぐために、連結を数えるときだけ通す
  const bright = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const r = half[i * 3]!;
    const g = half[i * 3 + 1]!;
    const b = half[i * 3 + 2]!;
    const white = Math.min(r, g, b) > 200 && Math.max(r, g, b) - Math.min(r, g, b) < 40;
    const orange = r > 200 && g > 100 && b < 90;
    bright[i] = white || orange ? 1 : 0;
  }
  const nearBright = morph3(morph3(morph3(bright, false), false), false);
  let measure: Uint8Array = new Uint8Array(n);
  for (let i = 0; i < n; i++) measure[i] = mask[i] && !nearBright[i] ? 1 : 0;
  if (aim) {
    // 残弾の箱（照準の中心から x −112〜−36、y −28〜+28）
    const hx0 = Math.floor((aim.x - 112) / 2);
    const hx1 = Math.ceil((aim.x - 36) / 2);
    const hy0 = Math.floor((aim.y - 28 - FIELD.y0) / 2);
    const hy1 = Math.ceil((aim.y + 28 - FIELD.y0) / 2);
    for (let y = Math.max(0, hy0); y <= Math.min(HALF_H - 1, hy1); y++) {
      for (let x = Math.max(0, hx0); x <= Math.min(HALF_W - 1, hx1); x++) measure[y * HALF_W + x] = 0;
    }
  }
  // 探す範囲: 照準の左右 ±400px・y 700 まで（画面下の操作キャラ・ドローン・カットインを入れない）
  if (aim) {
    const lo = Math.floor((aim.x - TARGET_HALF_W) / 2);
    const hi = Math.ceil((aim.x + TARGET_HALF_W) / 2);
    for (let y = 0; y < HALF_H; y++) {
      for (let x = 0; x < HALF_W; x++) {
        if (x < lo || x > hi || y > (TARGET_Y_MAX - FIELD.y0) / 2) measure[y * HALF_W + x] = 0;
      }
    }
  }
  // 3×3 で開いて、1px の線（画面の揺れでずれた背景の縁・数字の黒い縁）を消す
  measure = morph3(morph3(measure, true), false);
  const grown = morph3(measure, false);
  if (aim) {
    const cx = Math.round(aim.x / 2);
    const cy = Math.round((aim.y - FIELD.y0) / 2);
    for (let y = 0; y <= Math.min(HALF_H - 1, cy + 20); y++) {
      for (let x = Math.max(0, cx - 60); x <= Math.min(HALF_W - 1, cx + 60); x++) {
        if (nearBright[y * HALF_W + x]) grown[y * HALF_W + x] = 1;
      }
    }
  }
  const label = new Int32Array(n).fill(-1);
  const comps: { area: number; x0: number; y0: number; x1: number; y1: number; near: boolean }[] = [];
  const stack: number[] = [];
  const ax = aim ? aim.x / 2 : -1e9;
  const ay = aim ? (aim.y - FIELD.y0) / 2 : -1e9;
  for (let s = 0; s < n; s++) {
    if (!grown[s] || label[s]! >= 0) continue;
    const id = comps.length;
    const c = { area: 0, x0: 1e9, y0: 1e9, x1: -1, y1: -1, near: false };
    label[s] = id;
    stack.push(s);
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % HALF_W;
      const y = (p - x) / HALF_W;
      if (measure[p]) {
        c.area += 1;
        c.x0 = Math.min(c.x0, x);
        c.x1 = Math.max(c.x1, x);
        c.y0 = Math.min(c.y0, y);
        c.y1 = Math.max(c.y1, y);
        if (Math.abs(x - ax) <= 30 && Math.abs(y - ay) <= 30) c.near = true;
      }
      for (const q of [p - 1, p + 1, p - HALF_W, p + HALF_W]) {
        if (q < 0 || q >= n) continue;
        if (Math.abs((q % HALF_W) - x) > 1) continue;
        if (grown[q] && label[q]! < 0) {
          label[q] = id;
          stack.push(q);
        }
      }
    }
    comps.push(c);
  }
  let best = -1;
  for (let i = 0; i < comps.length; i++) {
    const c = comps[i]!;
    if (c.area < 80) continue;
    if (best < 0) {
      best = i;
      continue;
    }
    const b = comps[best]!;
    // 照準の近くにかかる成分を優先し、その中で面積が最大のもの
    if ((c.near && !b.near) || (c.near === b.near && c.area > b.area)) best = i;
  }
  if (best < 0) return null;
  const chosen = new Set([best]);
  const box = { ...comps[best]! };
  for (let changed = true; changed;) {
    changed = false;
    for (let i = 0; i < comps.length; i++) {
      const c = comps[i]!;
      if (chosen.has(i) || c.area < 40) continue;
      const gapX = Math.max(0, c.x0 - box.x1, box.x0 - c.x1);
      const gapY = Math.max(0, c.y0 - box.y1, box.y0 - c.y1);
      if (gapX > 6 || gapY > 6) continue;
      chosen.add(i);
      box.x0 = Math.min(box.x0, c.x0);
      box.y0 = Math.min(box.y0, c.y0);
      box.x1 = Math.max(box.x1, c.x1);
      box.y1 = Math.max(box.y1, c.y1);
      box.area += c.area;
      changed = true;
    }
  }
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = chosen.has(label[i]!) && measure[i] ? 1 : 0;
  // 照準の周り ±150px の、ポップアップ・爆発などの明るい画素（とその 6px 以内）の割合。大きいフレームは的が隠れている
  let fxN = 0;
  let fxAll = 0;
  if (aim) {
    const cx = Math.round(aim.x / 2);
    const cy = Math.round((aim.y - FIELD.y0) / 2);
    for (let y = Math.max(0, cy - 75); y <= Math.min(HALF_H - 1, cy + 75); y++) {
      for (let x = Math.max(0, cx - 75); x <= Math.min(HALF_W - 1, cx + 75); x++) {
        fxAll += 1;
        fxN += nearBright[y * HALF_W + x]!;
      }
    }
  }
  // 照準の高さ ±30px の帯での的の左右の端（腕を広げた幅。ポップアップは照準より上に出るので入りにくい）
  let bl = Infinity;
  let br = -Infinity;
  if (aim) {
    const yc = (aim.y - FIELD.y0) / 2;
    for (let y = Math.max(0, Math.floor(yc - 15)); y <= Math.min(HALF_H - 1, Math.ceil(yc + 15)); y++) {
      for (let x = 0; x < HALF_W; x++) {
        if (!out[y * HALF_W + x]) continue;
        bl = Math.min(bl, x);
        br = Math.max(br, x);
      }
    }
  }
  return {
    x0: box.x0 * 2,
    y0: box.y0 * 2 + FIELD.y0,
    x1: box.x1 * 2 + 2,
    y1: box.y1 * 2 + 2 + FIELD.y0,
    area: box.area * 4,
    fx: fxAll ? fxN / fxAll : NaN,
    bandW: Number.isFinite(bl) ? (br - bl + 1) * 2 : NaN,
    clipped:
      box.x0 <= Math.max(0, Math.floor(((aim?.x ?? 0) - TARGET_HALF_W) / 2)) ||
      box.x1 >= Math.min(HALF_W - 1, Math.ceil(((aim?.x ?? W) + TARGET_HALF_W) / 2)) ||
      box.y0 <= 0 ||
      box.y1 >= Math.floor((TARGET_Y_MAX - FIELD.y0) / 2) - 1,
    mask: out,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// 書き込み画像（確認用）

/** 生の RGB を ffmpeg で JPEG にする（標準入力で渡す） */
function writeJpeg(data: Uint8Array, w: number, h: number, out: string, width: number): void {
  const args = ['-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${w}x${h}`, '-i', '-'];
  args.push('-vf', `scale=${width}:-1:flags=area`, '-q:v', '4', '-y', out);
  const r = spawnSync('ffmpeg', args, { input: data, maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`ffmpeg failed writing ${out}: ${r.stderr?.toString()}`);
}

function drawDebug(img: Rgb, frame: number, aim: Aim | null, core: Core | null, target: Target | null): void {
  if (!debugDir) return;
  const d = Buffer.from(img.data);
  const put = (x: number, y: number, c: [number, number, number]): void => {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 3;
    d[i] = c[0];
    d[i + 1] = c[1];
    d[i + 2] = c[2];
  };
  if (target) {
    // 的の画素を青く染め、外接矩形を黄色で描く
    for (let hy = 0; hy < HALF_H; hy++) {
      for (let hx = 0; hx < HALF_W; hx++) {
        if (!target.mask[hy * HALF_W + hx]) continue;
        for (let k = 0; k < 4; k++) {
          const x = hx * 2 + (k & 1);
          const y = FIELD.y0 + hy * 2 + (k >> 1);
          const i = (y * W + x) * 3;
          d[i] = d[i]! >> 1;
          d[i + 1] = d[i + 1]! >> 1;
          d[i + 2] = Math.min(255, (d[i + 2]! >> 1) + 100);
        }
      }
    }
    for (let t = 0; t < 3; t++) {
      for (let x = target.x0; x <= target.x1; x++) {
        put(x, target.y0 - t, [255, 230, 0]);
        put(x, target.y1 + t, [255, 230, 0]);
      }
      for (let y = target.y0; y <= target.y1; y++) {
        put(target.x0 - t, y, [255, 230, 0]);
        put(target.x1 + t, y, [255, 230, 0]);
      }
    }
  }
  if (aim) {
    for (let t = -12; t <= 12; t++) {
      for (const o of [0, 1]) {
        put(aim.x + t, aim.y + t + o, [255, 0, 255]);
        put(aim.x + t, aim.y - t + o, [255, 0, 255]);
      }
    }
  }
  // 下に、照準の周り 240×180 の元の画像を 3 倍で足し、照準の中心（マゼンタ）とコア（緑の円）を細く描く
  const Z = 3;
  const IW = 240;
  const IH = 180;
  const canvas = Buffer.alloc(W * (H + IH * Z) * 3);
  d.copy(canvas);
  if (aim) {
    const ax = Math.round(aim.x) - IW / 2;
    const ay = Math.round(aim.y) - IH / 2;
    for (let y = 0; y < IH * Z; y++) {
      for (let x = 0; x < IW * Z; x++) {
        const sx = Math.min(W - 1, Math.max(0, ax + Math.floor(x / Z)));
        const sy = Math.min(H - 1, Math.max(0, ay + Math.floor(y / Z)));
        const si = (sy * W + sx) * 3;
        const di = ((H + y) * W + x) * 3;
        canvas[di] = img.data[si]!;
        canvas[di + 1] = img.data[si + 1]!;
        canvas[di + 2] = img.data[si + 2]!;
      }
    }
    const dot = (x: number, y: number, c: [number, number, number]): void => {
      x = Math.round(x);
      y = Math.round(y);
      if (x < 0 || y < H || x >= IW * Z || y >= H + IH * Z) return;
      const i = (y * W + x) * 3;
      canvas[i] = c[0];
      canvas[i + 1] = c[1];
      canvas[i + 2] = c[2];
    };
    const inset = (x: number, y: number): [number, number] => [(x - ax + 0.5) * Z, H + (y - ay + 0.5) * Z];
    const [mx, my] = inset(aim.x, aim.y);
    for (let t = -3; t <= 3; t++) {
      for (let o = -1; o <= 1; o++) {
        dot(mx + t, my + o, [255, 0, 255]);
        dot(mx + o, my + t, [255, 0, 255]);
      }
    }
    if (core) {
      const [cx, cy] = inset(core.x, core.y);
      for (let k = 0; k < 720; k++) {
        const a = (k * Math.PI) / 360;
        for (const dr of [0, 1, 2])
          dot(cx + (core.r * Z + dr) * Math.cos(a), cy + (core.r * Z + dr) * Math.sin(a), [0, 255, 0]);
      }
      for (let t = -3; t <= 3; t++) {
        dot(cx + t, cy, [0, 255, 0]);
        dot(cx, cy + t, [0, 255, 0]);
      }
    }
  }
  writeJpeg(canvas, W, H + IH * Z, join(debugDir, `f${frame}.jpg`), 960);
}

// ---------------------------------------------------------------------------------------------------------------------
// 本体

const fmt = (v: number | undefined, digits = 1): string =>
  v === undefined || !Number.isFinite(v) ? '' : v.toFixed(digits);

if (debugDir) mkdirSync(debugDir, { recursive: true });

console.error(`背景を作る（${bgFrom}〜${bgTo ?? '末尾'}、${bgStep}f ごと）…`);
const { bg, used, seen } = await buildBackground();
console.error(`背景: 戦闘中のフレーム ${used} / ${seen} の中央値`);
if (debugDir) writeJpeg(bg, HALF_W, HALF_H, join(debugDir, 'background.jpg'), HALF_W);

const header = [
  'frame',
  'aim_x',
  'aim_y',
  'aim_conf',
  'aim_color',
  'aim_type',
  'aim_size',
  'aim_redmark',
  'core_x',
  'core_y',
  'core_r',
  'core_hot',
  'hitmark',
  'dx',
  'dy',
  'tgt_x0',
  'tgt_y0',
  'tgt_x1',
  'tgt_y1',
  'tgt_w',
  'tgt_h',
  'tgt_cx',
  'tgt_cy',
  'tgt_area',
  'tgt_band_w',
  'tgt_clipped',
  'fx',
];
const rows: string[] = [header.join(',')];
let total = 0;
let nAim = 0;
let nCore = 0;
let nTarget = 0;
for await (const { frame, img } of readFrames(from, to, step)) {
  total += 1;
  const { aim } = findAim(img);
  const core = aim ? findCore(img, aim) : null;
  const target = aim ? findTarget(toHalfField(img, 0), bg, aim) : null;
  if (aim) nAim += 1;
  if (core) nCore += 1;
  if (target) nTarget += 1;
  rows.push(
    [
      frame,
      fmt(aim?.x),
      fmt(aim?.y),
      fmt(aim?.conf, 2),
      aim?.color ?? '',
      aim?.type ?? '',
      fmt(aim?.size),
      aim?.type === 'ring' ? (aim.redMarks ? 1 : 0) : '',
      fmt(core?.x),
      fmt(core?.y),
      fmt(core?.r),
      core?.area ?? '',
      aim ? hitMarker(img, aim) : '',
      aim && core ? fmt(aim.x - core.x) : '',
      aim && core ? fmt(aim.y - core.y) : '',
      target?.x0 ?? '',
      target?.y0 ?? '',
      target?.x1 ?? '',
      target?.y1 ?? '',
      target ? target.x1 - target.x0 : '',
      target ? target.y1 - target.y0 : '',
      target ? (target.x0 + target.x1) / 2 : '',
      target ? (target.y0 + target.y1) / 2 : '',
      target?.area ?? '',
      fmt(target?.bandW, 0),
      target ? (target.clipped ? 1 : 0) : '',
      fmt(target?.fx, 2),
    ].join(','),
  );
  drawDebug(img, frame, aim, core, target);
}

const text = rows.join('\n') + '\n';
if (values.csv) writeFileSync(values.csv, text);
else process.stdout.write(text);
console.error(`${total} フレーム: 照準 ${nAim}・コア ${nCore}・的 ${nTarget}`);
