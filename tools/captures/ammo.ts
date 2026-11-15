// 枠アイコンの上の残弾表示「残弾/最大」を全フレーム読み、マガジンごとの射撃の時刻か、フレームごとの残弾と最大を出す
// （MG の射撃レートの再較正（plan/design-mg-fire-rate.md）・AI の味方の射撃フレーム。AI の味方は数値が画面に出ないので、
// 射撃フレームはこの表示から読むしかない）。
//   node tools/captures/ammo.ts <動画> [--card 2 | --crop 785,902,110,26] [--max 300[,...]] [--charge] [--mode mags|series] [--from N] [--to N]
//   node tools/captures/ammo.ts <動画> --make-templates 1000:36/60,1500:37/148 [--card 2 | --crop ...] [--merge]
//
// 読み方は ammo-lib.ts（「/」を探し、左の残弾と右の最大を字の送りで並べた位置で照合し、最大の列 → 残弾の列の順に Viterbi で復号）。
// - 最大: --max を 1 つ書けば一定。カンマで並べればその中で替わる（最大装弾数▲）。省くと、「/」の右で最もよく合った値のうち
//   30 フレーム以上のものを候補にする。最大が替わったフレームでは、残弾はどの値にも移れる。最大の小さい字の 6 と 8・2 と 4 は
//   明るい背景で取り違えることがある（省くと 126・146 などの偽の候補も出る）ので、最大の値は --max で並べ、替わり目は still.ts で確かめる。
// - 残弾: 同じマガジンの中では増えない（1 フレームに最大 MAX_DROP 発）。表示が消えた後は、そのフレームの最大に戻る（リロード）か、
//   消える前の値以下から続ける（バーストの演出・暗い縞の重なりで読めなかった間）。
//   --charge なら、増える遷移（弾丸チャージ）も罰則付きで許す（マガジンの区切りは表示が消えた所だけになるので --mode series で読む）。
//   分割リロードの武器（SG）には使えない。
// - crop は 1920×1080 で表示を含む 110×26。--card N は顔のカードの置き場所（左から 1〜5。card-layout.ts）の
//   表示の crop（card-layout.ts の ammoCrop）。既定は見本を作った crop（2 つ目の置き場所）。
// - 見本（ammo-templates.json）は、暗い背景の画の表示の字を、文字列の右詰めで字の列に当てて作る（ammo-lib.ts buildTemplates）。
//   録画 1221（ソルジャーE.G. の NN/60・NN/80・NNN/148）と 1207（フォーチュンメイトの N/9）の 2 つ目の置き場所と、
//   0041（NNN/300 と N/300。既定の crop）から作った。最大の小さい字の 5 と 7 は見本が無い。--merge は今の見本に足す
//   （別の録画の見本を足すとき。字の間の詰まった 7 で始まる 2 桁は字に分けられないので、見本に選ばない）。
//
// mode:
//   mags    マガジンごとの 1 発目・最終弾（0 の表示）・次の最大の表示と、4f 以上止まった区間（MG のスピンアップ中の間隔も出る）
//   series  各フレームの残弾と最大（表示が消えているフレームは残弾が空）
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import {
  buildTemplates,
  decodeAmmo,
  decodeMax,
  digitKeys,
  frameScores,
  maxCandidates,
  type Templates,
  toGray,
  type Gray,
} from './ammo-lib.ts';
import { cropFilter, parseCrop, rawFrames, type Crop } from './ffmpeg.ts';
import { selectExpr } from './aim-lib.ts';
import { ammoCrop, CARD_SLOTS } from './card-layout.ts';

const TEMPLATE_FILE = new URL('./ammo-templates.json', import.meta.url);
/** 最大の候補にする、「/」の右で最もよく合ったフレームの数の下限（--max を省いたとき） */
const MAX_MIN_FRAMES = 30;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    crop: { type: 'string' },
    card: { type: 'string' },
    max: { type: 'string' },
    charge: { type: 'boolean', default: false },
    mode: { type: 'string', default: 'mags' },
    from: { type: 'string', default: '0' },
    to: { type: 'string' },
    'make-templates': { type: 'string' },
    merge: { type: 'boolean', default: false },
  },
});

const video = positionals[0];
if (!video) {
  console.error(
    'usage: node tools/captures/ammo.ts <動画> [--card N | --crop x,y,w,h] [--max 300[,...]] [--charge] [--mode mags|series] [--from N] [--to N]\n' +
      '       node tools/captures/ammo.ts <動画> --make-templates frame:残弾/最大,... [--card N | --crop x,y,w,h] [--merge]',
  );
  process.exit(1);
}

function loadTemplates(): Templates {
  return JSON.parse(readFileSync(TEMPLATE_FILE, 'utf8')) as Templates;
}

function cropOf(fallback: Crop): Crop {
  if (values.crop !== undefined) return parseCrop(values.crop);
  if (values.card !== undefined) {
    const slot = CARD_SLOTS[Number(values.card) - 1];
    if (slot === undefined) throw new Error(`--card は 1〜${CARD_SLOTS.length}: ${values.card}`);
    return ammoCrop(slot);
  }
  return fallback;
}

/** first〜last のフレームを読み、each に通した値の列にする（読みながら照合し、デコードと照合を重ねる） */
async function readFrames<T>(
  crop: Crop,
  first: number,
  last: number | undefined,
  each: (img: Gray) => T,
): Promise<T[]> {
  const args = ['-v', 'error', '-i', video!, '-vf', `select='${selectExpr(first, last, 1)}',${cropFilter(crop)}`];
  args.push('-fps_mode', 'passthrough');
  // 終わりがあれば、選んだ枚数を出したところで止める（録画の終わりまでデコードしない）
  if (last !== undefined) args.push('-frames:v', String(last - first + 1));
  args.push('-f', 'rawvideo', '-pix_fmt', 'rgb24', '-');
  const out: T[] = [];
  for await (const buf of rawFrames(args, crop.w * crop.h * 3)) out.push(each(toGray(buf, crop.w, crop.h)));
  return out;
}

async function makeTemplates(spec: string): Promise<void> {
  const base = values.merge ? loadTemplates() : undefined;
  const crop = cropOf(base?.crop ?? ammoCrop(CARD_SLOTS[1]));
  const samples = spec.split(',').map((s) => {
    const at = s.indexOf(':');
    const frame = Number(s.slice(0, at));
    const text = s.slice(at + 1);
    if (at <= 0 || !Number.isInteger(frame) || !/^\d+\/\d+$/.test(text))
      throw new Error(`見本は frame:残弾/最大 で指定する: ${s}`);
    return { frame, text };
  });
  const wanted = new Set(samples.map((s) => s.frame));
  let n = 0;
  const frames = await readFrames(crop, 0, Math.max(...wanted), (img) => (wanted.has(n++) ? img : undefined));
  const templates = buildTemplates(
    samples.map(({ frame, text }) => ({ img: frames[frame]!, text })),
    crop,
    base,
  );
  const missing = ['/', ...digitKeys(false), ...digitKeys(true)].filter((d) => templates.glyphs[d] === undefined);
  writeFileSync(TEMPLATE_FILE, `${JSON.stringify(templates)}\n`);
  const counts = Object.fromEntries(Object.entries(templates.glyphs).map(([ch, g]) => [ch, `${g.count}（幅 ${g.w}）`]));
  const advances = Object.fromEntries(Object.entries(templates.advances).map(([k, v]) => [k, v.length]));
  console.log(
    `wrote ${TEMPLATE_FILE.pathname}（字ごとの見本の数 ${JSON.stringify(counts)}・送りの見本の数 ${JSON.stringify(advances)}）`,
  );
  if (missing.length > 0) console.log(`見本に無い字（m は最大の小さい字）: ${missing.join(' ')}（--merge で足す）`);
}

type Magazine = {
  /** 最大の表示が出たフレーム（リロード完了の表示。録画の始めのマガジンは、表示が最初に出たフレーム） */
  full: number;
  /** その時の最大 */
  max: number;
  /** 最初に減ったフレーム（1 発目） */
  first?: number;
  /** 0 になったフレーム（最終弾） */
  zero?: number;
  /**
   * 次のマガジンの前に表示が最後に消えたフレームと、その直前の残弾（途中でリロードした場合は 0 より大きい。バーストの演出で
   * 消えた後にまた出た場合は、その後に消えた所）
   */
  hide?: number;
  hideValue?: number;
  /** 次のマガジンの最大の表示 */
  next?: number;
  /** 4f 以上同じ値のまま止まった区間（値・開始・長さ。表示が消えている区間は除く） */
  stalls: { value: number; start: number; frames: number }[];
};

function magazines(ammo: (number | null)[], maxes: number[], offset: number): Magazine[] {
  const mags: Magazine[] = [];
  let cur: Magazine | undefined;
  for (let i = 0; i < ammo.length; i++) {
    const v = ammo[i]!;
    const max = maxes[i]!;
    // マガジンの始まり: 最大の表示が出た所。録画の始めで最大が出る前に減り始めていれば、最初に表示が出た所
    // （消えた後に最大で出た所は、最大がその間に替わっていてもリロード。見えたまま最大に増えた所は、最大が同じときだけ）
    const refill = v === max && (i === 0 || ammo[i - 1] === null || (ammo[i - 1]! < max && maxes[i - 1] === max));
    if (refill || (cur === undefined && v !== null)) {
      if (cur) cur.next = i + offset;
      cur = { full: i + offset, max, stalls: [] };
      mags.push(cur);
    }
    if (!cur) continue;
    if (cur.first === undefined && v !== null && v < max) cur.first = i + offset;
    if (cur.zero === undefined && v === 0) cur.zero = i + offset;
    if (v === null && i > 0 && ammo[i - 1] !== null) {
      cur.hide = i + offset;
      cur.hideValue = ammo[i - 1]!;
    }
  }
  for (const m of mags) {
    if (m.first === undefined) continue;
    const end = m.zero ?? m.next ?? ammo.length + offset;
    let start: number | undefined;
    for (let f = m.first + 1; f <= end; f++) {
      const same = ammo[f - offset] === ammo[f - 1 - offset] && ammo[f - offset] !== null;
      if (same && start === undefined) start = f - 1;
      if (!same && start !== undefined) {
        if (f - start >= 4) m.stalls.push({ value: ammo[start - offset]!, start, frames: f - start });
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

const templates = loadTemplates();
const crop = cropOf(templates.crop);
const from = Number(values.from);
const to = values.to === undefined ? undefined : Number(values.to);
const given = values.max?.split(',').map(Number);
if (given !== undefined && given.some((v) => !Number.isInteger(v) || v < 1))
  throw new Error(`--max は正の整数をカンマで並べる: ${values.max}`);
const limit = given === undefined ? 300 : Math.max(...given);
const frames = await readFrames(crop, from, to, (img) => frameScores(img, templates, limit));
const candidates = given ?? maxCandidates(frames, MAX_MIN_FRAMES);
if (given === undefined) console.error(`最大の候補: ${candidates.join('・') || 'なし'}`);
const maxes = decodeMax(frames, candidates);
const decoded = decodeAmmo(frames, maxes, { charge: values.charge });

if (values.mode === 'series') {
  console.log('frame,ammo,max');
  decoded.forEach((v, i) => console.log(`${i + from},${v ?? ''},${maxes[i]}`));
} else {
  for (let i = 1; i < maxes.length; i++)
    if (maxes[i] !== maxes[i - 1]) console.error(`最大の替わり目: f${i + from} ${maxes[i - 1]} → ${maxes[i]}`);
  console.log(
    '| 最大の表示 | 最大 | 1 発目 | 最終弾（0） | 表示が消えた（残弾） | 次の最大 | 1 発目 → 最終弾 | 最終弾 → 次の 1 発目 | 止まった区間（残弾@f:長さ） |',
  );
  console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  const mags = magazines(decoded, maxes, from);
  mags.forEach((m, i) => {
    const last = m.zero ?? m.hide;
    const nextFirst = mags[i + 1]?.first;
    const cols = [
      m.full,
      m.max,
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
