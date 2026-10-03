// 射撃場の単騎・AUTO の録画から、発ごとの被覆率（照準円のうち的に入る割合）を数え、着地点ごとの表 h(L, s) を出す
// （plan/design-bullet-hit-rate-frame-coverage.md 2 節。部品は coverage-lib.ts、照準と的の検出は aim-lib.ts）。
//   node tools/captures/coverage.ts <録画 id> [--config tools/captures/coverage-config.json] [--sections f1,f2,...]
//                                   [--debug-dir DIR] [--debug-every 200] [--limit N] [--bg-step 120]
//
// - 発のフレーム: HUD の増分（derived/<id>/hud-jumps@1.tsv。read.ts のレシピ hud-jumps が作る）をまとまり（マガジン）に分け、
//   最初の増分から連射の間隔ごとに、最後の増分までを発とする（V-0118 の数え方）。操作枠の残弾は枠アイコンの上に出ず、
//   照準の横の箱は照準と一緒に動くので、ammo.ts では読めない。まとまりの頭と終わりの外れた発は入らない。
// - 背景: 発の範囲の戦闘中のフレーム（照準の線が見える）の、戦場（y 120〜720）の全解像度の中央値。
// - 発ごとに: 照準の中心（aim-lib の findAim）→ 窓の画素の分類（的・背景・不明）→ 不明を埋める → 距離ごとの数え上げ →
//   s の格子ごとの被覆率（一様・正規）。照準が読めない発・不明の割合が大きい発は落とす（理由を残す）。
// - 区間: まとまりごとの的の足元の y と照準の高さの幅（aim-lib の findTarget）が大きく変わる所で切り、帯の並び
//   （data/enemies.json の range-3min-jump）で帯を当て、近は幅（C-0155）、中遠は足元の y（C-0044）で着地点を決める。
//   --sections で切れ目（区間の最初の発のフレーム）を与えれば、それを使う。
// - 出力: derived/<id>/coverage@<設定の版>.shots.tsv（発ごと）と .summary.json（区間・着地点ごとの表）。追跡しない。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import {
  FIELD,
  H,
  W,
  buildBackground,
  findAim,
  findLines,
  findTarget,
  linesVisible,
  readFrames,
  toHalfField,
  writeJpeg,
  type Rgb,
} from './aim-lib.ts';
import {
  CIRCLE_PX_PER_SCALE,
  TARGET,
  UNKNOWN,
  classifyWindow,
  coverageOf,
  fillUnknown,
  fractionWithin,
  isOverlayColor,
  landingOf,
  magazinesOf,
  median,
  radialHistogram,
  shotFramesOf,
  shotIntervalOf,
  type CoverageConfig,
  type Window,
} from './coverage-lib.ts';
import { capturesDir } from './dirs.ts';
import { parseHudJumpsTsv } from './recipes/triggers.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    config: {
      type: 'string',
      default: new URL('./coverage-config.json', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'),
    },
    sections: { type: 'string' },
    'debug-dir': { type: 'string' },
    'debug-every': { type: 'string', default: '200' },
    limit: { type: 'string' },
    from: { type: 'string' },
    to: { type: 'string' },
    'bg-step': { type: 'string', default: '120' },
  },
});

const id = positionals[0];
if (!id) {
  console.error(
    'usage: node tools/captures/coverage.ts <録画 id> [--config FILE] [--sections f1,f2,...] [--debug-dir DIR] [--debug-every 200] [--limit N]',
  );
  process.exit(1);
}
const log = (m: string): void => console.error(m);
const cfg = JSON.parse(readFileSync(values.config!, 'utf8')) as CoverageConfig;
const repo = new URL('../../', import.meta.url);
const recording = JSON.parse(readFileSync(new URL(`records/recordings/${id}.json`, repo), 'utf8')) as {
  folder: string;
  file: string;
  team: { rid: number; controlled?: boolean; name: string }[];
};
const video = join(capturesDir(), recording.folder, recording.file);
const member = recording.team.find((m) => m.controlled) ?? recording.team[0]!;
const character = JSON.parse(
  readFileSync(new URL(`packages/core/data/characters/${member.rid}.json`, repo), 'utf8'),
) as { weaponType: string; shot: { maxAmmo: number; rateOfFire: number; accuracy: { autoStart: number } } };
if (recording.team.length !== 1)
  log(`注意: 単騎ではない（${recording.team.length} 体）。操作枠 ${member.name} の発として数える`);
if (!['AR', 'SMG'].includes(character.weaponType)) log(`注意: 武器種 ${character.weaponType} は範囲外（AR・SMG）`);

// ---------------------------------------------------------------------------------------------------------------------
// 発のフレーム

const derivedDir = join(capturesDir(), 'derived', id);
const hudPath = join(derivedDir, 'hud-jumps@1.tsv');
if (!existsSync(hudPath)) {
  console.error(`${hudPath} が無い。先に node tools/captures/read.ts ${id} hud-jumps でキャッシュを作る`);
  process.exit(1);
}
const hud = parseHudJumpsTsv(readFileSync(hudPath, 'utf8'));
const mags = magazinesOf(
  hud.map((r) => r.frame),
  cfg.magazineGap,
);
const interval = shotIntervalOf(mags, character.shot.maxAmmo, character.shot.rateOfFire);
let shots = shotFramesOf(mags, interval);
if (values.from) shots = shots.filter((s) => s.frame >= Number(values.from));
if (values.to) shots = shots.filter((s) => s.frame <= Number(values.to));
if (values.limit) shots = shots.slice(0, Number(values.limit));
log(`発: まとまり ${mags.length}・間隔 ${interval.toFixed(3)}f・発 ${shots.length}`);

// ---------------------------------------------------------------------------------------------------------------------
// 背景（戦場の全解像度の中央値）

const FIELD_H = FIELD.y1 - FIELD.y0;
async function fieldBackground(from: number, to: number, step: number): Promise<Uint8Array> {
  const frames: Uint8Array[] = [];
  for await (const { img } of readFrames(video, from, to, step, { y: FIELD.y0, h: FIELD_H })) {
    if (linesVisible(findLines(img, FIELD.y0))) frames.push(img.data);
  }
  const n = frames.length;
  log(`背景: 戦闘中のフレーム ${n} の中央値`);
  const bg = new Uint8Array(W * FIELD_H * 3);
  const col = new Uint8Array(n);
  for (let i = 0; i < bg.length; i++) {
    for (let k = 0; k < n; k++) col[k] = frames[k]![i]!;
    col.sort();
    bg[i] = col[n >> 1] ?? 0;
  }
  return bg;
}
const firstShot = shots[0]!.frame;
const lastShot = shots[shots.length - 1]!.frame;
// 背景は、発の範囲を絞っても戦闘の全体（最初と最後のまとまりの間）から作る
const bg = await fieldBackground(mags[0]!.first, mags[mags.length - 1]!.last, Number(values['bg-step']));
const bgHalf = toHalfField({ data: Buffer.from(bg), w: W, h: FIELD_H }, FIELD.y0);
void buildBackground; // 半分の解像度の背景は全解像度の背景から作る（aim.ts と同じ toHalfField）

/** 背景を今のフレームの色に合わせる係数（照準の周り ±200px の、重なりでない画素で。aim-lib の fitTint と同じ当てはめ） */
function fitTintAround(img: Rgb, cx: number, cy: number): { a: number; b: number }[] {
  const out: { a: number; b: number }[] = [];
  for (let c = 0; c < 3; c++) {
    const xs: number[] = [];
    const ys: number[] = [];
    for (let y = Math.max(FIELD.y0, Math.round(cy) - 200); y < Math.min(FIELD.y1, Math.round(cy) + 200); y += 5) {
      for (let x = Math.max(0, Math.round(cx) - 200); x < Math.min(W, Math.round(cx) + 200); x += 5) {
        const fi = (y * W + x) * 3;
        if (isOverlayColor(img.data[fi]!, img.data[fi + 1]!, img.data[fi + 2]!)) continue;
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
      if (n < 100 || den <= 0) break;
      a = (n * sxy - sx * sy) / den;
      b = (sy - a * sx) / n;
    }
    out.push({ a, b });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// 発ごとの被覆率

const rMax = 3 * CIRCLE_PX_PER_SCALE * Math.max(...cfg.sGrid);
const HALF = Math.ceil(rMax) + 2;
const rShot = CIRCLE_PX_PER_SCALE * cfg.sShot;
type ShotRow = {
  frame: number;
  magazine: number;
  aim?: { x: number; y: number; conf: number };
  drop: string;
  unknown: number;
  uniform: number[];
  normal: number[];
};
const rows: ShotRow[] = [];
const magStats = new Map<number, { footY: number[]; bandW: number[] }>();
const debugDir = values['debug-dir'];
const debugEvery = Number(values['debug-every']);
if (debugDir) mkdirSync(debugDir, { recursive: true });
const shotAt = new Map(shots.map((s) => [s.frame, s]));
const firstOfMag = new Set(mags.map((_, i) => shots.find((s) => s.magazine === i)?.frame));
let done = 0;
for await (const { frame, img } of readFrames(video, firstShot, lastShot, 1)) {
  const shot = shotAt.get(frame);
  if (!shot) continue;
  done += 1;
  if (done % 500 === 0) log(`  ${done} / ${shots.length}`);
  const row: ShotRow = { frame, magazine: shot.magazine, drop: '', unknown: NaN, uniform: [], normal: [] };
  rows.push(row);
  const { aim } = findAim(img);
  if (!aim || aim.conf < 0.5) {
    row.drop = 'aim';
    continue;
  }
  row.aim = { x: aim.x, y: aim.y, conf: aim.conf };
  // 的の足元と照準の高さの幅（区間の切れ目と着地点。まとまりの頭と、ほぼ 10 発ごと）
  if (firstOfMag.has(frame) || done % 10 === 0) {
    const t = findTarget(toHalfField(img, 0), bgHalf, aim);
    if (t && !t.clipped && t.fx < 0.45) {
      const s = magStats.get(shot.magazine) ?? { footY: [], bandW: [] };
      s.footY.push(t.y1);
      s.bandW.push(t.bandW);
      magStats.set(shot.magazine, s);
    }
  }
  const tint = fitTintAround(img, aim.x, aim.y);
  // 照準の左の残弾の箱（aim-lib の findTarget と同じ位置）は HUD なので不明にする
  const hudBox = { x0: aim.x - 112, x1: aim.x - 36, y0: aim.y - 28, y1: aim.y + 28 };
  const win = classifyWindow(img.data, W, bg, FIELD, tint, aim, HALF, cfg, [hudBox]);
  row.unknown = fractionWithin(win, aim, rShot, (l) => l === UNKNOWN);
  const before = debugDir && done % debugEvery === 0 ? Int8Array.from(win.labels) : null;
  fillUnknown(win);
  if (row.unknown > cfg.maxUnknown) row.drop = 'unknown';
  const ci = (Math.round(aim.y) - win.y0) * win.w + (Math.round(aim.x) - win.x0);
  const cov = coverageOf(radialHistogram(win, aim, rMax), cfg.sGrid, win.labels[ci] === TARGET);
  row.uniform = cov.uniform;
  row.normal = cov.normal;
  if (before) drawWindow(img, win, before, aim, frame);
}
log(`発ごとの数え上げ: ${rows.length}（落とした ${rows.filter((r) => r.drop).length}）`);

/** 窓を 3 倍にして、的（青）・埋めた不明（マゼンタ）・sShot の照準円（黄）を描く */
function drawWindow(img: Rgb, win: Window, before: Int8Array, aim: { x: number; y: number }, frame: number): void {
  const Z = 3;
  const out = Buffer.alloc(win.w * Z * win.h * Z * 3 * 2);
  const WW = win.w * Z * 2;
  for (let j = 0; j < win.h; j++) {
    for (let i = 0; i < win.w; i++) {
      const x = win.x0 + i;
      const y = win.y0 + j;
      const inside = x >= 0 && x < W && y >= 0 && y < H;
      const src = inside ? [0, 1, 2].map((c) => img.data[(y * W + x) * 3 + c]!) : [0, 0, 0];
      const p = j * win.w + i;
      let lab = src;
      if (win.labels[p] === TARGET) lab = [src[0]! >> 1, src[1]! >> 1, Math.min(255, (src[2]! >> 1) + 110)];
      if (before[p] === UNKNOWN)
        lab = [Math.min(255, (lab[0]! >> 1) + 110), lab[1]! >> 1, Math.min(255, (lab[2]! >> 1) + 110)];
      for (let dy = 0; dy < Z; dy++) {
        for (let dx = 0; dx < Z; dx++) {
          const yy = j * Z + dy;
          out.set(src, (yy * WW + i * Z + dx) * 3);
          out.set(lab, (yy * WW + win.w * Z + i * Z + dx) * 3);
        }
      }
    }
  }
  for (const off of [0, win.w * Z]) {
    for (let k = 0; k < 720; k++) {
      const a = (k * Math.PI) / 360;
      const x = Math.round((aim.x - win.x0 + 0.5) * Z + rShot * Z * Math.cos(a)) + off;
      const y = Math.round((aim.y - win.y0 + 0.5) * Z + rShot * Z * Math.sin(a));
      if (x >= off && x < off + win.w * Z && y >= 0 && y < win.h * Z) out.set([255, 230, 0], (y * WW + x) * 3);
    }
  }
  writeJpeg(out, WW, win.h * Z, join(debugDir!, `f${frame}.jpg`), WW);
}

// ---------------------------------------------------------------------------------------------------------------------
// 区間と着地点

const eventSets = JSON.parse(readFileSync(new URL('packages/core/data/enemies.json', repo), 'utf8')) as {
  eventSets: { id: string; landings: string[] }[];
};
// 帯の並び（最初の区間を含む。C-0031 の 中近 → 近 → 遠 → 中遠 → 近 → 短い遠）
const bandsInOrder = eventSets.eventSets.find((e) => e.id === 'range-3min-jump')!.landings;
const magSummary = mags.map((m, i) => {
  const s = magStats.get(i);
  return { first: m.first, last: m.last, footY: median(s?.footY ?? []), bandW: median(s?.bandW ?? []) };
});
let cuts: number[];
if (values.sections) cuts = values.sections.split(',').map(Number);
else {
  cuts = [];
  let prev = magSummary[0]!;
  for (const m of magSummary.slice(1)) {
    if (!Number.isFinite(m.footY) || !Number.isFinite(prev.footY)) continue;
    const dy = Math.abs(m.footY - prev.footY);
    const dw = Math.abs(m.bandW - prev.bandW) / Math.max(m.bandW, prev.bandW);
    if (dy >= cfg.sectionDy || dw >= cfg.sectionDw) cuts.push(m.first);
    prev = m;
  }
}
const sectionOf = (frame: number): number => cuts.filter((c) => frame >= c).length;
const sections = Array.from({ length: cuts.length + 1 }, (_, i) => {
  const ms = magSummary.filter((m) => sectionOf(m.first) === i);
  const footY = median(ms.map((m) => m.footY));
  const bandW = median(ms.map((m) => m.bandW));
  const band = bandsInOrder[i] ?? '?';
  return {
    index: i,
    band,
    landing: band === '?' ? '?' : landingOf(band, { footY, bandW }, cfg),
    frames: [ms[0]?.first ?? NaN, ms[ms.length - 1]?.last ?? NaN],
    footY,
    bandW,
  };
});
if (sections.length !== bandsInOrder.length)
  log(`注意: 区間が ${sections.length}（帯の並びは ${bandsInOrder.length}）。--sections で切れ目を与えて確かめる`);

// ---------------------------------------------------------------------------------------------------------------------
// 出力

const sd = (v: number[]): number => {
  if (v.length < 2) return NaN;
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1));
};
const mean = (v: number[]): number => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const used = rows.filter((r) => !r.drop);
const byLanding: Record<string, unknown> = {};
for (const landing of [...new Set(sections.map((s) => s.landing))]) {
  const idx = sections.filter((s) => s.landing === landing).map((s) => s.index);
  const all = rows.filter((r) => idx.includes(sectionOf(r.frame)));
  const ok = all.filter((r) => !r.drop);
  const perSection = idx.map((i) => ok.filter((r) => sectionOf(r.frame) === i));
  byLanding[landing] = {
    sections: idx,
    shots: all.length,
    dropped: {
      aim: all.filter((r) => r.drop === 'aim').length,
      unknown: all.filter((r) => r.drop === 'unknown').length,
    },
    unknownMean: mean(ok.map((r) => r.unknown)),
    uniform: cfg.sGrid.map((_, k) => mean(ok.map((r) => r.uniform[k]!))),
    normal: cfg.sGrid.map((_, k) => mean(ok.map((r) => r.normal[k]!))),
    sectionSd: {
      uniform: cfg.sGrid.map((_, k) =>
        sd(perSection.filter((p) => p.length).map((p) => mean(p.map((r) => r.uniform[k]!)))),
      ),
    },
  };
}
const key = `coverage@${cfg.version}`;
mkdirSync(derivedDir, { recursive: true });
const sHead = cfg.sGrid.flatMap((s) => [`u${s}`]).concat(cfg.sGrid.map((s) => `n${s}`));
const tsv = [
  ['frame', 'magazine', 'section', 'aim_x', 'aim_y', 'aim_conf', 'drop', 'unknown', ...sHead].join('\t'),
  ...rows.map((r) =>
    [
      r.frame,
      r.magazine,
      sectionOf(r.frame),
      r.aim?.x.toFixed(1) ?? '',
      r.aim?.y.toFixed(1) ?? '',
      r.aim?.conf.toFixed(2) ?? '',
      r.drop,
      Number.isFinite(r.unknown) ? r.unknown.toFixed(3) : '',
      ...r.uniform.map((v) => v.toFixed(4)),
      ...r.normal.map((v) => v.toFixed(4)),
    ].join('\t'),
  ),
].join('\n');
writeFileSync(join(derivedDir, `${key}.shots.tsv`), `${tsv}\n`);
const summary = {
  recording: id,
  video,
  character: {
    rid: member.rid,
    name: member.name,
    weaponType: character.weaponType,
    accuracy: character.shot.accuracy.autoStart,
  },
  config: cfg,
  createdAt: new Date().toISOString(),
  shotInterval: interval,
  magazines: magSummary,
  sections,
  shots: rows.length,
  used: used.length,
  landings: byLanding,
};
writeFileSync(join(derivedDir, `${key}.summary.json`), `${JSON.stringify(summary, null, 2)}\n`);
log(`書いた: ${join(derivedDir, `${key}.shots.tsv`)}・${key}.summary.json`);
for (const s of sections)
  log(`  区間 ${s.index}: ${s.band} → ${s.landing}（f${s.frames[0]}〜${s.frames[1]}・足元 ${s.footY}・幅 ${s.bandW}）`);
const k110 = cfg.sGrid.indexOf(cfg.sShot);
for (const [landing, v] of Object.entries(byLanding) as [
  string,
  { uniform: number[]; normal: number[]; shots: number },
][])
  log(
    `  ${landing}: 発 ${v.shots}・h(s=${cfg.sShot}) 一様 ${v.uniform[k110]?.toFixed(3)}・正規 ${v.normal[k110]?.toFixed(3)}`,
  );
