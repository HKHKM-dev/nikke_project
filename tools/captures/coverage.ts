// 射撃場の単騎・AUTO の録画から、着地点ごとの被覆率の表 h(L, s) を出す（plan/design-bullet-hit-rate-frame-coverage.md
// 1.1・2 節。部品は coverage-lib.ts、照準と的の検出は aim-lib.ts）。
//   node tools/captures/coverage.ts <録画 id> [--config tools/captures/coverage-config.json] [--sections f1,f2,...]
//                                   [--from N] [--to N] [--debug-dir DIR] [--debug-every 20] [--bg-step 120]
//
// 撃っている間は照準円の中が着弾の光で隠れるので、形は撃っていないコマ（リロード中など）から、照準のずれは発のフレームから
// 読み、組み合わせる（設計書 1.1）。
// - 発のフレーム: HUD の増分（derived/<id>/hud-jumps@<版>.tsv。read.ts のレシピ hud-jumps が作る）をまとまり（マガジン）に分け、
//   最初の増分から連射の間隔ごとに、最後の増分までを発とする（V-0118 の数え方）。
// - 発ごとに: 照準の中心 a_t（findAim）と、的の基準点 b_t。ずれ d_t = a_t − b_t。基準点の横は、findTarget の的の画素（半分の
//   解像度）のうち照準の中心から anchorExclude px より外のものの x の中央値（照準の周りは、発のフレームでは着弾の光、撃っていない
//   コマでは照準で隠れるので、どちらのコマでも同じく除く）。縦は区間の足元の y（的は同じ地面の上を横に動くので、区間の中で一定。
//   上半身はポップアップの数字、脚はリロード中のバーで隠れることがあり、重心の y は撃つかどうかで偏る）。
// - 撃っていないコマ: まとまりの間で、最後の増分から cleanAfter f 後〜次の最初の増分の cleanBefore f 前を cleanStep f ごとに。
//   的の外接矩形と余白の中の画素を「的・背景・不明」に分ける。照準の表示は形からも不明にする（maskReticle）。不明は埋めない。
// - 確率の地図: 着地点ごとに、見本を基準点で重ね、位置ごとに「見えていた見本のうち的だった割合」を出す。リロード中も照準は
//   コアの近くにあり、照準の下は見えないが、照準の位置は見本ごとに違うので、見えていた見本だけで割合を出せる（見本についての平均）。
// - 被覆率: 発ごとに、地図の d_t の位置に照準円を置いた確率の平均（一様）・重み付きの平均（正規。normalEvery 発ごと）。
// - 自己検査: 見本 j を地図から抜き、発のずれの位置（着地点の発から選んだもの）の照準円の中で、j で見えている画素について、
//   j の的の割合と、j を除いた地図の確率の平均を並べる（設計書 2 節 5）。
// - 区間: まとまりごとの的の足元の y と照準の高さの幅が大きく変わる所で切り、帯の並び（data/enemies.json の range-3min-jump）で
//   帯を当て、近は幅（C-0155）、中遠は足元の y（C-0044）で着地点を決める。--sections で切れ目を与えれば、それを使う。
// - 出力: derived/<id>/coverage@<設定の版>.shots.tsv（発ごと）と .summary.json（着地点ごとの表と自己検査）。追跡しない。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import {
  FIELD,
  H,
  W,
  findAim,
  findTarget,
  readFrames,
  targetMedianX,
  toHalfField,
  writeJpeg,
  type Rgb,
} from './aim-lib.ts';
import {
  CIRCLE_PX_PER_SCALE,
  TARGET,
  UNKNOWN,
  accumulate,
  classifyRect,
  coverageOf,
  landingOf,
  magazinesOf,
  mapHistogram,
  maskReticle,
  median,
  newMap,
  probAt,
  shotFramesOf,
  shotIntervalOf,
  type CoverageConfig,
  type ProbMap,
  type Window,
} from './coverage-lib.ts';
import { capturesDir } from './dirs.ts';
import { FIELD_H, fieldBackground, fitTintAround } from './field-bg.ts';
import { HUD_JUMPS_CACHE_KEY } from './recipes/hud-jumps.ts';
import { parseHudJumpsTsv } from './recipes/triggers.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    config: { type: 'string' },
    sections: { type: 'string' },
    from: { type: 'string' },
    to: { type: 'string' },
    'debug-dir': { type: 'string' },
    'debug-every': { type: 'string', default: '20' },
    'bg-step': { type: 'string', default: '120' },
  },
});

const id = positionals[0];
if (!id) {
  console.error(
    'usage: node tools/captures/coverage.ts <録画 id> [--config FILE] [--sections f1,f2,...] [--from N] [--to N] [--debug-dir DIR]',
  );
  process.exit(1);
}
const log = (m: string): void => console.error(m);
const cfg = JSON.parse(
  readFileSync(values.config ?? new URL('./coverage-config.json', import.meta.url), 'utf8'),
) as CoverageConfig;
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
// 発のフレームと、撃っていないコマ

const derivedDir = join(capturesDir(), 'derived', id);
const hudPath = join(derivedDir, `${HUD_JUMPS_CACHE_KEY}.tsv`);
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
const from = values.from ? Number(values.from) : -Infinity;
const to = values.to ? Number(values.to) : Infinity;
const shots = shotFramesOf(mags, interval).filter((s) => s.frame >= from && s.frame <= to);
const cleanFrames: number[] = [];
for (let i = 0; i + 1 < mags.length; i++) {
  for (let f = mags[i]!.last + cfg.cleanAfter; f <= mags[i + 1]!.first - cfg.cleanBefore; f += cfg.cleanStep) {
    if (f >= from && f <= to) cleanFrames.push(f);
  }
}
log(
  `発: まとまり ${mags.length}・間隔 ${interval.toFixed(3)}f・発 ${shots.length}・撃っていないコマ ${cleanFrames.length}`,
);

// ---------------------------------------------------------------------------------------------------------------------
// 背景（戦場の全解像度の中央値。発の範囲を絞っても、戦闘の全体から作る）

const bg = await fieldBackground(video, mags[0]!.first, mags[mags.length - 1]!.last, Number(values['bg-step']), log);
const bgHalf = toHalfField({ data: Buffer.from(bg), w: W, h: FIELD_H }, FIELD.y0);

// ---------------------------------------------------------------------------------------------------------------------
// 1 パス: 発のずれと、撃っていないコマのマスク

const rMaxUniform = CIRCLE_PX_PER_SCALE * Math.max(...cfg.sGrid);
const rMaxNormal = 3 * CIRCLE_PX_PER_SCALE * Math.max(...cfg.sGridNormal);
const MARGIN = Math.ceil(Math.max(rMaxUniform, rMaxNormal)) + 2;
type Shot = {
  frame: number;
  magazine: number;
  drop: string;
  aim?: { x: number; y: number };
  anchorX?: number;
  y1?: number;
  bandW?: number;
};
type Clean = {
  frame: number;
  win: Window;
  anchorX: number;
  y1: number;
  bandW: number;
  aim?: { x: number; y: number };
  unknown: number;
};
/** 基準点の x（aim-lib の targetMedianX。照準の周り anchorExclude px は数えない） */
const anchorXOf = (mask: Uint8Array, aim: { x: number; y: number }): number | undefined =>
  targetMedianX(mask, aim, cfg.anchorExclude);
const shotRows: Shot[] = [];
const cleans: Clean[] = [];
const debugDir = values['debug-dir'];
const debugEvery = Number(values['debug-every']);
if (debugDir) mkdirSync(debugDir, { recursive: true });
const shotAt = new Map(shots.map((s) => [s.frame, s]));
const cleanSet = new Set(cleanFrames);
const first = Math.min(shots[0]?.frame ?? Infinity, cleanFrames[0] ?? Infinity);
const last = Math.max(shots[shots.length - 1]?.frame ?? -Infinity, cleanFrames[cleanFrames.length - 1] ?? -Infinity);
let seen = 0;
for await (const { frame, img } of readFrames(video, first, last, 1)) {
  const shot = shotAt.get(frame);
  const isClean = cleanSet.has(frame);
  if (!shot && !isClean) continue;
  seen += 1;
  if (seen % 500 === 0) log(`  ${seen} / ${shots.length + cleanFrames.length}`);
  const { aim } = findAim(img);
  const aimOk = aim && aim.conf >= 0.5 ? { x: aim.x, y: aim.y } : undefined;
  const t = findTarget(toHalfField(img, 0), bgHalf, aim && aim.conf >= 0.5 ? aim : null);
  const targetOk = t !== null && !t.clipped && t.fx < cfg.maxFx;
  if (shot) {
    const row: Shot = { frame, magazine: shot.magazine, drop: '' };
    shotRows.push(row);
    row.aim = aimOk;
    if (t) {
      row.y1 = t.y1;
      row.bandW = t.bandW;
      if (aimOk) row.anchorX = anchorXOf(t.mask, aimOk);
    }
    if (!aimOk) row.drop = 'aim';
    else if (!targetOk) row.drop = t ? (t.clipped ? 'clipped' : 'fx') : 'target';
    else if (row.anchorX === undefined) row.drop = 'anchor';
    continue;
  }
  if (!t || !targetOk || !aim || !aimOk) continue;
  const anchorX = anchorXOf(t.mask, aimOk);
  if (anchorX === undefined) continue;
  const rect = {
    x0: t.x0 - MARGIN,
    y0: t.y0 - MARGIN,
    w: t.x1 - t.x0 + 2 * MARGIN + 1,
    h: t.y1 - t.y0 + 2 * MARGIN + 1,
  };
  // 照準円（半透明の灰色の円。半径 0.285 × CDN の値）の中は、円の中の画素で色の係数を当てはめる
  const R = CIRCLE_PX_PER_SCALE * character.shot.accuracy.autoStart;
  const tint = fitTintAround(
    img,
    bg,
    (t.x0 + t.x1) / 2,
    (t.y0 + t.y1) / 2,
    (x, y) => Math.hypot(x - aimOk.x, y - aimOk.y) > R + 4,
  );
  const inside = fitTintAround(img, bg, aimOk.x, aimOk.y, (x, y) => Math.hypot(x - aimOk.x, y - aimOk.y) < R - 4);
  const disk = { x: aimOk.x, y: aimOk.y, r: R, edge: 3, tint: inside };
  const hudBox = [{ x0: aimOk.x - 112, x1: aimOk.x - 36, y0: aimOk.y - 28, y1: aimOk.y + 28 }];
  const win = classifyRect(img.data, W, bg, FIELD, tint, rect, cfg, hudBox, disk);
  maskReticle(win, aimOk, aim.type, aim.size);
  let unknown = 0;
  for (const l of win.labels) if (l === UNKNOWN) unknown += 1;
  const before = debugDir && cleans.length % debugEvery === 0 ? Int8Array.from(win.labels) : null;
  cleans.push({
    frame,
    win,
    anchorX,
    y1: t.y1,
    bandW: t.bandW,
    aim: aimOk,
    unknown: unknown / win.labels.length,
  });
  if (before) drawWindow(img, win, before, aimOk, frame);
}
log(
  `発 ${shotRows.length}（落とした ${shotRows.filter((r) => r.drop).length}）・撃っていないコマの見本 ${cleans.length} / ${cleanFrames.length}`,
);

/** 見本の窓を描く（左: 元の画、右: 的を青、不明をマゼンタ）。照準があれば sShot の照準円を黄で */
function drawWindow(
  img: Rgb,
  win: Window,
  before: Int8Array,
  aim: { x: number; y: number } | undefined,
  frame: number,
): void {
  const WW = win.w * 2;
  const out = Buffer.alloc(WW * win.h * 3);
  for (let j = 0; j < win.h; j++) {
    for (let i = 0; i < win.w; i++) {
      const x = win.x0 + i;
      const y = win.y0 + j;
      const src = x >= 0 && x < W && y >= 0 && y < H ? [0, 1, 2].map((c) => img.data[(y * W + x) * 3 + c]!) : [0, 0, 0];
      const p = j * win.w + i;
      let lab = src;
      if (win.labels[p] === TARGET) lab = [src[0]! >> 1, src[1]! >> 1, Math.min(255, (src[2]! >> 1) + 110)];
      if (before[p] === UNKNOWN)
        lab = [Math.min(255, (lab[0]! >> 1) + 110), lab[1]! >> 1, Math.min(255, (lab[2]! >> 1) + 110)];
      out.set(src, (j * WW + i) * 3);
      out.set(lab, (j * WW + win.w + i) * 3);
    }
  }
  if (aim) {
    const r = CIRCLE_PX_PER_SCALE * cfg.sShot;
    for (let k = 0; k < 360; k++) {
      const x = Math.round(aim.x - win.x0 + r * Math.cos((k * Math.PI) / 180)) + win.w;
      const y = Math.round(aim.y - win.y0 + r * Math.sin((k * Math.PI) / 180));
      if (x >= win.w && x < WW && y >= 0 && y < win.h) out.set([255, 230, 0], (y * WW + x) * 3);
    }
  }
  writeJpeg(out, WW, win.h, join(debugDir!, `clean-f${frame}.jpg`), Math.min(1600, WW));
}

// ---------------------------------------------------------------------------------------------------------------------
// 区間と着地点

const enemies = JSON.parse(readFileSync(new URL('packages/core/data/enemies.json', repo), 'utf8')) as {
  eventSets: { id: string; landings: string[] }[];
};
// 帯の並び（最初の区間を含む。C-0031 の 中近 → 近 → 遠 → 中遠 → 近 → 短い遠）
const bandsInOrder = enemies.eventSets.find((e) => e.id === 'range-3min-jump')!.landings;
const magSummary = mags.map((m, i) => {
  const r = shotRows.filter((s) => s.magazine === i && !s.drop);
  return { first: m.first, last: m.last, footY: median(r.map((s) => s.y1!)), bandW: median(r.map((s) => s.bandW!)) };
});
let cuts: number[];
if (values.sections) cuts = values.sections.split(',').map(Number);
else {
  cuts = [];
  let prev = magSummary.find((m) => Number.isFinite(m.footY));
  for (const m of magSummary) {
    if (!prev || m === prev || !Number.isFinite(m.footY)) continue;
    const dy = Math.abs(m.footY - prev.footY);
    const dw = Math.abs(m.bandW - prev.bandW) / Math.max(m.bandW, prev.bandW);
    if (dy >= cfg.sectionDy || dw >= cfg.sectionDw) cuts.push(m.first);
    prev = m;
  }
}
const sectionOfShot = (frame: number): number => cuts.filter((c) => frame >= c).length;
const sections = Array.from({ length: cuts.length + 1 }, (_, i) => {
  const ms = magSummary.filter((m) => sectionOfShot(m.first) === i);
  const band = bandsInOrder[i] ?? '?';
  return {
    index: i,
    band,
    landing: '?',
    frames: [ms[0]?.first ?? NaN, ms[ms.length - 1]?.last ?? NaN] as [number, number],
    footY: median(ms.map((m) => m.footY)),
    bandW: median(ms.map((m) => m.bandW)),
  };
});
/** 撃っていないコマの区間: 前後の区間のうち、足元の y が近い方（まとまりの間に的のジャンプがあるとき） */
function sectionOfClean(c: Clean): number {
  const s = sectionOfShot(c.frame);
  const next = sections[s + 1];
  if (next && next.frames[0] - c.frame < 400 && Math.abs(c.y1 - next.footY) < Math.abs(c.y1 - sections[s]!.footY))
    return s + 1;
  return s;
}
const cleanSection = cleans.map(sectionOfClean);
for (const s of sections) {
  // 足元の y は、撃っていないコマ（着弾の光が無い）の中央値を優先する
  const cs = cleans.filter((_, k) => cleanSection[k] === s.index);
  if (cs.length >= 3) s.footY = median(cs.map((c) => c.y1));
  s.landing = s.band === '?' ? '?' : landingOf(s.band, { footY: s.footY, bandW: s.bandW }, cfg);
}
if (sections.length !== bandsInOrder.length)
  log(`注意: 区間が ${sections.length}（帯の並びは ${bandsInOrder.length}）。--sections で切れ目を与えて確かめる`);

// ---------------------------------------------------------------------------------------------------------------------
// 組み合わせ（確率の地図）

const mean = (v: number[]): number => {
  const f = v.filter((x) => Number.isFinite(x));
  return f.length ? f.reduce((a, b) => a + b, 0) / f.length : NaN;
};
const sd = (v: number[]): number => {
  const f = v.filter((x) => Number.isFinite(x));
  if (f.length < 2) return NaN;
  const m = mean(f);
  return Math.sqrt(f.reduce((a, b) => a + (b - m) ** 2, 0) / (f.length - 1));
};
const rShot = CIRCLE_PX_PER_SCALE * cfg.sShot;
type ShotOut = Shot & {
  section: number;
  landing: string;
  d?: { x: number; y: number };
  hidden?: number;
  u: number[];
  n: number[];
};
const shotOut: ShotOut[] = shotRows.map((s) => ({ ...s, section: sectionOfShot(s.frame), landing: '', u: [], n: [] }));
const byLanding: Record<string, unknown> = {};
for (const landing of [...new Set(sections.map((s) => s.landing))]) {
  const secIdx = sections.filter((s) => s.landing === landing).map((s) => s.index);
  const footOf = (sec: number): number => sections[sec]!.footY;
  const pool = cleans
    .map((c, k) => ({ c, anchor: { x: c.anchorX, y: footOf(cleanSection[k]!) } }))
    .filter((_, k) => secIdx.includes(cleanSection[k]!));
  const rows = shotOut.filter((s) => secIdx.includes(s.section));
  for (const r of rows) r.landing = landing;
  if (pool.length === 0) {
    byLanding[landing] = { sections: secIdx, shots: rows.length, used: 0, samples: 0 };
    continue;
  }
  // 地図の範囲: 見本の窓を基準点で重ねた外枠
  let mx0 = Infinity;
  let my0 = Infinity;
  let mx1 = -Infinity;
  let my1 = -Infinity;
  for (const { c, anchor } of pool) {
    mx0 = Math.min(mx0, c.win.x0 - Math.round(anchor.x));
    my0 = Math.min(my0, c.win.y0 - Math.round(anchor.y));
    mx1 = Math.max(mx1, c.win.x0 + c.win.w - Math.round(anchor.x));
    my1 = Math.max(my1, c.win.y0 + c.win.h - Math.round(anchor.y));
  }
  const map = newMap(mx0, my0, mx1 - mx0 + 1, my1 - my0 + 1);
  for (const { c, anchor } of pool) accumulate(map, c.win, anchor);
  let nNormal = 0;
  for (const r of rows) {
    if (r.drop || !r.aim || r.anchorX === undefined) continue;
    const d = { x: r.aim.x - r.anchorX, y: r.aim.y - footOf(r.section) };
    r.d = d;
    const centerP = probAt(map, d.x, d.y);
    const hu = mapHistogram(map, d, rMaxUniform);
    r.u = coverageOf(hu, cfg.sGrid, centerP, []).uniform;
    const hs = mapHistogram(map, d, rShot);
    r.hidden = hs.hidden / hs.all.reduce((a, b) => a + b, 0);
    if (nNormal++ % cfg.normalEvery === 0)
      r.n = coverageOf(mapHistogram(map, d, rMaxNormal), [], centerP, cfg.sGridNormal).normal;
  }
  const used = rows.filter((r) => r.u.length);
  // 自己検査: 見本 j を抜いた地図で、発のずれの位置の照準円の中の、j で見えている画素の的の割合を当てる
  const probes = used.filter((_, i) => i % Math.max(1, Math.floor(used.length / 20)) === 0).map((r) => r.d!);
  const step = Math.max(1, pool.length / cfg.maxSamples);
  const checks = Array.from({ length: Math.min(cfg.maxSamples, pool.length) }, (_, i) => pool[Math.floor(i * step)]!);
  let sumTruth = 0;
  let sumPred = 0;
  let nPix = 0;
  const absDiff: number[] = [];
  for (const { c, anchor } of checks) {
    accumulate(map, c.win, anchor, -1);
    const ox = Math.round(anchor.x);
    const oy = Math.round(anchor.y);
    for (const d of probes) {
      let t = 0;
      let pr = 0;
      let n = 0;
      for (let y = Math.floor(d.y - rShot); y <= Math.ceil(d.y + rShot); y++) {
        for (let x = Math.floor(d.x - rShot); x <= Math.ceil(d.x + rShot); x++) {
          if ((x - d.x) ** 2 + (y - d.y) ** 2 > rShot * rShot) continue;
          const i = x + ox - c.win.x0;
          const j = y + oy - c.win.y0;
          if (i < 0 || i >= c.win.w || j < 0 || j >= c.win.h) continue;
          const l = c.win.labels[j * c.win.w + i];
          if (l === UNKNOWN) continue;
          n += 1;
          if (l === TARGET) t += 1;
          pr += probAt(map, x, y);
        }
      }
      if (n < 20) continue;
      sumTruth += t;
      sumPred += pr;
      nPix += n;
      absDiff.push(Math.abs(t - pr) / n);
    }
    accumulate(map, c.win, anchor, 1);
  }
  const perSection = secIdx.map((i) => used.filter((r) => r.section === i));
  byLanding[landing] = {
    sections: secIdx,
    shots: rows.length,
    used: used.length,
    dropped: Object.fromEntries(
      [...new Set(rows.map((r) => r.drop).filter(Boolean))].map((k) => [k, rows.filter((r) => r.drop === k).length]),
    ),
    samples: pool.length,
    sampleUnknownMean: mean(pool.map((x) => x.c.unknown)),
    hiddenMean: mean(used.map((r) => r.hidden!)),
    shotOffset: {
      dx: { median: median(used.map((r) => r.d!.x)), sd: sd(used.map((r) => r.d!.x)) },
      dy: { median: median(used.map((r) => r.d!.y)), sd: sd(used.map((r) => r.d!.y)) },
    },
    cleanOffset: {
      dx: {
        median: median(pool.filter((x) => x.c.aim).map((x) => x.c.aim!.x - x.anchor.x)),
        sd: sd(pool.filter((x) => x.c.aim).map((x) => x.c.aim!.x - x.anchor.x)),
      },
      dy: {
        median: median(pool.filter((x) => x.c.aim).map((x) => x.c.aim!.y - x.anchor.y)),
        sd: sd(pool.filter((x) => x.c.aim).map((x) => x.c.aim!.y - x.anchor.y)),
      },
    },
    uniform: cfg.sGrid.map((_, i) => mean(used.map((r) => r.u[i]!))),
    normal: cfg.sGridNormal.map((_, i) => mean(used.filter((r) => r.n.length).map((r) => r.n[i]!))),
    normalShots: used.filter((r) => r.n.length).length,
    sectionSd: cfg.sGrid.map((_, i) => sd(perSection.filter((p) => p.length).map((p) => mean(p.map((r) => r.u[i]!))))),
    selfCheck: {
      samples: checks.length,
      probes: probes.length,
      pixels: nPix,
      truth: nPix ? sumTruth / nPix : NaN,
      predicted: nPix ? sumPred / nPix : NaN,
      meanAbsDiff: mean(absDiff),
    },
  };
  if (debugDir)
    drawMap(
      map,
      used.map((r) => r.d!),
      landing,
    );
}

/** 確率の地図（白 = 的の確率 1）と、発のずれの位置（赤）と、その中央値の sShot の照準円（黄） */
function drawMap(map: ProbMap, ds: { x: number; y: number }[], landing: string): void {
  const out = Buffer.alloc(map.w * map.h * 3);
  for (let q = 0; q < map.w * map.h; q++) {
    const v = map.vis[q]! > 0 ? Math.round((255 * map.tgt[q]!) / map.vis[q]!) : 0;
    out.set(map.vis[q]! > 0 ? [v, v, v] : [0, 0, 80], q * 3);
  }
  for (const d of ds) {
    const x = Math.round(d.x) - map.x0;
    const y = Math.round(d.y) - map.y0;
    if (x >= 0 && x < map.w && y >= 0 && y < map.h) out.set([255, 0, 0], (y * map.w + x) * 3);
  }
  const cx = median(ds.map((d) => d.x)) - map.x0;
  const cy = median(ds.map((d) => d.y)) - map.y0;
  for (let k = 0; k < 360; k++) {
    const x = Math.round(cx + rShot * Math.cos((k * Math.PI) / 180));
    const y = Math.round(cy + rShot * Math.sin((k * Math.PI) / 180));
    if (x >= 0 && x < map.w && y >= 0 && y < map.h) out.set([255, 230, 0], (y * map.w + x) * 3);
  }
  writeJpeg(out, map.w, map.h, join(debugDir!, `map-${landing}.jpg`), map.w);
}

// ---------------------------------------------------------------------------------------------------------------------
// 出力

const key = `coverage@${cfg.version}`;
mkdirSync(derivedDir, { recursive: true });
const f2 = (v: number | undefined, d = 1): string => (v === undefined || !Number.isFinite(v) ? '' : v.toFixed(d));
const tsv = [
  [
    'frame',
    'magazine',
    'section',
    'landing',
    'aim_x',
    'aim_y',
    'anchor_x',
    'y1',
    'dx',
    'dy',
    'hidden',
    'drop',
    ...cfg.sGrid.map((s) => `u${s}`),
    ...cfg.sGridNormal.map((s) => `n${s}`),
  ].join('\t'),
  ...shotOut.map((r) =>
    [
      r.frame,
      r.magazine,
      r.section,
      r.landing,
      f2(r.aim?.x),
      f2(r.aim?.y),
      f2(r.anchorX),
      f2(r.y1, 0),
      f2(r.d?.x),
      f2(r.d?.y),
      f2(r.hidden, 3),
      r.drop,
      ...cfg.sGrid.map((_, i) => f2(r.u[i], 4)),
      ...cfg.sGridNormal.map((_, i) => f2(r.n[i], 4)),
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
  range: { from: Number.isFinite(from) ? from : null, to: Number.isFinite(to) ? to : null },
  shotInterval: interval,
  sections,
  landings: byLanding,
};
writeFileSync(join(derivedDir, `${key}.summary.json`), `${JSON.stringify(summary, null, 2)}\n`);
log(`書いた: ${join(derivedDir, `${key}.shots.tsv`)}・${key}.summary.json`);
for (const s of sections)
  log(
    `  区間 ${s.index}: ${s.band} → ${s.landing}（f${s.frames[0]}〜${s.frames[1]}・足元 ${f2(s.footY)}・幅 ${f2(s.bandW)}）`,
  );
const ki = cfg.sGrid.indexOf(cfg.sShot);
const kn = cfg.sGridNormal.indexOf(cfg.sShot);
type LandingOut = {
  used: number;
  samples: number;
  uniform: number[];
  normal: number[];
  hiddenMean: number;
  selfCheck: { truth: number; predicted: number; meanAbsDiff: number };
};
for (const [landing, v] of Object.entries(byLanding) as [string, LandingOut][])
  log(
    `  ${landing}: 発 ${v.used}・見本 ${v.samples}・h(${cfg.sShot}) 一様 ${f2(v.uniform?.[ki], 3)}・正規 ${f2(v.normal?.[kn], 3)}` +
      `・見えない ${f2(v.hiddenMean, 3)}・自己検査 本当 ${f2(v.selfCheck?.truth, 3)} 地図 ${f2(v.selfCheck?.predicted, 3)}`,
  );
