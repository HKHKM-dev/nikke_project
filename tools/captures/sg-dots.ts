// SG の着弾点（ペレットが的に当たった所に出る白い点）を読み、直前のコマの的のマスクと重ねる
// （plan/design-bullet-hit-rate-frame-coverage-verify.md 5.3 の主）。
//   node tools/captures/sg-dots.ts <録画 id> --pellets <sg-pellets の debug 出力> [--k 10] [--k2 25] [--debug-dir DIR]
//                                  [--debug-every 10] [--sections 遠,中遠]
//
// - トリガー（発）と当たったペレットの数は、read.ts --recipe sg-pellets --opt debug=1 の標準エラーの行
//   （「  <区間> f<フレーム> +<増分>: h <数> …」）から取る。
// - 点は、トリガーのフレームで小さく現れ、数フレーム大きく光ってから小さくなって残り、次のトリガー（約 40f 後）までに消える
//   （2026-10-04、録画 074 で目で見た）。そこで、トリガーの k フレーム後の「小さく残った点」を、白くて丸い小さな塊として探す。
//   トリガーの 1 フレーム前に白かった画素（数字の残り・照準）は除き、照準の形（maskReticle）と残弾の箱も除く。
// - 的のマスクは、トリガーの before フレーム前（前のトリガーの点が消え、まだ着弾の光が無い）のコマで、coverage.ts と同じ分け方。
//   点は画面に固定なので、同じ画面の座標で重ねる。
// - 点が画面に固定か的と一緒に動くかは、k と k2 の点の位置の動きと、的の外接矩形の動きを並べて確かめる。
// - 出力: derived/<id>/sg-dots@<設定の版>.tsv（点ごと）と、区間ごとのまとめ（標準エラー）。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { FIELD, H, W, findAim, readFrames, writeJpeg, type Rgb } from './aim-lib.ts';
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
import { fieldBackground, fitTintAround } from './field-bg.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    pellets: { type: 'string' },
    config: { type: 'string' },
    k: { type: 'string', default: '10' },
    k2: { type: 'string', default: '15' },
    before: { type: 'string', default: '6' },
    sections: { type: 'string' },
    'debug-dir': { type: 'string' },
    'debug-every': { type: 'string', default: '10' },
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
/** 点の大きさ（小さく残った点。録画 074 の遠で直径 5〜8px） */
const DOT = { minArea: 6, maxArea: 90, maxSize: 13, minFill: 0.45, white: 205, spread: 40 };
/** 点を探す範囲（照準の中心から。SG の照準円の半径 約 71px と余白 15px。上に流れる数字を拾わないよう、広げすぎない） */
const SEARCH_R = 86;
/** 窓の余白 */
const MARGIN = 140;
/** k と k2 で同じ点とみなす距離（px） */
const PERSIST = 2.5;
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
const use = triggers.filter((t) => !wanted || wanted.has(t.section) || wanted.has(t.section.replace(/ \d 回目$/, '')));
log(`トリガー ${use.length} / ${triggers.length}`);
if (use.length === 0) process.exit(1);

const bg = await fieldBackground(video, triggers[0]!.frame, triggers[triggers.length - 1]!.frame, 120, log);

/** 白くて丸い小さな塊（点）を探す。before で白かった画素は除く。exclude は除く画素（窓の座標） */
function findDots(
  img: Rgb,
  before: Rgb,
  center: { x: number; y: number },
  exclude: Window,
): { x: number; y: number; area: number }[] {
  const x0 = Math.round(center.x) - SEARCH_R;
  const y0 = Math.round(center.y) - SEARCH_R;
  const n = 2 * SEARCH_R + 1;
  const white = new Uint8Array(n * n);
  const isW = (d: Buffer, x: number, y: number): boolean => {
    const i = (y * W + x) * 3;
    const mn = Math.min(d[i]!, d[i + 1]!, d[i + 2]!);
    const mx = Math.max(d[i]!, d[i + 1]!, d[i + 2]!);
    return mn > DOT.white && mx - mn < DOT.spread;
  };
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = x0 + i;
      const y = y0 + j;
      if (x < 0 || x >= W || y < 0 || y >= H || Math.hypot(i - SEARCH_R, j - SEARCH_R) > SEARCH_R) continue;
      if (!isW(img.data, x, y) || isW(before.data, x, y)) continue;
      const ei = x - exclude.x0;
      const ej = y - exclude.y0;
      if (ei >= 0 && ei < exclude.w && ej >= 0 && ej < exclude.h && exclude.labels[ej * exclude.w + ei] === UNKNOWN)
        continue;
      white[j * n + i] = 1;
    }
  }
  const seen = new Uint8Array(n * n);
  const out: { x: number; y: number; area: number }[] = [];
  for (let p0 = 0; p0 < n * n; p0++) {
    if (!white[p0] || seen[p0]) continue;
    const stack = [p0];
    seen[p0] = 1;
    let area = 0;
    let sx = 0;
    let sy = 0;
    let ix0 = Infinity;
    let ix1 = -Infinity;
    let iy0 = Infinity;
    let iy1 = -Infinity;
    while (stack.length) {
      const p = stack.pop()!;
      const i = p % n;
      const j = (p - i) / n;
      area += 1;
      sx += i;
      sy += j;
      ix0 = Math.min(ix0, i);
      ix1 = Math.max(ix1, i);
      iy0 = Math.min(iy0, j);
      iy1 = Math.max(iy1, j);
      for (const q of [i > 0 ? p - 1 : -1, i < n - 1 ? p + 1 : -1, p - n, p + n]) {
        if (q < 0 || q >= n * n || seen[q] || !white[q]) continue;
        seen[q] = 1;
        stack.push(q);
      }
    }
    const bw = ix1 - ix0 + 1;
    const bh = iy1 - iy0 + 1;
    if (area < DOT.minArea || area > DOT.maxArea || bw > DOT.maxSize || bh > DOT.maxSize) continue;
    if (area / (bw * bh) < DOT.minFill) continue;
    out.push({ x: x0 + sx / area, y: y0 + sy / area, area });
  }
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

// 読むフレーム: HUD の増分のフレーム t の SEARCH フレーム前から、t と撃った瞬間の K2 フレーム後まで
const SEARCH = 20;
const need = new Set<number>();
for (const t of use) for (let f = t.frame - SEARCH - BEFORE; f <= t.frame + K2; f++) need.add(f);
const frames = new Map<number, Rgb>();
const debugDir = values['debug-dir'];
if (debugDir) mkdirSync(debugDir, { recursive: true });
type DotRow = {
  section: string;
  trigger: number;
  fired: number;
  x: number;
  y: number;
  area: number;
  label: number;
  dist: number;
};
const rows: DotRow[] = [];
const perTrigger: { t: Trigger; fired: number; dots: number; dotShift: number; aimOk: boolean }[] = [];

/** 照準の左の残弾の箱の明るさの、前のコマとの差の和（箱は照準の中心から x −118〜−30・y −34〜+34） */
function ammoBoxChange(cur: Rgb, prev: Rgb, aim: { x: number; y: number }): number {
  let sum = 0;
  for (let y = Math.round(aim.y) - 34; y <= Math.round(aim.y) + 34; y++)
    for (let x = Math.round(aim.x) - 118; x <= Math.round(aim.x) - 30; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = (y * W + x) * 3;
      sum += Math.abs(
        cur.data[i]! + cur.data[i + 1]! + cur.data[i + 2]! - prev.data[i]! - prev.data[i + 1]! - prev.data[i + 2]!,
      );
    }
  return sum;
}

type Pending = { t: Trigger; fired: number; aim: ReturnType<typeof findAim>['aim'] };
const pending: Pending[] = [];
let done = 0;
const firstF = Math.min(...need);
const lastF = Math.max(...need);
for await (const { frame, img } of readFrames(video, firstF, lastF, 1)) {
  if (!need.has(frame)) continue;
  frames.set(frame, { data: Buffer.from(img.data), w: img.w, h: img.h });
  // HUD の増分のフレームに着いたら、撃った瞬間（残弾の箱の数字が変わったコマ）を探す
  for (const t of use) {
    if (t.frame !== frame) continue;
    const base = frames.get(t.frame - SEARCH);
    const aim0 = base ? findAim(base).aim : null;
    let fired = NaN;
    if (aim0) {
      let best = -1;
      for (let f = t.frame - SEARCH + 1; f <= t.frame; f++) {
        const cur = frames.get(f);
        const prev = frames.get(f - 1);
        if (!cur || !prev) continue;
        const v = ammoBoxChange(cur, prev, aim0);
        if (v > best) {
          best = v;
          fired = f;
        }
      }
    }
    pending.push({ t, fired, aim: aim0 });
  }
  // そろった発から処理する
  for (let pi = pending.length - 1; pi >= 0; pi--) {
    const { t, fired } = pending[pi]!;
    if (!Number.isFinite(fired)) {
      perTrigger.push({ t, fired, dots: 0, dotShift: NaN, aimOk: false });
      pending.splice(pi, 1);
      continue;
    }
    if (frame < fired + K2) continue;
    pending.splice(pi, 1);
    const a = frames.get(fired - BEFORE);
    const b = frames.get(fired + K);
    const c = frames.get(fired + K2);
    done += 1;
    const aim = a ? findAim(a).aim : null;
    if (!a || !b || !c || !aim) {
      perTrigger.push({ t, fired, dots: 0, dotShift: NaN, aimOk: false });
      continue;
    }
    // 撃つ前のコマの的のマスク（不明は埋めない）
    const rect = {
      x0: Math.round(aim.x) - MARGIN,
      y0: Math.round(aim.y) - MARGIN,
      w: 2 * MARGIN + 1,
      h: 2 * MARGIN + 1,
    };
    const hud = [{ x0: aim.x - 112, x1: aim.x - 36, y0: aim.y - 28, y1: aim.y + 28 }];
    // SG の照準円（CDN の 250）の中は、円の中の画素で色の係数を当てはめる
    const R = CIRCLE_PX_PER_SCALE * ACCURACY;
    const outside = fitTintAround(a, bg, aim.x, aim.y, (x, y) => Math.hypot(x - aim.x, y - aim.y) > R + 4);
    const inside = fitTintAround(a, bg, aim.x, aim.y, (x, y) => Math.hypot(x - aim.x, y - aim.y) < R - 4);
    const disk = { x: aim.x, y: aim.y, r: R, edge: 3, tint: inside };
    const win = classifyRect(a.data, W, bg, FIELD, outside, rect, cfg, hud, disk);
    maskReticle(win, aim, aim.type, aim.size);
    const excl: Window = { ...win, labels: new Int8Array(win.w * win.h) };
    maskReticle(excl, aim, aim.type, aim.size);
    for (let j = 0; j < excl.h; j++)
      for (let i = 0; i < excl.w; i++) {
        const x = excl.x0 + i;
        const y = excl.y0 + j;
        if (x >= hud[0]!.x0 && x <= hud[0]!.x1 && y >= hud[0]!.y0 && y <= hud[0]!.y1)
          excl.labels[j * excl.w + i] = UNKNOWN;
      }
    const dist = distanceToTarget(win, 60);
    const dotsB = findDots(b, a, aim, excl);
    const dotsC = findDots(c, a, aim, excl);
    // 点は画面に固定（2026-10-04、録画 109 の遠）。数字の欠片は上へ流れるので、k と k2 の両方で同じ所にある点だけを残す
    const moves: number[] = [];
    const kept = dotsB.filter((d) => {
      let best: { dx: number; dist: number } | null = null;
      for (const e of dotsC) {
        const dd = Math.hypot(e.x - d.x, e.y - d.y);
        if (dd <= 12 && (!best || dd < best.dist)) best = { dx: e.x - d.x, dist: dd };
      }
      if (best) moves.push(best.dx);
      return best !== null && best.dist <= PERSIST;
    });
    perTrigger.push({ t, fired, dots: kept.length, dotShift: median(moves), aimOk: true });
    for (const d of kept) {
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
        area: d.area,
        label: ok ? win.labels[my * win.w + mx]! : BG,
        dist: ok ? dist[my * win.w + mx]! : 60,
      });
    }
    if (debugDir && done % Number(values['debug-every']) === 0) drawDebug(b, win, kept, fired);
  }
  for (const f of [...frames.keys()]) if (f < frame - SEARCH - K2 - BEFORE - 2) frames.delete(f);
}

/** 点（緑の丸）と撃つ前のコマのマスク（右: 的を青・不明をマゼンタ） */
function drawDebug(img: Rgb, win: Window, dots: { x: number; y: number }[], frame: number): void {
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
        if (x >= off && x < off + win.w && y >= 0 && y < win.h) out.set([0, 255, 0], (y * WW + x) * 3);
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
    'section\ttrigger\tx\ty\tarea\tlabel\tdist',
    ...rows.map((r) =>
      [r.section, r.trigger, r.fired, r.x.toFixed(1), r.y.toFixed(1), r.area, r.label, r.dist.toFixed(1)].join('\t'),
    ),
  ].join('\n') + '\n',
);
const sections = [...new Set(use.map((t) => t.section))];
for (const s of sections) {
  const pt = perTrigger.filter((p) => p.t.section === s && p.aimOk);
  const rs = rows.filter((r) => r.section === s);
  const hits = pt.reduce((a, p) => a + p.t.hits, 0);
  const dots = pt.reduce((a, p) => a + p.dots, 0);
  const inT = rs.filter((r) => r.label === TARGET).length;
  const unk = rs.filter((r) => r.label === UNKNOWN).length;
  const bgR = rs.filter((r) => r.label === BG);
  const near = (lim: number): number => bgR.filter((r) => r.dist <= lim).length;
  log(
    `${s}: トリガー ${pt.length}・当たったペレット ${hits}・点 ${dots}（${(dots / hits).toFixed(3)}）・的 ${inT}・不明 ${unk}・背景 ${bgR.length}` +
      `（的まで ≤2px ${near(2)}・≤5px ${near(5)}・≤10px ${near(10)}・>10px ${bgR.length - near(10)}）` +
      `・k→k2 の点の動き ${median(pt.map((p) => p.dotShift)).toFixed(1)}px・HUD の遅れ ${median(pt.map((p) => p.t.frame - p.fired))}f（最大 ${Math.max(...pt.map((p) => p.t.frame - p.fired))}f）`,
  );
}
