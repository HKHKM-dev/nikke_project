// SG の着弾点（ペレットの落ちた所に出る点。当たりは白く光り、外れは暗い灰色）を読み、直前のコマの的のマスクと重ねる
// （plan/design-bullet-hit-rate-frame-coverage-verify.md 5.3 の主。V-0120）。
//   node tools/captures/sg-dots.ts <録画 id> --pellets <sg-pellets の debug 出力> [--k 10] [--k2 15] [--debug-dir DIR]
//                                  [--debug-every 10] [--sections 遠,中遠] [--triggers f,f] [--dump] [--verbose]
//
// - トリガー（発）と当たったペレットの数は、read.ts --recipe sg-pellets --opt debug=1 の標準エラーの行
//   （「  <区間> f<フレーム> +<増分>: h <数> …」）から取る。
// - 点は撃った瞬間に白い小さな丸で現れ、次のコマから、当たりは大きく光ってから小さな白い点になって約 25f 残り、
//   外れは暗い灰色の丸のまま小さくなって消える。画面に固定で、的と一緒には動かない（2026-10-04、録画 074・109）。
//   撃った瞬間と点の分け方は dotsAt・firedOf。照準の形（maskReticle）と残弾の箱の所は探さない。
// - 的のマスクは、撃つ before フレーム前のコマで、coverage.ts と同じ分け方。点は同じ画面の座標で重ねる。
// - 出力: derived/<id>/sg-dots@<設定の版>.tsv（点ごと）と、区間ごとのまとめ（標準エラー）。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { FIELD, H, W, findAim, findTarget, readFrames, toHalfField, writeJpeg, type Rgb } from './aim-lib.ts';
import {
  BG,
  CIRCLE_PX_PER_SCALE,
  TARGET,
  UNKNOWN,
  classifyRect,
  maskReticle,
  median,
  type CoverageConfig,
  type Window,
} from './coverage-lib.ts';
import { capturesDir } from './dirs.ts';
import { FIELD_H, fieldBackground, fitTintAround } from './field-bg.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    pellets: { type: 'string' },
    config: { type: 'string' },
    k: { type: 'string', default: '10' },
    k2: { type: 'string', default: '15' },
    before: { type: 'string', default: '6' },
    sections: { type: 'string' },
    triggers: { type: 'string' },
    'debug-dir': { type: 'string' },
    'debug-every': { type: 'string', default: '10' },
    dump: { type: 'boolean', default: false },
    verbose: { type: 'boolean', default: false },
  },
});
const id = positionals[0];
if (!id || !values.pellets) {
  console.error('usage: node tools/captures/sg-dots.ts <録画 id> --pellets FILE [--k 10] [--k2 25] [--debug-dir DIR]');
  process.exit(1);
}
const log = (m: string): void => console.error(m);
const cfg = JSON.parse(
  readFileSync(values.config ?? new URL('./coverage-config.json', import.meta.url), 'utf8'),
) as CoverageConfig;
const K = Number(values.k);
const K2 = Number(values.k2);
/** マスクを取るコマ（トリガーの before フレーム前）。HUD の増分は撃った瞬間より数フレーム遅れることがあり、1 フレーム前には
 * もう点が光っていることがある（録画 109 の f6255）。前のトリガー（約 40f 前）の点は約 27f で消える */
const BEFORE = Number(values.before);
/**
 * 現れたばかりの点（撃ったコマ）: 白い中心（3×3 の明るさ ≥ center）を灰色の縁が囲む、直径 5〜9px の丸
 * （2026-10-04、録画 074・109 の拡大で見た）。中心は 1 コマ前より rise 以上明るく、半径 ring の円周の明るさの下から
 * 4 分の 1 の値より contrast 以上、上から 4 分の 1 の値より contrastHi 以上明るい（縁がほぼ一周暗い。隣の点と重なっても測れる）。照準と一緒に動く HUD を除くため、
 * 照準の動きだけずらした 1 コマ前の所よりも rise 以上明るいことを求める。近い候補（< sep px）は、差の大きい方だけ残す
 */
const ONSET = { center: 215, rise: 40, ring: 5, contrast: 35, contrastHi: 15, sep: 5 };
/** 点を探す範囲（照準の中心から。SG の照準円の半径 約 71px と余白 15px。上に流れる数字を拾わないよう、広げすぎない） */
const SEARCH_R = 86;
/** 窓の余白 */
const MARGIN = 140;
/** SG の照準円の CDN の値（ふつうの SG は 250。C-0038） */
const ACCURACY = 250;

const repo = new URL('../../', import.meta.url);
const recording = JSON.parse(readFileSync(new URL(`records/recordings/${id}.json`, repo), 'utf8')) as {
  folder: string;
  file: string;
};
const video = join(capturesDir(), recording.folder, recording.file);

// トリガーと当たったペレットの数
type Trigger = { section: string; frame: number; hits: number };
const triggers: Trigger[] = [];
for (const line of readFileSync(values.pellets, 'utf8').split(/\r?\n/)) {
  const m = /^\s+(.+?) f(\d+) \+[\d,]+: h (\d+)/.exec(line);
  if (m) triggers.push({ section: m[1]!, frame: Number(m[2]), hits: Number(m[3]) });
}
const wanted = values.sections ? new Set(values.sections.split(',')) : null;
const only = values.triggers ? new Set(values.triggers.split(',').map(Number)) : null;
const use = triggers.filter(
  (t) =>
    (!wanted || wanted.has(t.section) || wanted.has(t.section.replace(/ \d 回目$/, ''))) &&
    (!only || only.has(t.frame)),
);
log(`トリガー ${use.length} / ${triggers.length}`);
if (use.length === 0) process.exit(1);

const bg = await fieldBackground(video, triggers[0]!.frame, triggers[triggers.length - 1]!.frame, 120, log);
const bgHalf = toHalfField({ data: Buffer.from(bg), w: W, h: FIELD_H }, FIELD.y0);

/**
 * --dump: マスクの取り方を比べる材料（mask-tune.ts）を、発ごとに保存する。撃つ前のコマと背景の窓の画素、照準、色の係数、
 * 的の外接矩形、数えた点。derived/<id>/sg-dots-dump.json（目録）と .bin（窓の画素。発ごとに コマ・背景 の順）
 */
type DumpEntry = {
  section: string;
  trigger: number;
  fired: number;
  hits: number;
  rect: { x0: number; y0: number; w: number; h: number };
  aim: { x: number; y: number; type: 'ring' | 'cross'; size: number };
  disk: { r: number; edge: number };
  tintOut: { a: number; b: number }[];
  tintIn: { a: number; b: number }[];
  bbox: { x0: number; y0: number; x1: number; y1: number } | null;
  dots: { x: number; y: number; kind: 'hit' | 'miss' }[];
  offset: number;
};
const dumpEntries: DumpEntry[] = [];
const dumpChunks: Buffer[] = [];
let dumpOffset = 0;
function cropOf(
  img: Uint8Array,
  imgY0: number,
  imgH: number,
  rect: { x0: number; y0: number; w: number; h: number },
): Buffer {
  const out = Buffer.alloc(rect.w * rect.h * 3);
  for (let j = 0; j < rect.h; j++) {
    const y = rect.y0 + j - imgY0;
    if (y < 0 || y >= imgH) continue;
    for (let i = 0; i < rect.w; i++) {
      const x = rect.x0 + i;
      if (x < 0 || x >= W) continue;
      img.subarray((y * W + x) * 3, (y * W + x) * 3 + 3).forEach((v, c) => (out[(j * rect.w + i) * 3 + c] = v));
    }
  }
  return out;
}

/**
 * 撃ったコマ img で現れた点（ONSET）を探す。before は 1 コマ前、center はその照準、move は 1 コマ前から img への
 * 照準の動き。exclude は除く画素（窓の座標）
 */
function findOnset(
  img: Rgb,
  before: Rgb,
  center: { x: number; y: number },
  move: { x: number; y: number },
  exclude: Window,
): { x: number; y: number; contrast: number }[] {
  const ring = Array.from({ length: 16 }, (_, k) => [
    Math.round(ONSET.ring * Math.cos((k * Math.PI) / 8)),
    Math.round(ONSET.ring * Math.sin((k * Math.PI) / 8)),
  ]);
  const cands: { x: number; y: number; contrast: number }[] = [];
  const cx = Math.round(center.x);
  const cy = Math.round(center.y);
  const lim = ONSET.ring + 2;
  for (let y = cy - SEARCH_R; y <= cy + SEARCH_R; y++) {
    for (let x = cx - SEARCH_R; x <= cx + SEARCH_R; x++) {
      if (x < lim || x >= W - lim || y < lim || y >= H - lim || Math.hypot(x - cx, y - cy) > SEARCH_R) continue;
      const ei = x - exclude.x0;
      const ej = y - exclude.y0;
      if (ei >= 0 && ei < exclude.w && ej >= 0 && ej < exclude.h && exclude.labels[ej * exclude.w + ei] === UNKNOWN)
        continue;
      const c = lum3(img, x, y);
      if (c < ONSET.center || c - lum3(before, x, y) < ONSET.rise) continue;
      const bx = x - move.x;
      const by = y - move.y;
      if (bx >= 1 && bx < W - 1 && by >= 1 && by < H - 1 && c - lum3(before, bx, by) < ONSET.rise) continue;
      const r = ring
        .map(([dx, dy]) => {
          const i = ((y + dy!) * W + x + dx!) * 3;
          return (img.data[i]! + img.data[i + 1]! + img.data[i + 2]!) / 3;
        })
        .sort((a, b) => a - b);
      const contrast = c - r[Math.floor(r.length / 4)]!;
      if (contrast >= ONSET.contrast && c - r[Math.floor((r.length * 3) / 4)]! >= ONSET.contrastHi)
        cands.push({ x, y, contrast });
    }
  }
  cands.sort((a, b) => b.contrast - a.contrast);
  const out: typeof cands = [];
  for (const d of cands) if (!out.some((o) => Math.hypot(o.x - d.x, o.y - d.y) < ONSET.sep)) out.push(d);
  return out;
}

/** 窓の中で、的の画素までの距離（px、上限 lim。4 近傍と斜めの組み合わせのチャンファー距離） */
function distanceToTarget(win: Window, lim: number): Float32Array {
  const { w, h, labels } = win;
  const d = new Float32Array(w * h).fill(lim);
  for (let p = 0; p < w * h; p++) if (labels[p] === TARGET) d[p] = 0;
  for (let pass = 0; pass < 2; pass++) {
    const ys = pass === 0 ? [...Array(h).keys()] : [...Array(h).keys()].reverse();
    const xs = pass === 0 ? [...Array(w).keys()] : [...Array(w).keys()].reverse();
    const s = pass === 0 ? -1 : 1;
    for (const y of ys) {
      for (const x of xs) {
        const p = y * w + x;
        for (const [dx, dy, c] of [
          [s, 0, 1],
          [0, s, 1],
          [s, s, Math.SQRT2],
          [-s, s, Math.SQRT2],
        ] as const) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || xx >= w || yy < 0 || yy >= h) continue;
          const v = d[yy * w + xx]! + c;
          if (v < d[p]!) d[p] = v;
        }
      }
    }
  }
  return d;
}

// 読むフレーム: HUD の増分のフレーム t の SEARCH + BEFORE フレーム前から、t + K2 まで（撃った瞬間は t より後にならない）
const SEARCH = 24;
const need = new Set<number>();
for (const t of use) for (let f = t.frame - SEARCH - BEFORE - 1; f <= t.frame + K2 + 1; f++) need.add(f);
const frames = new Map<number, Rgb>();
const debugDir = values['debug-dir'];
if (debugDir) mkdirSync(debugDir, { recursive: true });
type Kind = 'hit' | 'miss';
type Dot = { x: number; y: number; contrast: number; kind: Kind };
type DotRow = {
  section: string;
  trigger: number;
  fired: number;
  x: number;
  y: number;
  contrast: number;
  kind: Kind;
  label: number;
  dist: number;
};
const rows: DotRow[] = [];
type PerTrigger = { t: Trigger; fired: number; hit: number; miss: number; aimOk: boolean };
const perTrigger: PerTrigger[] = [];

/** 照準の周り 3×3 の明るさの平均 */
function lum3(img: Rgb, x: number, y: number): number {
  let s = 0;
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) {
      const k = ((y + j) * W + x + i) * 3;
      s += img.data[k]! + img.data[k + 1]! + img.data[k + 2]!;
    }
  return s / 27;
}

/**
 * コマ f で現れた点を、当たり・外れに分ける（2026-10-04 にオーナーが録画 074 で目で確かめた: 当たったペレットの点は白く光り、
 * 外れたペレットの点は暗い灰色で光らない。白と灰色で 1 発 10 個、白の数は当たったペレットの数と同じ）。
 * 現れた直後の点は、当たりも外れも白い中心と灰色の縁の小さな丸（findOnset）。
 * 当たりの光は周りに暗い縁を持ち、点が固まると隣の点の縁が重なって 1〜3 コマ後の明るさでは外れと見分けにくい
 * （録画 109 の f6248）。そこで当たりは、光ったあと小さく残る白い点で決める。
 * - 当たり: 1 コマ後に周り 5×5 のどこかが光り（≥ HIT.glow）、K コマ後も白い（3×3 の平均 ≥ HIT.after）
 * - 外れ: K コマ後に白くなく（< MISS.after）、1〜3 コマ後が暗い灰色（MISS.lo〜MISS.hi）でほぼ一定（幅 ≤ MISS.spread）、
 *   かつ 2 コマ後に周り（半径 6 の円周の明るい側の 4 分の 1）より MISS.darker 以上暗い丸。当たりの光の暗い縁やダメージの
 *   数字の縁と取り違えないよう、1 コマ後に MISS.clear px 以内が光っている（≥ HIT.glow）所は数えない
 */
const HIT = { glow: 240, after: 205 };
const MISS = { after: 170, lo: 50, hi: 150, spread: 30, darker: 20, clear: 12 };
/** 周り (2r + 1)² の明るさの最大 */
function lumMax(img: Rgb, x: number, y: number, r: number): number {
  let m = 0;
  for (let j = -r; j <= r; j++)
    for (let i = -r; i <= r; i++) {
      const k = ((y + j) * W + x + i) * 3;
      m = Math.max(m, (img.data[k]! + img.data[k + 1]! + img.data[k + 2]!) / 3);
    }
  return m;
}
/** 半径 r の円周の明るさの、明るい側から 4 分の 1 の値 */
function ringHigh(img: Rgb, x: number, y: number, r: number): number {
  const v = Array.from({ length: 16 }, (_, k) => {
    const i =
      ((y + Math.round(r * Math.sin((k * Math.PI) / 8))) * W + x + Math.round(r * Math.cos((k * Math.PI) / 8))) * 3;
    return (img.data[i]! + img.data[i + 1]! + img.data[i + 2]!) / 3;
  }).sort((a, b) => b - a);
  return v[4]!;
}
function dotsAt(f: number, aim: { x: number; y: number }, move: { x: number; y: number }, excl: Window): Dot[] {
  const before = frames.get(f - 1);
  if (!before) return [];
  const img = frames.get(f);
  const later = [1, 2, 3, K].map((k) => frames.get(f + k));
  if (!img || later.some((l) => !l)) return [];
  const out: Dot[] = [];
  const onset = findOnset(img, before, aim, move, excl);
  if (values.verbose) log(`  f${f} 候補 ${onset.length}`);
  for (const d of onset) {
    const L = later.map((l) => lum3(l!, d.x, d.y));
    if (values.verbose)
      log(`  f${f} (${d.x},${d.y}) c ${d.contrast.toFixed(0)} L ${L.map((v) => v.toFixed(0)).join(' ')}`);
    if (lumMax(later[0]!, d.x, d.y, 2) >= HIT.glow && L[3]! >= HIT.after) out.push({ ...d, kind: 'hit' });
    else if (L[3]! < MISS.after) {
      const g = L.slice(0, 3);
      if (
        Math.min(...g) >= MISS.lo &&
        Math.max(...g) <= MISS.hi &&
        Math.max(...g) - Math.min(...g) <= MISS.spread &&
        L[1]! <= ringHigh(later[1]!, d.x, d.y, 6) - MISS.darker &&
        lumMax(later[0]!, d.x, d.y, MISS.clear) < HIT.glow
      )
        out.push({ ...d, kind: 'miss' });
    }
  }
  return out;
}

/** 照準の印と残弾の箱を除く画素（窓の座標。不明 = 除く） */
function exclusionOf(aim: NonNullable<ReturnType<typeof findAim>['aim']>): Window {
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
/**
 * 点を探さない HUD（照準からの相対）: 残弾の箱とスキルのアイコン、その下の白いゲージ。ゲージは光ったり伸びたりして
 * 点と取り違える（録画 109 の f6248。2026-10-04）
 */
const DOT_HUD = [
  { x0: -135, x1: -30, y0: -32, y1: 36 },
  { x0: -140, x1: 5, y0: 36, y1: 60 },
];
function hudOf(aim: { x: number; y: number }): { x0: number; x1: number; y0: number; y1: number } {
  return { x0: aim.x - 112, x1: aim.x - 36, y0: aim.y - 28, y1: aim.y + 28 };
}

/**
 * 撃った瞬間: t − SEARCH〜t のコマ f のうち、当たり・外れに分けられた点が最も多いコマ（同数なら早い方）。残弾の箱の明るさの変化で取ると、リロードの直後に照準と箱が動いたコマと取り違える
 * （録画 109 の f5568。2026-10-04）
 */
function firedOf(
  t: Trigger,
): { fired: number; dots: Dot[]; aim: NonNullable<ReturnType<typeof findAim>['aim']> } | null {
  const found: { fired: number; dots: Dot[]; aim: NonNullable<ReturnType<typeof findAim>['aim']> }[] = [];
  for (let f = t.frame - SEARCH; f <= t.frame; f++) {
    const prev = frames.get(f - 1);
    const aim = prev ? findAim(prev).aim : null;
    if (!aim) continue;
    const cur = frames.get(f);
    const aimF = cur ? findAim(cur).aim : null;
    const move = aimF ? { x: Math.round(aimF.x - aim.x), y: Math.round(aimF.y - aim.y) } : { x: 0, y: 0 };
    const dots = dotsAt(f, aim, move, exclusionOf(aim));
    found.push({ fired: f, dots, aim });
  }
  const most = Math.max(0, ...found.map((c) => c.dots.length));
  return found.find((c) => c.dots.length === most && most > 0) ?? null;
}

const firstF = Math.min(...need);
const lastF = Math.max(...need);
let done = 0;
const queue = [...use].sort((a, b) => a.frame - b.frame);
for await (const { frame, img } of readFrames(video, firstF, lastF, 1)) {
  if (!need.has(frame)) continue;
  frames.set(frame, { data: Buffer.from(img.data), w: img.w, h: img.h });
  // t + K2 + 1 まで読んだ発から処理する
  while (queue.length && queue[0]!.frame + K2 + 1 <= frame) {
    const t = queue.shift()!;
    done += 1;
    const found = firedOf(t);
    const a = found ? frames.get(found.fired - BEFORE) : undefined;
    const aim = a ? findAim(a).aim : null;
    if (!found || !a || !aim) {
      perTrigger.push({ t, fired: found?.fired ?? NaN, hit: 0, miss: 0, aimOk: false });
      continue;
    }
    const { fired, dots } = found;
    perTrigger.push({
      t,
      fired,
      hit: dots.filter((d) => d.kind === 'hit').length,
      miss: dots.filter((d) => d.kind === 'miss').length,
      aimOk: true,
    });
    // 撃つ前のコマの的のマスク（不明は埋めない）
    const rect = {
      x0: Math.round(aim.x) - MARGIN,
      y0: Math.round(aim.y) - MARGIN,
      w: 2 * MARGIN + 1,
      h: 2 * MARGIN + 1,
    };
    const hud = [hudOf(aim)];
    // SG の照準円（CDN の 250）の中は、円の中の画素で色の係数を当てはめる
    const R = CIRCLE_PX_PER_SCALE * ACCURACY;
    const outside = fitTintAround(a, bg, aim.x, aim.y, (x, y) => Math.hypot(x - aim.x, y - aim.y) > R + 4);
    const inside = fitTintAround(a, bg, aim.x, aim.y, (x, y) => Math.hypot(x - aim.x, y - aim.y) < R - 4);
    const disk = { x: aim.x, y: aim.y, r: R, edge: 3, tint: inside };
    const win = classifyRect(a.data, W, bg, FIELD, outside, rect, cfg, hud, disk);
    maskReticle(win, aim, aim.type, aim.size);
    const dist = distanceToTarget(win, 60);
    if (values.dump) {
      const tA = findTarget(toHalfField(a, 0), bgHalf, aim);
      const fc = cropOf(a.data, 0, H, rect);
      const bc = cropOf(bg, FIELD.y0, FIELD_H, rect);
      dumpEntries.push({
        section: t.section,
        trigger: t.frame,
        fired,
        hits: t.hits,
        rect,
        aim: { x: aim.x, y: aim.y, type: aim.type, size: aim.size },
        disk: { r: R, edge: 3 },
        tintOut: outside,
        tintIn: inside,
        bbox: tA ? { x0: tA.x0, y0: tA.y0, x1: tA.x1, y1: tA.y1 } : null,
        dots: dots.map((d) => ({ x: d.x, y: d.y, kind: d.kind })),
        offset: dumpOffset,
      });
      dumpChunks.push(fc, bc);
      dumpOffset += fc.length + bc.length;
    }
    for (const d of dots) {
      // 点は画面に固定なので、撃つ前のマスクの同じ画面の座標で見る
      const mx = Math.round(d.x) - win.x0;
      const my = Math.round(d.y) - win.y0;
      const ok = mx >= 0 && mx < win.w && my >= 0 && my < win.h;
      rows.push({
        section: t.section,
        trigger: t.frame,
        fired,
        x: d.x,
        y: d.y,
        contrast: d.contrast,
        kind: d.kind,
        label: ok ? win.labels[my * win.w + mx]! : BG,
        dist: ok ? dist[my * win.w + mx]! : 60,
      });
    }
    const shown = frames.get(fired + 2);
    if (debugDir && shown && done % Number(values['debug-every']) === 0) drawDebug(shown, win, dots, fired);
  }
  for (const f of [...frames.keys()]) if (f < frame - SEARCH - K2 - BEFORE - 4) frames.delete(f);
}

/** 点（当たりを緑・外れを赤の丸。左は撃った 2 コマ後）と撃つ前のコマのマスク（右: 的を青・不明をマゼンタ） */
function drawDebug(img: Rgb, win: Window, dots: Dot[], frame: number): void {
  const WW = win.w * 2;
  const out = Buffer.alloc(WW * win.h * 3);
  for (let j = 0; j < win.h; j++)
    for (let i = 0; i < win.w; i++) {
      const x = win.x0 + i;
      const y = win.y0 + j;
      const src = x >= 0 && x < W && y >= 0 && y < H ? [0, 1, 2].map((c) => img.data[(y * W + x) * 3 + c]!) : [0, 0, 0];
      out.set(src, (j * WW + i) * 3);
      const l = win.labels[j * win.w + i];
      const lab =
        l === TARGET
          ? [src[0]! >> 1, src[1]! >> 1, Math.min(255, (src[2]! >> 1) + 110)]
          : l === UNKNOWN
            ? [Math.min(255, (src[0]! >> 1) + 110), src[1]! >> 1, Math.min(255, (src[2]! >> 1) + 110)]
            : src;
      out.set(lab, (j * WW + win.w + i) * 3);
    }
  for (const d of dots) {
    for (const off of [0, win.w]) {
      const cx = d.x - win.x0;
      const cy = d.y - win.y0;
      for (let k = 0; k < 64; k++) {
        const x = Math.round(cx + 6 * Math.cos((k * Math.PI) / 32)) + off;
        const y = Math.round(cy + 6 * Math.sin((k * Math.PI) / 32));
        if (x >= off && x < off + win.w && y >= 0 && y < win.h)
          out.set(d.kind === 'hit' ? [0, 255, 0] : [255, 40, 40], (y * WW + x) * 3);
      }
    }
  }
  writeJpeg(out, WW, win.h, join(debugDir!, `dots-f${frame}.jpg`), WW * 2);
}

// まとめ
const key = `sg-dots@${cfg.version}`;
const dir = join(capturesDir(), 'derived', id);
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
writeFileSync(
  join(dir, `${key}.tsv`),
  [
    'section\ttrigger\tfired\tx\ty\tcontrast\tkind\tlabel\tdist',
    ...rows.map((r) =>
      [
        r.section,
        r.trigger,
        r.fired,
        r.x.toFixed(1),
        r.y.toFixed(1),
        r.contrast.toFixed(0),
        r.kind,
        r.label,
        r.dist.toFixed(1),
      ].join('\t'),
    ),
  ].join('\n') + '\n',
);
const sections = [...new Set(use.map((t) => t.section))];
for (const s of sections) {
  const all = perTrigger.filter((p) => p.t.section === s);
  const pt = all.filter((p) => p.aimOk);
  const rs = rows.filter((r) => r.section === s);
  const hits = pt.reduce((a, p) => a + p.t.hits, 0);
  const hit = pt.reduce((a, p) => a + p.hit, 0);
  const miss = pt.reduce((a, p) => a + p.miss, 0);
  const eq = pt.filter((p) => p.hit === p.t.hits).length;
  const over = pt.filter((p) => p.hit > p.t.hits).length;
  const ten = pt.filter((p) => p.hit + p.miss === 10).length;
  const over10 = pt.filter((p) => p.hit + p.miss > 10).length;
  const lab = (k: Kind): string => {
    const r = rs.filter((x) => x.kind === k);
    const n = (l: number): number => r.filter((x) => x.label === l).length;
    return `的 ${n(TARGET)}・不明 ${n(UNKNOWN)}・背景 ${n(BG)}`;
  };
  log(
    `${s}: トリガー ${pt.length} / ${all.length}・当たったペレット（HUD）${hits}・白 ${hit}（${(hit / hits).toFixed(3)}）・灰 ${miss}` +
      `・白 = HUD の発 ${eq}・白 > HUD の発 ${over}・白 + 灰 = 10 の発 ${ten}・> 10 の発 ${over10}` +
      `｜白のマスク: ${lab('hit')}｜灰のマスク: ${lab('miss')}` +
      `・HUD の遅れ ${median(pt.map((p) => p.t.frame - p.fired))}f（最大 ${Math.max(...pt.map((p) => p.t.frame - p.fired))}f）`,
  );
}
if (values.verbose)
  for (const p of perTrigger)
    log(
      `  ${p.t.section} t ${p.t.frame} fired ${p.fired} 遅れ ${p.t.frame - p.fired} HUD ${p.t.hits} 白 ${p.hit} 灰 ${p.miss}`,
    );
if (values.dump) {
  writeFileSync(join(dir, 'sg-dots-dump.bin'), Buffer.concat(dumpChunks));
  writeFileSync(join(dir, 'sg-dots-dump.json'), `${JSON.stringify({ id, field: FIELD, entries: dumpEntries })}\n`);
  log(`保存した: ${join(dir, 'sg-dots-dump.json')}（発 ${dumpEntries.length}）`);
}
