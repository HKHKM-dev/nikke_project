// 操作キャラの照準の左に出る残弾の表示（暗い四角に 3 桁の数字。000 埋め）を全フレーム読み、マガジンごとの発数と弾丸チャージを出す
// （ルドミラ：ウィンターオーナー編。plan/design-ludmilla-wo.md 3 節、backlog 6 節）。枠アイコンの上の「残弾/最大」は
// tools/captures/ammo.ts。単騎の操作キャラはそちらの表示が出ないので、こちらを読む。
//   node tools/captures/reticle-ammo.ts <動画> [--mode mags|series] [--from N] [--to N] [--max 300] [--style box]
//   node tools/captures/reticle-ammo.ts <動画> --make-templates 1081:169,1082:168,... [--style box]   # 見本を作り直す
//
// --style box: 照準の下に「AMMO | 008」の形で出る表示（紅蓮：神殺。射撃 UI が特殊なキャラ。V-0679）。3 桁の組の見つけ方は同じで、
// 見本だけ別のファイル（reticle-ammo-box-templates.json）にする。見本は録画 0960 の 1 本目のマガジン（008〜001・リロードの明けの 009）
// から作った。弾丸チャージは、減った発と同じフレームに足されるので表示が減らない（増えとしては出ない）。マガジンの発数は、
// 減った量の合計に、減らなかった発（HUD の増分の発の数との差）を足して読む。0 の表示はリロード中に暗くなり読めない
//
// 表示は照準と一緒に動く（的を追う AUTO 射撃では 1 フレームごとに数 px）。そこで画面の中央付近（SEARCH）で、明るい（max(R,G,B)
// が THRESHOLD より大きい）連結成分のうち数字の高さのものを探し、横に等間隔に 3 つ並んだ組を表示の 3 桁とする。残弾が少ないと
// 四角と数字が赤くなる（録画 0099 では 130 から）ので、明るさは max(R,G,B) で見る。各桁は成分の中心を中心にした
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
import {
  averageTemplates,
  clean,
  magazines,
  reloadBelowOf,
  parseTemplateSpec,
  type Reading,
  type TemplateSample,
} from './reticle-ammo-lib.ts';

const TEMPLATE_FILE = new URL('./reticle-ammo-templates.json', import.meta.url);
/** --style box（照準の下の「AMMO | 008」の表示）の見本 */
const BOX_TEMPLATE_FILE = new URL('./reticle-ammo-box-templates.json', import.meta.url);
/** 探す範囲（1920×1080）。照準は的を追うので広めに取る */
const SEARCH = { x: 400, y: 250, w: 1200, h: 450 };
/** 数字とみなす明るさ（max(R,G,B)） */
const THRESHOLD = 200;
/** 数字の連結成分の大きさ（録画 0099 で高さ 18〜20px・幅 4〜12px） */
const DIGIT_H = { min: 17, max: 22 };
/** --style box の数字の高さ。残弾が少ないと赤くなり、明るい芯だけが残って 15〜16px になる（録画 0960 の f1230） */
const BOX_DIGIT_H = { min: 13, max: 22 };
const DIGIT_W = { min: 3, max: 14 };
/** 桁の中心の間隔（録画 0099 で 13〜15px）と、桁の上端のずれの許し */
const PITCH = { min: 12, max: 17 };
const TOP_SLACK = 2;
/** 表示の四角の中（数字の上端の BOX_ABOVE px 上の帯、3 桁の幅）の明るさの上限。ダメージの数字（四角が無い）と分ける */
const BOX_ABOVE = 3;
const BOX_MAX_BRIGHT = 140;
/** 照合の枠（桁の中心から左右 CELL_HALF px、上端から CELL_H px）と、縮めた大きさ */
const CELL_HALF = 7;
const CELL_H = 20;
const NORM_W = 10;
const NORM_H = 16;
/** これより照合が悪い桁を含む読みは捨てる */
const MIN_SCORE = 0.7;

type Templates = { search: typeof SEARCH; digits: Record<string, number[]> };
type Comp = { x0: number; x1: number; y0: number; y1: number };

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    mode: { type: 'string', default: 'mags' },
    from: { type: 'string', default: '0' },
    to: { type: 'string' },
    max: { type: 'string', default: '300' },
    'make-templates': { type: 'string' },
    style: { type: 'string', default: 'default' },
  },
});
if (values.style !== 'default' && values.style !== 'box') throw new Error(`--style は default か box: ${values.style}`);
const box = values.style === 'box';
const templateFile = box ? BOX_TEMPLATE_FILE : TEMPLATE_FILE;
const digitH = box ? BOX_DIGIT_H : DIGIT_H;

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
      for (const k of [x + 1 < w ? j + 1 : -1, x > 0 ? j - 1 : -1, y + 1 < h ? j + w : -1, y > 0 ? j - w : -1]) {
        if (k < 0 || !bright[k] || seen[k]) continue;
        seen[k] = 1;
        stack.push(k);
      }
    }
    const ch = c.y1 - c.y0 + 1;
    const cw = c.x1 - c.x0 + 1;
    if (ch >= digitH.min && ch <= digitH.max && cw >= DIGIT_W.min && cw <= DIGIT_W.max) comps.push(c);
  }
  return comps.sort((a, b) => a.x0 - b.x0);
}

const center = (c: Comp) => (c.x0 + c.x1) / 2;

/** 3 桁の上の帯（四角の中）の明るさの平均（max(R,G,B)） */
function aboveBrightness(gray: Uint8Array, t: Comp[]): number {
  const y = Math.min(...t.map((c) => c.y0)) - BOX_ABOVE;
  if (y < 0) return 255;
  let sum = 0;
  let n = 0;
  for (let x = t[0]!.x0; x <= t[2]!.x1; x++) {
    sum += gray[y * SEARCH.w + x]!;
    n += 1;
  }
  return sum / n;
}

/** 横に等間隔に並んだ 3 つの成分で、上の帯が暗いもの（表示の 3 桁）。無ければ null */
function findTriplet(comps: Comp[], gray: Uint8Array): Comp[] | null {
  for (let i = 0; i < comps.length; i++) {
    for (let j = i + 1; j < comps.length; j++) {
      const p1 = center(comps[j]!) - center(comps[i]!);
      if (p1 < PITCH.min || p1 > PITCH.max || Math.abs(comps[j]!.y0 - comps[i]!.y0) > TOP_SLACK) continue;
      for (let k = j + 1; k < comps.length; k++) {
        const p2 = center(comps[k]!) - center(comps[j]!);
        if (p2 < PITCH.min || p2 > PITCH.max || Math.abs(comps[k]!.y0 - comps[j]!.y0) > TOP_SLACK) continue;
        const t = [comps[i]!, comps[j]!, comps[k]!];
        if (aboveBrightness(gray, t) <= BOX_MAX_BRIGHT) return t;
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
  const triplet = findTriplet(digitComponents(bright), gray);
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
  const samples = parseTemplateSpec(spec);
  const picked: TemplateSample[] = [];
  for await (const { frame, rgb } of frames(Math.min(...samples.keys()), Math.max(...samples.keys()))) {
    const value = samples.get(frame);
    if (value !== undefined) picked.push({ frame, value, patches: cellsOf(rgb)?.patches ?? null });
  }
  const { digits, counts } = averageTemplates(picked, (frame) =>
    console.error(`フレーム ${frame} で表示の 3 桁が見つからない（飛ばす）`),
  );
  const templates: Templates = { search: SEARCH, digits };
  writeFileSync(templateFile, JSON.stringify(templates) + '\n');
  console.log(`wrote ${templateFile.pathname}（数字ごとの見本数 ${JSON.stringify(counts)}）`);
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

if (values['make-templates'] !== undefined) {
  await makeTemplates(values['make-templates']);
} else {
  const t = JSON.parse(readFileSync(templateFile, 'utf8')) as Templates;
  const from = Number(values.from);
  const to = values.to === undefined ? undefined : Number(values.to);
  const readings = clean(await readAll(from, to, t), box);
  if (values.mode === 'series') {
    console.log('frame\tvalue\tscore\tx\ty');
    for (const r of readings) console.log(`${r.frame}\t${r.value}\t${r.score}\t${r.x}\t${r.y}`);
  } else {
    console.log('start\tstartValue\tzero\tafterZero\tdrops\tups\tgaps\tupFrames');
    for (const m of magazines(readings, max, reloadBelowOf(max, box))) {
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
