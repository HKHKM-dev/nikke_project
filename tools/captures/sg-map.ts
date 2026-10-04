// SG の当たりの点（白）だけで、射撃場の的の当たる確率の地図を作り、SG の当たった数と SMG の遠の当たる割合を当てる（V-0129）。
//   node tools/captures/sg-map.ts <SG の録画 id> [--smg 152] [--smg-landing far] [--sg-section 遠] [--image DIR]
//
// - 入力: sg-dots.ts の derived/<id>/sg-dots@<版>.tsv（点）と .shots.tsv（発ごとの照準・基準点）、
//   coverage.ts の derived/<SMG の id>/coverage@<版>.shots.tsv（SMG の発の照準のずれ）。
// - 地図の作り方と判定は V-0129 の「予測」に固定したもの:
//   1 発ごとに、照準の中心から半径 0.285 × 250 の円にペレット 10 個が一様に散るとして、見込みの数の密度 10 ÷ (πR²) を、
//   点を探した画素（sg-dots-lib の searchable）に置き、読めた当たりの点を 1 個ずつ置く。どちらも基準点（x は targetMedianX、
//   y は区間の足元）からの座標で、区間ごとに足す。当たりと見込みを標準偏差 6px のガウスでぼかした比を P とし、ぼかした見込みの
//   数がぼかしの広がり（2π × σ²）の中で 2 個に満たない所は σ を 12px、24px に広げる。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { FIELD, W, writeJpeg, type Aim } from './aim-lib.ts';
import { CIRCLE_PX_PER_SCALE, median, type CoverageConfig } from './coverage-lib.ts';
import { capturesDir } from './dirs.ts';
import { exclusionOf, searchable } from './sg-dots-lib.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    smg: { type: 'string' },
    'smg-landing': { type: 'string', default: 'far' },
    'sg-section': { type: 'string', default: '遠' },
    image: { type: 'string' },
  },
});
const id = positionals[0];
if (!id) {
  console.error('usage: node tools/captures/sg-map.ts <SG の録画 id> [--smg 152] [--image DIR]');
  process.exit(1);
}
const log = (m: string): void => console.error(m);
const cfg = JSON.parse(readFileSync(new URL('./coverage-config.json', import.meta.url), 'utf8')) as CoverageConfig;
/** SG の照準円の半径（CDN の 250。C-0038） */
const R_SG = CIRCLE_PX_PER_SCALE * 250;
/** リター（SMG）の照準円の半径（CDN の 110） */
const R_SMG = CIRCLE_PX_PER_SCALE * 110;
const PELLETS = 10;
const SIGMAS = [6, 12, 24];
const MIN_EXPECTED = 2;

function readTsv(path: string): Record<string, string>[] {
  const [head, ...lines] = readFileSync(path, 'utf8').trim().split(/\r?\n/);
  const keys = head!.split('\t');
  return lines.map((l) => Object.fromEntries(l.split('\t').map((v, i) => [keys[i]!, v])));
}

const dir = join(capturesDir(), 'derived', id);
const key = `sg-dots@${cfg.version}`;
const shots = readTsv(join(dir, `${key}.shots.tsv`)).map((r) => ({
  section: r.section!,
  trigger: Number(r.trigger),
  hits: Number(r.hits),
  upper: r.upper === '1',
  aim: { x: Number(r.aim_x), y: Number(r.aim_y), type: r.aim_type as Aim['type'], size: Number(r.aim_size) },
  anchorX: Number(r.anchor_x),
  y1: Number(r.y1),
  fx: Number(r.fx),
  clipped: r.clipped === '1',
}));
const dots = readTsv(join(dir, `${key}.tsv`))
  .filter((r) => r.kind === 'hit')
  .map((r) => ({ trigger: Number(r.trigger), x: Number(r.x), y: Number(r.y) }));

/** 基準点からの座標の格子（1px） */
type Grid = { x0: number; y0: number; w: number; h: number; v: Float64Array };
const newGrid = (x0: number, y0: number, w: number, h: number): Grid => ({ x0, y0, w, h, v: new Float64Array(w * h) });

/** 分離できるガウスのぼかし（端の外は 0） */
function blur(g: Grid, sigma: number): Grid {
  const r = Math.ceil(3 * sigma);
  const k = Array.from({ length: 2 * r + 1 }, (_, i) => Math.exp(-((i - r) ** 2) / (2 * sigma * sigma)));
  const sum = k.reduce((a, b) => a + b, 0);
  for (let i = 0; i < k.length; i++) k[i] = k[i]! / sum;
  const tmp = new Float64Array(g.w * g.h);
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      let s = 0;
      for (let d = -r; d <= r; d++) {
        const xx = x + d;
        if (xx >= 0 && xx < g.w) s += g.v[y * g.w + xx]! * k[d + r]!;
      }
      tmp[y * g.w + x] = s;
    }
  const out = newGrid(g.x0, g.y0, g.w, g.h);
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      let s = 0;
      for (let d = -r; d <= r; d++) {
        const yy = y + d;
        if (yy >= 0 && yy < g.h) s += tmp[yy * g.w + x]! * k[d + r]!;
      }
      out.v[y * g.w + x] = s;
    }
  return out;
}

type HitMap = { p: Grid; used: number; hitsIn: number; hitsOut: number; sigmaUsed: number[]; foot: number };

/** 区間の発から地図を作る */
function buildMap(section: string): HitMap | null {
  const rows = shots.filter(
    (s) =>
      s.section === section &&
      Number.isFinite(s.aim.x) &&
      Number.isFinite(s.anchorX) &&
      Number.isFinite(s.y1) &&
      !s.clipped &&
      s.fx < cfg.maxFx,
  );
  if (rows.length === 0) return null;
  const foot = median(rows.map((s) => s.y1));
  const pad = Math.ceil(R_SG) + 3 * SIGMAS[SIGMAS.length - 1]! + 20;
  const dxs = rows.map((s) => Math.round(s.aim.x) - Math.round(s.anchorX));
  const dys = rows.map((s) => Math.round(s.aim.y) - Math.round(foot));
  const x0 = Math.min(...dxs) - pad;
  const y0 = Math.min(...dys) - pad;
  const hits = newGrid(x0, y0, Math.max(...dxs) + pad - x0 + 1, Math.max(...dys) + pad - y0 + 1);
  const expected = newGrid(hits.x0, hits.y0, hits.w, hits.h);
  const density = PELLETS / (Math.PI * R_SG * R_SG);
  let hitsIn = 0;
  let hitsOut = 0;
  for (const s of rows) {
    const ax = Math.round(s.anchorX);
    const ay = Math.round(foot);
    const excl = exclusionOf({ ...s.aim, conf: 1 } as Aim);
    const cx = Math.round(s.aim.x);
    const cy = Math.round(s.aim.y);
    const r = Math.ceil(R_SG);
    for (let y = cy - r; y <= cy + r; y++)
      for (let x = cx - r; x <= cx + r; x++) {
        if ((x - s.aim.x) ** 2 + (y - s.aim.y) ** 2 > R_SG * R_SG) continue;
        if (x < 0 || x >= W || y < FIELD.y0 || y >= FIELD.y1 || !searchable(excl, s.aim, x, y)) continue;
        const gx = x - ax - expected.x0;
        const gy = y - ay - expected.y0;
        expected.v[gy * expected.w + gx] = expected.v[gy * expected.w + gx]! + density;
      }
    for (const d of dots.filter((d) => d.trigger === s.trigger)) {
      if (Math.hypot(d.x - s.aim.x, d.y - s.aim.y) <= R_SG) hitsIn += 1;
      else hitsOut += 1;
      const gx = Math.round(d.x) - ax - hits.x0;
      const gy = Math.round(d.y) - ay - hits.y0;
      if (gx >= 0 && gx < hits.w && gy >= 0 && gy < hits.h) hits.v[gy * hits.w + gx] = hits.v[gy * hits.w + gx]! + 1;
    }
  }
  const p = newGrid(hits.x0, hits.y0, hits.w, hits.h).v.fill(NaN);
  const sigmaUsed = SIGMAS.map(() => 0);
  const blurred = SIGMAS.map((sg) => ({ sg, h: blur(hits, sg), e: blur(expected, sg) }));
  for (let i = 0; i < p.length; i++) {
    for (let k = 0; k < blurred.length; k++) {
      const { sg, h, e } = blurred[k]!;
      if (e.v[i]! * 2 * Math.PI * sg * sg >= MIN_EXPECTED || (k === blurred.length - 1 && e.v[i]! > 0)) {
        p[i] = h.v[i]! / e.v[i]!;
        sigmaUsed[k] = sigmaUsed[k]! + 1;
        break;
      }
    }
  }
  return { p: { ...hits, v: p }, used: rows.length, hitsIn, hitsOut, sigmaUsed, foot };
}

/** 地図の、基準点からの円（中心 c・半径 r）の中の P の平均と、P が無い画素の割合 */
function circleMean(map: Grid, c: { x: number; y: number }, r: number): { mean: number; missing: number } {
  let s = 0;
  let n = 0;
  let all = 0;
  for (let y = Math.floor(c.y - r); y <= Math.ceil(c.y + r); y++)
    for (let x = Math.floor(c.x - r); x <= Math.ceil(c.x + r); x++) {
      if ((x - c.x) ** 2 + (y - c.y) ** 2 > r * r) continue;
      all += 1;
      const gx = x - map.x0;
      const gy = y - map.y0;
      const v = gx >= 0 && gx < map.w && gy >= 0 && gy < map.h ? map.v[gy * map.w + gx]! : NaN;
      if (!Number.isFinite(v)) continue;
      s += v;
      n += 1;
    }
  return { mean: n ? s / n : NaN, missing: all ? 1 - n / all : 1 };
}

/** 地図を画像にする（P 0 = 黒・1 = 白、P が無い所は暗い青、1 を超える所は赤） */
function drawMap(map: Grid, out: string): void {
  const buf = Buffer.alloc(map.w * map.h * 3);
  for (let i = 0; i < map.w * map.h; i++) {
    const v = map.v[i]!;
    const c = !Number.isFinite(v)
      ? [20, 20, 60]
      : v > 1
        ? [255, Math.max(0, 255 - Math.round((v - 1) * 255)), 0]
        : [Math.round(v * 255), Math.round(v * 255), Math.round(v * 255)];
    buf.set(c, i * 3);
  }
  writeJpeg(buf, map.w, map.h, out, map.w * 3);
}

// 判定 1: 区間ごとの SG の当たった数
const sections = [...new Set(shots.map((s) => s.section))];
const maps = new Map<string, HitMap>();
for (const section of sections) {
  const m = buildMap(section);
  if (!m) continue;
  maps.set(section, m);
  const rows = shots.filter(
    (s) =>
      s.section === section &&
      Number.isFinite(s.aim.x) &&
      Number.isFinite(s.anchorX) &&
      Number.isFinite(s.y1) &&
      !s.clipped &&
      s.fx < cfg.maxFx,
  );
  let pred = 0;
  const missing: number[] = [];
  for (const s of rows) {
    const c = circleMean(m.p, { x: s.aim.x - s.anchorX, y: s.aim.y - m.foot }, R_SG);
    pred += PELLETS * c.mean;
    missing.push(c.missing);
  }
  const hud = rows.reduce((a, s) => a + s.hits, 0);
  const finite = [...m.p.v].filter((v) => Number.isFinite(v));
  log(
    `${section}: 発 ${rows.length} / ${shots.filter((s) => s.section === section).length}・足元 ${m.foot}` +
      `・予測の当たった数 ${pred.toFixed(1)}・HUD ${hud}${rows.some((s) => s.upper) ? '（上限）' : ''}・比 ${(pred / hud).toFixed(3)}` +
      `・当たりの点 円の中 ${m.hitsIn}・外 ${m.hitsOut}・P の最大 ${finite.reduce((a, b) => Math.max(a, b), 0).toFixed(2)}` +
      `・ぼかし 6/12/24px の画素 ${m.sigmaUsed.join('/')}・P の無い画素の割合（発の平均）${(missing.reduce((a, b) => a + b, 0) / missing.length).toFixed(3)}`,
  );
  if (values.image) drawMap(m.p, join(values.image, `sg-map-${id}-${section.replace(/ /g, '')}.jpg`));
}

// 判定 2: SMG の遠の当たる割合
if (values.smg) {
  const m = maps.get(values['sg-section']);
  if (!m) throw new Error(`SG の区間 ${values['sg-section']} の地図が無い`);
  const smg = readTsv(join(capturesDir(), 'derived', values.smg, `coverage@${cfg.version}.shots.tsv`)).filter(
    (r) => r.landing === values['smg-landing'] && !r.drop && r.dx !== '' && r.dy !== '',
  );
  const per = smg.map((r) => circleMean(m.p, { x: Number(r.dx), y: Number(r.dy) }, R_SMG));
  const ok = per.filter((c) => Number.isFinite(c.mean));
  const mean = ok.reduce((a, c) => a + c.mean, 0) / ok.length;
  const meanCapped = ok.reduce((a, c) => a + Math.min(1, c.mean), 0) / ok.length;
  log(
    `SMG ${values.smg} の ${values['smg-landing']}: 発 ${ok.length} / ${smg.length}・予測の当たる割合 ${mean.toFixed(3)}` +
      `（1 で頭打ちにすると ${meanCapped.toFixed(3)}）・P の無い画素の割合（発の平均）${(ok.reduce((a, c) => a + c.missing, 0) / ok.length).toFixed(3)}`,
  );
}
