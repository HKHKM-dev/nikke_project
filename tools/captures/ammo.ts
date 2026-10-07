// 枠アイコンの上の残弾表示「残弾/最大」を全フレーム読み、マガジンごとの射撃の時刻を出す（MG の射撃レートの再較正用。
// plan/design-mg-fire-rate.md）。AI の味方は数値が画面に出ないので、射撃フレームはこの表示から読むしかない。
//   node tools/captures/ammo.ts <動画> [--crop 785,902,110,26] [--max 300] [--mode mags|series] [--from N] [--to N]
//   node tools/captures/ammo.ts <動画> --make-templates 8700:295,8660:299,... [--crop ...]   # テンプレートを作り直す
//
// 表示は白のプロポーショナルフォントで、文字列全体が中央揃え（桁が減ると 4.5px ずつ右に寄り、先頭が「1」だと幅が狭い）。
// そこで min(R,G,B) の画像で「/最大」の位置を先に探し、その左の桁を数字のテンプレートと正規化相互相関で照合する。
// 明るい背景（肌色）では 1 桁の誤読が出るので、「同じマガジンの中では残弾は増えない（1 フレームに最大 MAX_DROP 発）・
// 表示が消えた（リロード中）後は最大に戻る」の制約で Viterbi 復号する。分割リロードの武器（SG）には使えない。
//
// crop は 1920×1080 で枠アイコンの上の表示を含む 110×26。既定は 4 人編成の 2 枠目・2 人編成の 1 枠目（録画 41・35）。
// テンプレート（ammo-templates.json）は録画 41 の暗い背景のフレームから作った。明るい背景の見本を混ぜると崩れる。
//
// mode:
//   mags    マガジンごとの 1 発目・最終弾（0 の表示）・次の最大の表示と、4f 以上止まった区間（MG のスピンアップ中の間隔も出る）
//   series  各フレームの残弾（表示が消えているフレームは空）
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { cropFilter, parseCrop, rawFrames, type Crop } from './ffmpeg.ts';

const TEMPLATE_FILE = new URL('./ammo-templates.json', import.meta.url);

/** 読む範囲（crop の中の座標）。3 桁の表示の先頭の桁が x=24、桁の間隔 9px、「/」が x=51 から */
const LAYOUT = { y0: 6, rows: 12, digitX0: 24, pitch: 9, digitW: 9, slashX: 51, slashW: 30 };
/** 1 フレームに減ってよい最大の発数（描画落ちで録画が取りこぼすと 1 フレームに 2〜3 発減る） */
const MAX_DROP = 8;
/** 表示が消えている（リロード中など）状態の照合スコア。数字の照合がこれを下回るフレームは「消えている」に倒れやすい */
const HIDDEN_SCORE = 0.55;
/** 2 発以上まとめて減る遷移の罰則（1 発あたり） */
const DROP_PENALTY = 0.02;
/** 表示が消える・消えた状態から戻る遷移の罰則 */
const HIDE_PENALTY = 0.3;
/** 数字の位置の探索幅（px）。先頭の桁は「1」の幅が狭いぶん右に寄るので広く取る */
const SHIFTS = [-3, -2, -1, 0, 1, 2, 3];
const FIRST_SHIFTS = [-3, -2, -1, 0, 1, 2, 3, 4, 5, 6];

type Templates = { crop: Crop; layout: typeof LAYOUT; slash: number[]; digits: Record<string, number[]> };

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    crop: { type: 'string', default: '785,902,110,26' },
    max: { type: 'string', default: '300' },
    mode: { type: 'string', default: 'mags' },
    from: { type: 'string', default: '0' },
    to: { type: 'string' },
    'make-templates': { type: 'string' },
  },
});

const video = positionals[0];
if (!video) {
  console.error(
    'usage: node tools/captures/ammo.ts <動画> [--crop x,y,w,h] [--max 300] [--mode mags|series] [--from N] [--to N]\n' +
      '       node tools/captures/ammo.ts <動画> --make-templates frame:value,... [--crop x,y,w,h]',
  );
  process.exit(1);
}
const crop = parseCrop(values.crop);
const max = Number(values.max);
const from = Number(values.from);
const to = values.to === undefined ? undefined : Number(values.to);

/** 1 フレームの min(R,G,B) */
type Gray = { data: Uint8Array; w: number; h: number };

function toGray(rgb: Buffer, w: number, h: number): Gray {
  const data = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) data[i] = Math.min(rgb[i * 3]!, rgb[i * 3 + 1]!, rgb[i * 3 + 2]!);
  return { data, w, h };
}

function patch(img: Gray, x0: number, w: number): number[] {
  const out: number[] = [];
  for (let y = LAYOUT.y0; y < LAYOUT.y0 + LAYOUT.rows; y++) {
    for (let dx = 0; dx < w; dx++) {
      const x = Math.round(x0 + dx);
      out.push(x < 0 || x >= img.w ? 0 : img.data[y * img.w + x]!);
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

async function readFrames(first: number, last: number | undefined): Promise<Gray[]> {
  const select = last === undefined ? `gte(n\\,${first})` : `between(n\\,${first}\\,${last})`;
  const args = [
    '-v',
    'error',
    '-i',
    video!,
    '-vf',
    `select='${select}',${cropFilter(crop)}`,
    '-fps_mode',
    'passthrough',
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgb24',
    '-',
  ];
  const frames: Gray[] = [];
  for await (const buf of rawFrames(args, crop.w * crop.h * 3)) frames.push(toGray(buf, crop.w, crop.h));
  return frames;
}

async function makeTemplates(spec: string): Promise<void> {
  const samples = spec.split(',').map((s) => {
    const [frame, value] = s.split(':');
    if (!frame || !value || value.length !== 3) throw new Error(`見本は frame:3 桁の値 で指定する: ${s}`);
    return { frame: Number(frame), value };
  });
  const frames = await readFrames(0, Math.max(...samples.map((s) => s.frame)));
  const sums: Record<string, number[]> = {};
  const counts: Record<string, number> = {};
  for (const { frame, value } of samples) {
    const img = frames[frame]!;
    for (let i = 0; i < 3; i++) {
      const d = value[i]!;
      const p = patch(img, LAYOUT.digitX0 + LAYOUT.pitch * i, LAYOUT.digitW);
      sums[d] ??= p.map(() => 0);
      p.forEach((v, k) => (sums[d]![k]! += v));
      counts[d] = (counts[d] ?? 0) + 1;
    }
  }
  const missing = [...'0123456789'].filter((d) => !sums[d]);
  if (missing.length > 0) throw new Error(`見本に無い数字: ${missing.join('')}`);
  const round = (v: number) => Math.round(v * 10) / 10;
  const templates: Templates = {
    crop,
    layout: LAYOUT,
    // 「/最大」は 1 つ目の見本から取る
    slash: patch(frames[samples[0]!.frame]!, LAYOUT.slashX, LAYOUT.slashW),
    digits: Object.fromEntries(Object.entries(sums).map(([d, s]) => [d, s.map((v) => round(v / counts[d]!))])),
  };
  writeFileSync(TEMPLATE_FILE, JSON.stringify(templates) + '\n');
  console.log(`wrote ${TEMPLATE_FILE.pathname}（数字ごとの見本数 ${JSON.stringify(counts)}）`);
}

/** 各フレームの値 0..max ごとの照合スコア（高いほど良い） */
function emissions(img: Gray, t: Templates): Float32Array {
  const e = new Float32Array(max + 1).fill(-1);
  const maxDigits = String(max).length;
  for (let n = 1; n <= maxDigits; n++) {
    // 桁が 1 つ減るごとに文字列が 4.5px 右に寄る（中央揃え）。「/」の位置をその近くで探す
    const base = -(maxDigits - n) * (LAYOUT.pitch / 2);
    let slash = { score: -2, dx: 0 };
    for (let dx = Math.floor(base) - 2; dx <= Math.ceil(base) + 2; dx++) {
      const score = ncc(patch(img, LAYOUT.slashX + dx, LAYOUT.slashW), t.slash);
      if (score > slash.score) slash = { score, dx };
    }
    const perDigit: Record<string, number>[] = [];
    for (let i = 0; i < n; i++) {
      const x = LAYOUT.digitX0 + slash.dx + LAYOUT.pitch * (maxDigits - n) + LAYOUT.pitch * i;
      const scores: Record<string, number> = {};
      for (const sh of i === 0 ? FIRST_SHIFTS : SHIFTS) {
        const p = patch(img, x + sh, LAYOUT.digitW);
        for (const [d, tp] of Object.entries(t.digits)) scores[d] = Math.max(scores[d] ?? -2, ncc(p, tp));
      }
      perDigit.push(scores);
    }
    const lo = n === 1 ? 0 : 10 ** (n - 1);
    const hi = Math.min(max, 10 ** n - 1);
    for (let v = lo; v <= hi; v++) {
      const s = String(v);
      let sum = 0;
      for (let i = 0; i < n; i++) sum += perDigit[i]![s[i]!]!;
      e[v] = 0.3 * slash.score + 0.7 * (sum / n);
    }
  }
  return e;
}

/** 制約付きの復号。戻り値は各フレームの残弾（表示が消えている状態は null） */
function decode(emit: Float32Array[]): (number | null)[] {
  const hidden = max + 1;
  const states = max + 2;
  const n = emit.length;
  const back: Int16Array[] = [];
  let prev = new Float64Array(states).fill(-1e9);
  prev[hidden] = HIDDEN_SCORE;
  prev[max] = emit[0]![max]!;
  back.push(new Int16Array(states).fill(-1));
  for (let f = 1; f < n; f++) {
    const cur = new Float64Array(states).fill(-1e9);
    const bk = new Int16Array(states).fill(-1);
    for (let v = 0; v <= max; v++) {
      for (let u = v; u <= Math.min(max, v + MAX_DROP); u++) {
        const s = prev[u]! - DROP_PENALTY * Math.max(0, u - v - 1);
        if (s > cur[v]!) {
          cur[v] = s;
          bk[v] = u;
        }
      }
      // 表示が戻るのはリロードが終わったときだけ（最大に戻る）
      if (v === max && prev[hidden]! - HIDE_PENALTY > cur[v]!) {
        cur[v] = prev[hidden]! - HIDE_PENALTY;
        bk[v] = hidden;
      }
      cur[v]! += emit[f]![v]!;
    }
    let best = prev[hidden]!;
    let from = hidden;
    for (let u = 0; u <= max; u++) {
      if (prev[u]! - HIDE_PENALTY > best) {
        best = prev[u]! - HIDE_PENALTY;
        from = u;
      }
    }
    cur[hidden] = best + HIDDEN_SCORE;
    bk[hidden] = from;
    back.push(bk);
    prev = cur;
  }
  let state = 0;
  for (let s = 1; s < states; s++) if (prev[s]! > prev[state]!) state = s;
  const path: (number | null)[] = new Array(n);
  for (let f = n - 1; f >= 0; f--) {
    path[f] = state === hidden ? null : state;
    state = back[f]![state]!;
  }
  return path;
}

type Magazine = {
  /** 最大の表示が出たフレーム（リロード完了の表示） */
  full: number;
  /** 最初に減ったフレーム（1 発目） */
  first?: number;
  /** 0 になったフレーム（最終弾） */
  zero?: number;
  /** 表示が消えたフレームと、その直前の残弾（途中でリロードした場合は 0 より大きい） */
  hide?: number;
  hideValue?: number;
  /** 次のマガジンの最大の表示 */
  next?: number;
  /** 4f 以上同じ値のまま止まった区間（値・開始・長さ） */
  stalls: { value: number; start: number; frames: number }[];
};

function magazines(values: (number | null)[], offset: number): Magazine[] {
  const mags: Magazine[] = [];
  let cur: Magazine | undefined;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (v === max && (i === 0 || values[i - 1] === null || values[i - 1]! < max)) {
      if (cur) cur.next = i + offset;
      cur = { full: i + offset, stalls: [] };
      mags.push(cur);
    }
    if (!cur) continue;
    if (cur.first === undefined && v !== null && v < max) cur.first = i + offset;
    if (cur.zero === undefined && v === 0) cur.zero = i + offset;
    if (cur.hide === undefined && v === null && i > 0 && values[i - 1] !== null) {
      cur.hide = i + offset;
      cur.hideValue = values[i - 1]!;
    }
  }
  for (const m of mags) {
    if (m.first === undefined) continue;
    const end = m.zero ?? m.hide ?? values.length + offset;
    let start: number | undefined;
    for (let f = m.first + 1; f <= end; f++) {
      const same = values[f - offset] === values[f - 1 - offset];
      if (same && start === undefined) start = f - 1;
      if (!same && start !== undefined) {
        if (f - start >= 4) m.stalls.push({ value: values[start - offset]!, start, frames: f - start });
        start = undefined;
      }
    }
  }
  return mags;
}

if (values['make-templates']) {
  await makeTemplates(values['make-templates']);
  process.exit(0);
}

const templates = JSON.parse(readFileSync(TEMPLATE_FILE, 'utf8')) as Templates;
const frames = await readFrames(from, to);
const decoded = decode(frames.map((img) => emissions(img, templates)));

if (values.mode === 'series') {
  console.log('frame,ammo');
  decoded.forEach((v, i) => console.log(`${i + from},${v ?? ''}`));
} else {
  console.log(
    '| 最大の表示 | 1 発目 | 最終弾（0） | 表示が消えた（残弾） | 次の最大 | 1 発目 → 最終弾 | 最終弾 → 次の 1 発目 | 止まった区間（残弾@f:長さ） |',
  );
  console.log('| --- | --- | --- | --- | --- | --- | --- | --- |');
  const mags = magazines(decoded, from);
  mags.forEach((m, i) => {
    const last = m.zero ?? m.hide;
    const nextFirst = mags[i + 1]?.first;
    const cols = [
      m.full,
      m.first ?? '',
      m.zero ?? '',
      m.hide === undefined ? '' : `${m.hide}（${m.hideValue}）`,
      m.next ?? '',
      m.first !== undefined && last !== undefined ? last - m.first : '',
      m.zero !== undefined && nextFirst !== undefined ? nextFirst - m.zero : '',
      m.stalls.map((s) => `${s.value}@${s.start}:${s.frames}`).join(' '),
    ];
    console.log(`| ${cols.join(' | ')} |`);
  });
}
