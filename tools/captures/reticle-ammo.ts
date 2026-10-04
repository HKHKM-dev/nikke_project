// 操作キャラの照準の左に出る残弾の表示（暗い四角に 3 桁の数字。000 埋め）を全フレーム読み、マガジンごとの発数と弾丸チャージを出す
// （ルドミラ：ウィンターオーナー編。plan/design-ludmilla-wo.md 3 節、backlog 6 節）。枠アイコンの上の「残弾/最大」は
// tools/captures/ammo.ts。単騎の操作キャラはそちらの表示が出ないので、こちらを読む。
//   node tools/captures/reticle-ammo.ts <動画> [--mode mags|series] [--from N] [--to N] [--max 300]
//   node tools/captures/reticle-ammo.ts <動画> --make-templates 1081:169,1082:168,...   # 見本を作り直す
//
// 表示は照準と一緒に動く（的を追う AUTO 射撃では 1 フレームごとに数 px）。そこで画面の中央付近（SEARCH）で、明るい（max(R,G,B)
// が THRESHOLD より大きい）連結成分のうち数字の高さのものを探し、横に等間隔に 3 つ並んだ組を表示の 3 桁とする。残弾が少ないと
// 四角と数字が赤くなる（録画 099 では 130 から）ので、明るさは max(R,G,B) で見る。各桁は成分の中心を中心にした
// 一定の幅の枠を NORM_W × NORM_H に縮め、見本（reticle-ammo-templates.json）と正規化相互相関で照合する。
// ダメージの数字が重なったフレームは組が見つからないか、照合が悪いので読まない（MIN_SCORE）。
//
// mode:
//   series  読めたフレームごとの値と照合のスコア（読めないフレームは出さない）
//   mags    マガジンごとに、最大（max）の表示が出たフレーム・0 になったフレーム・その間の「減った量の合計」と「増えた量の合計」
//           （弾丸チャージ。STEP_UP 以上の増え）・増えたフレームと量。発数 = 減った量の合計（間のフレームが読めずに
//           増えと減りが打ち消し合うと過小になるので、増えの回数と合わせて見る）
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { rawFrames } from './ffmpeg.ts';

const TEMPLATE_FILE = new URL('./reticle-ammo-templates.json', import.meta.url);
/** 探す範囲（1920×1080）。照準は的を追うので広めに取る */
const SEARCH = { x: 700, y: 300, w: 600, h: 350 };
/** 数字とみなす明るさ（max(R,G,B)） */
const THRESHOLD = 200;
/** 数字の連結成分の大きさ（録画 099 で高さ 18〜20px・幅 4〜12px） */
const DIGIT_H = { min: 17, max: 22 };
const DIGIT_W = { min: 3, max: 14 };
/** 桁の中心の間隔（録画 099 で 13〜15px）と、桁の上端のずれの許し */
const PITCH = { min: 12, max: 17 };
const TOP_SLACK = 2;
/** 照合の枠（桁の中心から左右 CELL_HALF px、上端から CELL_H px）と、縮めた大きさ */
const CELL_HALF = 7;
const CELL_H = 20;
const NORM_W = 10;
const NORM_H = 16;
/** これより照合が悪い桁を含む読みは捨てる */
const MIN_SCORE = 0.7;
/** 弾丸チャージとみなす増え（1 フレームの間で） */
const STEP_UP = 5;

type Templates = { search: typeof SEARCH; digits: Record<string, number[]> };
type Comp = { x0: number; x1: number; y0: number; y1: number };
export type Reading = { frame: number; value: number; score: number; x: number; y: number };

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    mode: { type: 'string', default: 'mags' },
    from: { type: 'string', default: '0' },
    to: { type: 'string' },
    max: { type: 'string', default: '300' },
    'make-templates': { type: 'string' },
  },
});

const video = positionals[0];
if (!video) {
  console.error(
    'usage: node tools/captures/reticle-ammo.ts <動画> [--mode mags|series] [--from N] [--to N] [--max 300]\n' +
      '       node tools/captures/reticle-ammo.ts <動画> --make-templates frame:value,...',
  );
  process.exit(1);
}
const max = Number(values.max);

/** 明るい画素の連結成分のうち、数字の大きさのもの（左から） */
function digitComponents(bright: Uint8Array): Comp[] {
  const { w, h } = SEARCH;
  const seen = new Uint8Array(w * h);
  const comps: Comp[] = [];
  const stack: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (!bright[i] || seen[i]) continue;
    seen[i] = 1;
    stack.push(i);
    const c = { x0: w, x1: -1, y0: h, y1: -1 };
    while (stack.length > 0) {
      const j = stack.pop()!;
      const x = j % w;
      const y = (j - x) / w;
      if (x < c.x0) c.x0 = x;
      if (x > c.x1) c.x1 = x;
      if (y < c.y0) c.y0 = y;
      if (y > c.y1) c.y1 = y;
      if (x + 1 < w && bright[j + 1] && !seen[j + 1]) ((seen[j + 1] = 1), stack.push(j + 1));
      if (x > 0 && bright[j - 1] && !seen[j - 1]) ((seen[j - 1] = 1), stack.push(j - 1));
      if (y + 1 < h && bright[j + w] && !seen[j + w]) ((seen[j + w] = 1), stack.push(j + w));
      if (y > 0 && bright[j - w] && !seen[j - w]) ((seen[j - w] = 1), stack.push(j - w));
    }
    const ch = c.y1 - c.y0 + 1;
    const cw = c.x1 - c.x0 + 1;
    if (ch >= DIGIT_H.min && ch <= DIGIT_H.max && cw >= DIGIT_W.min && cw <= DIGIT_W.max) comps.push(c);
  }
  return comps.sort((a, b) => a.x0 - b.x0);
}

const center = (c: Comp) => (c.x0 + c.x1) / 2;

/** 横に等間隔に並んだ 3 つの成分（表示の 3 桁）。無ければ null */
function findTriplet(comps: Comp[]): Comp[] | null {
  for (let i = 0; i < comps.length; i++) {
    for (let j = i + 1; j < comps.length; j++) {
      const p1 = center(comps[j]!) - center(comps[i]!);
      if (p1 < PITCH.min || p1 > PITCH.max || Math.abs(comps[j]!.y0 - comps[i]!.y0) > TOP_SLACK) continue;
      for (let k = j + 1; k < comps.length; k++) {
        const p2 = center(comps[k]!) - center(comps[j]!);
        if (p2 < PITCH.min || p2 > PITCH.max || Math.abs(comps[k]!.y0 - comps[j]!.y0) > TOP_SLACK) continue;
        return [comps[i]!, comps[j]!, comps[k]!];
      }
    }
  }
  return null;
}

/** 桁の枠を NORM_W × NORM_H に縮めた明るさ（面積の平均） */
function cellPatch(gray: Uint8Array, cx: number, top: number): number[] {
  const out: number[] = [];
  const x0 = cx - CELL_HALF;
  const cw = CELL_HALF * 2;
  for (let ny = 0; ny < NORM_H; ny++) {
    for (let nx = 0; nx < NORM_W; nx++) {
      let sum = 0;
      let n = 0;
      for (let y = Math.floor(top + (ny * CELL_H) / NORM_H); y < top + ((ny + 1) * CELL_H) / NORM_H; y++) {
        for (let x = Math.floor(x0 + (nx * cw) / NORM_W); x < x0 + ((nx + 1) * cw) / NORM_W; x++) {
          if (x < 0 || y < 0 || x >= SEARCH.w || y >= SEARCH.h) continue;
          sum += gray[y * SEARCH.w + x]!;
          n += 1;
        }
      }
      out.push(n > 0 ? sum / n : 0);
    }
  }
  return out;
}

function ncc(a: number[], b: number[]): number {
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

/** 1 フレームの 3 桁の枠（読めなければ null） */
function cellsOf(rgb: Buffer): { patches: number[][]; x: number; y: number } | null {
  const n = SEARCH.w * SEARCH.h;
  const gray = new Uint8Array(n);
  const bright = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const v = Math.max(rgb[i * 3]!, rgb[i * 3 + 1]!, rgb[i * 3 + 2]!);
    gray[i] = v;
    bright[i] = v > THRESHOLD ? 1 : 0;
  }
  const triplet = findTriplet(digitComponents(bright));
  if (triplet === null) return null;
  const top = Math.min(...triplet.map((c) => c.y0));
  return {
    patches: triplet.map((c) => cellPatch(gray, center(c), top)),
    x: triplet[0]!.x0 + SEARCH.x,
    y: top + SEARCH.y,
  };
}

async function* frames(first: number, last: number | undefined): AsyncGenerator<{ frame: number; rgb: Buffer }> {
  const select = last === undefined ? `gte(n\\,${first})` : `between(n\\,${first}\\,${last})`;
  const args = [
    '-v',
    'error',
    '-i',
    video!,
    '-vf',
    `select='${select}',crop=${SEARCH.w}:${SEARCH.h}:${SEARCH.x}:${SEARCH.y}`,
    '-fps_mode',
    'passthrough',
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgb24',
    '-',
  ];
  let frame = first;
  for await (const rgb of rawFrames(args, SEARCH.w * SEARCH.h * 3)) yield { frame: frame++, rgb };
}

async function makeTemplates(spec: string): Promise<void> {
  const samples = new Map(
    spec.split(',').map((s) => {
      const [frame, value] = s.split(':');
      if (!frame || !value || !/^\d{3}$/.test(value)) throw new Error(`見本は frame:3 桁の値 で指定する: ${s}`);
      return [Number(frame), value] as const;
    }),
  );
  const sums: Record<string, number[]> = {};
  const counts: Record<string, number> = {};
  const lo = Math.min(...samples.keys());
  const hi = Math.max(...samples.keys());
  for await (const { frame, rgb } of frames(lo, hi)) {
    const value = samples.get(frame);
    if (value === undefined) continue;
    const cells = cellsOf(rgb);
    if (cells === null) throw new Error(`フレーム ${frame} で表示の 3 桁が見つからない`);
    cells.patches.forEach((p, i) => {
      const d = value[i]!;
      sums[d] ??= p.map(() => 0);
      p.forEach((v, k) => (sums[d]![k]! += v));
      counts[d] = (counts[d] ?? 0) + 1;
    });
  }
  const missing = [...'0123456789'].filter((d) => !sums[d]);
  if (missing.length > 0) throw new Error(`見本に無い数字: ${missing.join('')}`);
  const round = (v: number) => Math.round(v * 10) / 10;
  const templates: Templates = {
    search: SEARCH,
    digits: Object.fromEntries(
      Object.entries(sums)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([d, s]) => [d, s.map((v) => round(v / counts[d]!))]),
    ),
  };
  writeFileSync(TEMPLATE_FILE, JSON.stringify(templates) + '\n');
  console.log(`wrote ${TEMPLATE_FILE.pathname}（数字ごとの見本数 ${JSON.stringify(counts)}）`);
}

async function readAll(first: number, last: number | undefined, t: Templates): Promise<Reading[]> {
  const out: Reading[] = [];
  for await (const { frame, rgb } of frames(first, last)) {
    const cells = cellsOf(rgb);
    if (cells === null) continue;
    let value = '';
    let score = 1;
    for (const p of cells.patches) {
      let best = { d: '?', s: -2 };
      for (const [d, tp] of Object.entries(t.digits)) {
        const s = ncc(p, tp);
        if (s > best.s) best = { d, s };
      }
      value += best.d;
      score = Math.min(score, best.s);
    }
    if (score < MIN_SCORE) continue;
    const v = Number(value);
    if (v > max) continue;
    out.push({ frame, value: v, score: Math.round(score * 1000) / 1000, x: cells.x, y: cells.y });
  }
  return out;
}

/**
 * 前後の読みのどちらとも大きく違う 1 フレームだけの読み（誤読）を落とす。弾丸チャージの増え（STEP_UP 以上）は、
 * 次の読みも増えた値の近くなら残す
 */
function clean(readings: Reading[]): Reading[] {
  const out: Reading[] = [];
  for (let i = 0; i < readings.length; i++) {
    const r = readings[i]!;
    const prev = out[out.length - 1];
    const next = readings[i + 1];
    if (prev !== undefined && next !== undefined && r.frame - prev.frame <= 3 && next.frame - r.frame <= 3) {
      const offPrev = Math.abs(r.value - prev.value);
      const offNext = Math.abs(r.value - next.value);
      if (offPrev > 25 && offNext > 25) continue;
    }
    out.push(r);
  }
  return out;
}

type Magazine = {
  /** 最大の表示（またはこの読みの区間の最初の読み）のフレーム */
  start: number;
  startValue: number;
  /** 0 の表示が最初に出たフレーム（撃ち切らなければ無し） */
  zero?: number;
  /** 0 の表示の後に増えたか（最後の弾丸と同じ発の弾丸チャージが残ったか）と、その値 */
  afterZero?: number;
  /** 減った量の合計（発数）と、増え（弾丸チャージ）のフレームと量 */
  drops: number;
  ups: { frame: number; from: number; to: number }[];
  /** 区間の中の、読みの間が 10 フレームを超えた所の数（その間の増えは数えられない） */
  gaps: number;
};

function magazines(readings: Reading[]): Magazine[] {
  const mags: Magazine[] = [];
  let cur: Magazine | null = null;
  let prev: Reading | null = null;
  for (const r of readings) {
    // リロードの後: 最大の表示が、前の読みより大きく、前の読みが小さい（0 か、読めない間の後）
    const reloaded = prev !== null && r.value === max && (prev.value < max - 50 || r.frame - prev.frame > 60);
    if (cur === null || reloaded) {
      if (cur !== null) mags.push(cur);
      cur = { start: r.frame, startValue: r.value, drops: 0, ups: [], gaps: 0 };
      prev = r;
      continue;
    }
    if (r.frame - prev!.frame > 10) cur.gaps += 1;
    const d = r.value - prev!.value;
    if (d < 0) cur.drops += -d;
    else if (d >= STEP_UP) {
      cur.ups.push({ frame: r.frame, from: prev!.value, to: r.value });
      if (cur.zero !== undefined && cur.afterZero === undefined) cur.afterZero = r.value;
    }
    if (r.value === 0 && cur.zero === undefined) cur.zero = r.frame;
    prev = r;
  }
  if (cur !== null) mags.push(cur);
  return mags;
}

if (values['make-templates'] !== undefined) {
  await makeTemplates(values['make-templates']);
} else {
  const t = JSON.parse(readFileSync(TEMPLATE_FILE, 'utf8')) as Templates;
  const from = Number(values.from);
  const to = values.to === undefined ? undefined : Number(values.to);
  const readings = clean(await readAll(from, to, t));
  if (values.mode === 'series') {
    console.log('frame\tvalue\tscore\tx\ty');
    for (const r of readings) console.log(`${r.frame}\t${r.value}\t${r.score}\t${r.x}\t${r.y}`);
  } else {
    console.log('start\tstartValue\tzero\tafterZero\tdrops\tups\tgaps\tupFrames');
    for (const m of magazines(readings)) {
      console.log(
        [
          m.start,
          m.startValue,
          m.zero ?? '',
          m.afterZero ?? '',
          m.drops,
          m.ups.length,
          m.gaps,
          m.ups.map((u) => `${u.frame}:${u.from}→${u.to}`).join(' '),
        ].join('\t'),
      );
    }
  }
  console.error(`${readings.length} フレームを読んだ`);
}
