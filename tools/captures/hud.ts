// 画面上部中央の HUD の総ダメージ（例: 79,851,043）を全フレーム読み、値の列・増分・最終値を出す（Stage 19-D。
// plan/design-stage19.md 2.7 節）。Stage 11 モダニア・17・18 で使い捨てのスクリプトで読んでいた読み方をツールにしたもの。
//   node tools/captures/hud.ts <動画> [--mode final|jumps|series] [--from N] [--to N] [--crop 810,34,300,38]
//   node tools/captures/hud.ts <動画> --make-templates 6000:39174344,11400:79851043,...   # テンプレートを作り直す
//
// 表示は白（FB 中などは薄い赤）の斜体の数字で、カンマ区切り・中央揃え。min(R,G,B) を 2 値にして連結成分に分け、
// 高さの揃った成分を数字、低くて下に寄った成分をカンマとして左から並べ、数字は見本（hud-templates.json）と
// 正規化相互相関で照合する。カンマの位置が 3 桁区切りにならない読みは捨てる。
// 総ダメージは減らないので、読めた値の列から最長の非減少列を残し、そこから外れた読み（1 桁の誤読・先頭の桁の欠け）を落とす。
//
// mode:
//   final   最後に残った値（単騎なら戦闘履歴の与ダメージと同じになる）
//   jumps   値が増えたフレームと増分（単騎で 1 フレームに 1 ヒットなら、増分がそのまま 1 ヒットの値）
//   series  読めたフレームごとの値（落とした読みには「x」を付ける）
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { cropFilter, parseCrop, rawFrames, type Crop } from './ffmpeg.ts';

const TEMPLATE_FILE = new URL('./hud-templates.json', import.meta.url);
/** 数字とみなす明るさ（min(R,G,B)） */
const THRESHOLD = 150;
/** 照合に使う大きさ（正規化した数字の画像） */
const NORM_W = 10;
const NORM_H = 16;
/** これより照合が悪い数字を含む読みは捨てる */
const MIN_SCORE = 0.6;

type Templates = { crop: Crop; digitHeight: number; digits: Record<string, number[]> };

type Component = { minX: number; maxX: number; minY: number; maxY: number; pixels: [number, number][] };

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    crop: { type: 'string', default: '810,34,300,38' },
    mode: { type: 'string', default: 'final' },
    from: { type: 'string', default: '0' },
    to: { type: 'string' },
    'make-templates': { type: 'string' },
  },
});

const video = positionals[0];
if (!video) {
  console.error(
    'usage: node tools/captures/hud.ts <動画> [--mode final|jumps|series] [--from N] [--to N] [--crop x,y,w,h]\n' +
      '       node tools/captures/hud.ts <動画> --make-templates frame:value,... [--crop x,y,w,h]',
  );
  process.exit(1);
}
const crop = parseCrop(values.crop);

function binarize(rgb: Buffer, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = Math.min(rgb[i * 3]!, rgb[i * 3 + 1]!, rgb[i * 3 + 2]!) > THRESHOLD ? 1 : 0;
  return out;
}

function components(bin: Uint8Array, w: number, h: number): Component[] {
  const seen = new Uint8Array(w * h);
  const out: Component[] = [];
  for (let start = 0; start < w * h; start++) {
    if (!bin[start] || seen[start]) continue;
    const c: Component = { minX: w, maxX: -1, minY: h, maxY: -1, pixels: [] };
    const stack = [start];
    seen[start] = 1;
    while (stack.length > 0) {
      const i = stack.pop()!;
      const x = i % w;
      const y = (i - x) / w;
      c.pixels.push([x, y]);
      c.minX = Math.min(c.minX, x);
      c.maxX = Math.max(c.maxX, x);
      c.minY = Math.min(c.minY, y);
      c.maxY = Math.max(c.maxY, y);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (bin[j] && !seen[j]) {
            seen[j] = 1;
            stack.push(j);
          }
        }
      }
    }
    out.push(c);
  }
  return out;
}

/** 成分を NORM_W × NORM_H に面積平均で縮めた 0..1 の列 */
function normalize(c: Component): number[] {
  const w = c.maxX - c.minX + 1;
  const h = c.maxY - c.minY + 1;
  const grid = new Float64Array(NORM_W * NORM_H);
  const count = new Float64Array(NORM_W * NORM_H);
  const on = new Set(c.pixels.map(([x, y]) => y * 10000 + x));
  for (let y = c.minY; y <= c.maxY; y++) {
    for (let x = c.minX; x <= c.maxX; x++) {
      const gx = Math.min(NORM_W - 1, Math.floor(((x - c.minX) * NORM_W) / w));
      const gy = Math.min(NORM_H - 1, Math.floor(((y - c.minY) * NORM_H) / h));
      grid[gy * NORM_W + gx]! += on.has(y * 10000 + x) ? 1 : 0;
      count[gy * NORM_W + gx]! += 1;
    }
  }
  return Array.from(grid, (v, i) => (count[i]! > 0 ? v / count[i]! : 0));
}

function ncc(a: readonly number[], b: readonly number[]): number {
  const n = a.length;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i]!;
    mb += b[i]!;
  }
  ma /= n;
  mb /= n;
  let s = 0;
  let sa = 0;
  let sb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i]! - ma;
    const db = b[i]! - mb;
    s += da * db;
    sa += da * da;
    sb += db * db;
  }
  return sa > 0 && sb > 0 ? s / Math.sqrt(sa * sb) : 0;
}

type Glyph = { kind: 'digit'; c: Component } | { kind: 'comma'; c: Component };

/**
 * 数字の並び（左から）。digitHeight が分かっていれば高さで数字とカンマを分け、互いに近い塊のうち最も長いものを取る。
 * 分からない（テンプレート作成中）なら、いちばん多い高さを数字の高さとみなす
 */
function glyphs(cs: Component[], digitHeight: number | null): Glyph[] {
  const heights = cs.map((c) => c.maxY - c.minY + 1);
  let dh = digitHeight;
  if (dh === null) {
    const tall = heights.filter((h) => h >= 10);
    if (tall.length === 0) return [];
    const mode = new Map<number, number>();
    for (const h of tall) mode.set(h, (mode.get(h) ?? 0) + 1);
    dh = [...mode.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]![0];
  }
  const out: Glyph[] = [];
  for (const c of cs) {
    const h = c.maxY - c.minY + 1;
    const w = c.maxX - c.minX + 1;
    if (h >= dh * 0.8 && h <= dh * 1.2 && w <= dh) out.push({ kind: 'digit', c });
    else if (h >= 2 && h <= dh * 0.5 && w <= dh * 0.5 && c.pixels.length >= 3) out.push({ kind: 'comma', c });
  }
  out.sort((a, b) => a.c.minX + a.c.maxX - (b.c.minX + b.c.maxX));
  // 互いに近い（間が数字の高さより狭い）塊ごとに分け、数字の多いものを取る
  const groups: Glyph[][] = [];
  for (const g of out) {
    const last = groups.at(-1);
    if (last && g.c.minX - last.at(-1)!.c.maxX <= dh) last.push(g);
    else groups.push([g]);
  }
  const digitsIn = (gs: Glyph[]) => gs.filter((g) => g.kind === 'digit').length;
  return groups.sort((a, b) => digitsIn(b) - digitsIn(a))[0] ?? [];
}

/** 数字の並びを読む。カンマの位置が 3 桁区切りでない・照合の悪い数字がある読みは null */
function readValue(gs: Glyph[], templates: Templates): number | null {
  const firstDigit = gs.find((g) => g.kind === 'digit');
  if (firstDigit === undefined) return null;
  let text = '';
  for (const g of gs) {
    if (g.kind === 'comma') {
      // カンマは数字の下半分にある
      if (g.c.minY < firstDigit.c.minY + templates.digitHeight * 0.5) return null;
      text += ',';
      continue;
    }
    const v = normalize(g.c);
    let best = '';
    let bestScore = -1;
    for (const [digit, t] of Object.entries(templates.digits)) {
      const s = ncc(v, t);
      if (s > bestScore) {
        bestScore = s;
        best = digit;
      }
    }
    if (bestScore < MIN_SCORE) return null;
    text += best;
  }
  if (!/^\d{1,3}(,\d{3})*$/.test(text)) return null;
  return Number(text.replace(/,/g, ''));
}

async function* frames(first: number, last: number | undefined): AsyncGenerator<{ n: number; bin: Uint8Array }> {
  const select = last === undefined ? `gte(n\\,${first})` : `between(n\\,${first}\\,${last})`;
  const args = ['-v', 'error', '-i', video!, '-vf', `select='${select}',${cropFilter(crop)}`];
  args.push('-fps_mode', 'passthrough');
  if (last !== undefined) args.push('-frames:v', String(last - first + 1));
  args.push('-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1');
  let n = first;
  for await (const rgb of rawFrames(args, crop.w * crop.h * 3)) {
    yield { n, bin: binarize(rgb, crop.w, crop.h) };
    n++;
  }
}

async function makeTemplates(spec: string): Promise<void> {
  const samples = spec.split(',').map((s) => {
    const [frame, value] = s.split(':').map((v) => Number(v.trim()));
    return { frame: frame!, value: value! };
  });
  const sums: Record<string, number[]> = {};
  const counts: Record<string, number> = {};
  const heights: number[] = [];
  for (const { frame, value } of samples) {
    let done = false;
    for await (const { bin } of frames(frame, frame)) {
      const gs = glyphs(components(bin, crop.w, crop.h), null).filter((g) => g.kind === 'digit');
      const digits = String(value);
      if (gs.length !== digits.length) {
        throw new Error(`frame ${frame}: 数字の塊が ${gs.length} 個（${value} は ${digits.length} 桁）`);
      }
      gs.forEach((g, i) => {
        const d = digits[i]!;
        const v = normalize(g.c);
        sums[d] = sums[d]?.map((x, k) => x + v[k]!) ?? v;
        counts[d] = (counts[d] ?? 0) + 1;
        heights.push(g.c.maxY - g.c.minY + 1);
      });
      done = true;
    }
    if (!done) throw new Error(`frame ${frame} が読めない`);
  }
  const missing = [...'0123456789'].filter((d) => counts[d] === undefined);
  if (missing.length > 0) throw new Error(`見本に無い数字: ${missing.join(' ')}`);
  heights.sort((a, b) => a - b);
  const templates: Templates = {
    crop,
    digitHeight: heights[Math.floor(heights.length / 2)]!,
    digits: Object.fromEntries(
      Object.entries(sums).map(([d, s]) => [d, s.map((x) => Math.round((x / counts[d]!) * 1000) / 1000)]),
    ),
  };
  writeFileSync(TEMPLATE_FILE, `${JSON.stringify(templates)}\n`);
  console.log(
    `hud-templates.json: 数字 10 種（${samples.length} フレームから）、数字の高さ ${templates.digitHeight}px`,
  );
}

/** 最長の非減少列（読めた値の添字）。同じ長さなら後ろを優先 */
function longestNonDecreasing(values: readonly number[]): Set<number> {
  const tails: number[] = [];
  const prev = new Array<number>(values.length).fill(-1);
  for (let i = 0; i < values.length; i++) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (values[tails[mid]!]! <= values[i]!) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) prev[i] = tails[lo - 1]!;
    tails[lo] = i;
  }
  const keep = new Set<number>();
  for (let i = tails.at(-1) ?? -1; i >= 0; i = prev[i]!) keep.add(i);
  return keep;
}

async function main(): Promise<void> {
  if (values['make-templates'] !== undefined) {
    await makeTemplates(values['make-templates']);
    return;
  }
  const templates = JSON.parse(readFileSync(TEMPLATE_FILE, 'utf8')) as Templates;
  const reads: { n: number; value: number }[] = [];
  let total = 0;
  for await (const { n, bin } of frames(Number(values.from), values.to === undefined ? undefined : Number(values.to))) {
    total++;
    const value = readValue(glyphs(components(bin, crop.w, crop.h), templates.digitHeight), templates);
    if (value !== null) reads.push({ n, value });
  }
  const keep = longestNonDecreasing(reads.map((r) => r.value));
  const kept = reads.filter((_, i) => keep.has(i));
  console.error(
    `${total} フレーム中 ${reads.length} フレームを読み、${reads.length - kept.length} フレームの読みを落とした`,
  );
  if (values.mode === 'series') {
    reads.forEach((r, i) => console.log(`${r.n}\t${r.value}${keep.has(i) ? '' : '\tx'}`));
  } else if (values.mode === 'jumps') {
    console.log('frame\tvalue\tincrement\tgap');
    for (let i = 1; i < kept.length; i++) {
      const d = kept[i]!.value - kept[i - 1]!.value;
      if (d > 0) console.log(`${kept[i]!.n}\t${kept[i]!.value}\t${d}\t${kept[i]!.n - kept[i - 1]!.n}`);
    }
  } else {
    const last = kept.at(-1);
    console.log(last === undefined ? '読めなかった' : `${last.value}\t(frame ${last.n})`);
  }
}

await main();
