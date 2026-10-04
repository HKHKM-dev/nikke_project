// 射撃場の録画から、照準の中心・コアの中心と半径・的の見かけの大きさと位置をフレームごとに測る（Stage 18-B2。
// plan/design-stage18.md 11.1 の 1・3、11.4）。
//   node tools/captures/aim.ts <動画> [--from N] [--to N] [--step 60] [--csv out.csv] [--debug-dir DIR]
//                                  [--bg-from N] [--bg-to N] [--bg-step 120]
//
// 1920×1080 の録画を前提にする。フレーム番号は index.md「フレーム番号の約束」（デコード順の通し番号）。
// 録画 54・56・57 は pts が 1/60 秒刻みで欠けが無く、fps=60 を通した番号と一致する。
//
// CSV の列（座標は画素の番号。画素の中心が整数）:
//   aim_x, aim_y   照準の中心。aim_conf: 十字は使えた線の本数 / 4（0.25 以下は線の行・列のまま ±1px）、リングは円に乗った方向の割合
//   aim_color      white / cyan（適正距離）/ yellow（フルバースト）/ unknown。aim_type: cross / ring
//   aim_size       十字: 中心から線の内側の端まで。リング: 半径。撃ち続けると段階的に広がる（録画 57 で 12.5 → 17.5 → 22.5）
//   aim_redmark    リング: 内側の斜めに赤い印があるか
//   core_x, core_y, core_r, core_hot  コアの中心・赤い光の半径・芯の画素数（見つからなければ空）
//   hitmark        当たった印（照準の斜め 4 方向の菱形）の色。印があるフレームは照準の中心に着弾のエフェクトも出る
//   dx, dy         照準 − コア
//   tgt_*          的の外接矩形・幅・高さ・中心・面積、tgt_band_w（照準の高さ ±30px の帯での幅）、
//                  tgt_clipped（探す範囲の端に接している）、fx（照準の周り ±150px の明るい画素の割合。0.45 以上は爆発などで的が隠れている）
//
// 照準: 照準の中心を通る細い横線・縦線が画面の端から端まで薄く通っているので、まず「端から端まで続く細い明るい線」の
// 行と列を探して粗い中心を出す（±1px）。リング（MG・SMG）は、暗い縁に挟まれた明るい線を 72 方向に探して円を当てはめる。
// 十字（AR など）は、4 本の腕の線（白・水色・黄色）を腕ごとに探し、線の画素の重心から中心を出し直す（隠れた線は使わない）。
// コア: 照準の近くで「白っぽい芯のまわりを赤い光が囲む」所を探す。当たった印・着弾のエフェクト・腕の赤い円盤・
// TARGET の文字と取り違えることがある（試作。--debug-dir の画像で確かめて使う）。
// 的: 戦場（y 120〜720）の背景を、戦闘中のフレーム（照準の線が見えるもの）の画素ごとの中央値で作り、背景より暗い画素の
// 連結成分のうち照準の近くのものを的とする（半分の解像度）。的は区間ごとに跳んで位置を変えるので、中央値に的は残らない。
// 背景に無い遮蔽物（壊れる前の緑の箱など）が的に接していると、外接矩形がそこまで広がる。遠い的の脚は霧で薄く、取れないことがある。
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import {
  FIELD,
  H,
  HALF_H,
  HALF_W,
  W,
  buildBackground,
  findAim,
  findCore,
  findTarget,
  hitMarker,
  readFrames,
  toHalfField,
  writeJpeg,
  type Aim,
  type Core,
  type Rgb,
  type Target,
} from './aim-lib.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    from: { type: 'string', default: '0' },
    to: { type: 'string' },
    step: { type: 'string', default: '60' },
    csv: { type: 'string' },
    'debug-dir': { type: 'string' },
    'bg-from': { type: 'string' },
    'bg-to': { type: 'string' },
    'bg-step': { type: 'string', default: '120' },
  },
});

const video = positionals[0];
if (!video) {
  console.error(
    'usage: node tools/captures/aim.ts <動画> [--from N] [--to N] [--step 60] [--csv out.csv] [--debug-dir DIR]\n' +
      '                                  [--bg-from N] [--bg-to N] [--bg-step 120]',
  );
  process.exit(1);
}
const from = Number(values.from);
const to = values.to === undefined ? undefined : Number(values.to);
const step = Number(values.step);
const debugDir = values['debug-dir'];
const bgFrom = values['bg-from'] === undefined ? 0 : Number(values['bg-from']);
const bgTo = values['bg-to'] === undefined ? undefined : Number(values['bg-to']);
const bgStep = Number(values['bg-step']);

function drawDebug(img: Rgb, frame: number, aim: Aim | null, core: Core | null, target: Target | null): void {
  if (!debugDir) return;
  const d = Buffer.from(img.data);
  const put = (x: number, y: number, c: [number, number, number]): void => {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 3;
    d[i] = c[0];
    d[i + 1] = c[1];
    d[i + 2] = c[2];
  };
  if (target) {
    // 的の画素を青く染め、外接矩形を黄色で描く
    for (let hy = 0; hy < HALF_H; hy++) {
      for (let hx = 0; hx < HALF_W; hx++) {
        if (!target.mask[hy * HALF_W + hx]) continue;
        for (let k = 0; k < 4; k++) {
          const x = hx * 2 + (k & 1);
          const y = FIELD.y0 + hy * 2 + (k >> 1);
          const i = (y * W + x) * 3;
          d[i] = d[i]! >> 1;
          d[i + 1] = d[i + 1]! >> 1;
          d[i + 2] = Math.min(255, (d[i + 2]! >> 1) + 100);
        }
      }
    }
    for (let t = 0; t < 3; t++) {
      for (let x = target.x0; x <= target.x1; x++) {
        put(x, target.y0 - t, [255, 230, 0]);
        put(x, target.y1 + t, [255, 230, 0]);
      }
      for (let y = target.y0; y <= target.y1; y++) {
        put(target.x0 - t, y, [255, 230, 0]);
        put(target.x1 + t, y, [255, 230, 0]);
      }
    }
  }
  if (aim) {
    for (let t = -12; t <= 12; t++) {
      for (const o of [0, 1]) {
        put(aim.x + t, aim.y + t + o, [255, 0, 255]);
        put(aim.x + t, aim.y - t + o, [255, 0, 255]);
      }
    }
  }
  // 下に、照準の周り 240×180 の元の画像を 3 倍で足し、照準の中心（マゼンタ）とコア（緑の円）を細く描く
  const Z = 3;
  const IW = 240;
  const IH = 180;
  const canvas = Buffer.alloc(W * (H + IH * Z) * 3);
  d.copy(canvas);
  if (aim) {
    const ax = Math.round(aim.x) - IW / 2;
    const ay = Math.round(aim.y) - IH / 2;
    for (let y = 0; y < IH * Z; y++) {
      for (let x = 0; x < IW * Z; x++) {
        const sx = Math.min(W - 1, Math.max(0, ax + Math.floor(x / Z)));
        const sy = Math.min(H - 1, Math.max(0, ay + Math.floor(y / Z)));
        const si = (sy * W + sx) * 3;
        const di = ((H + y) * W + x) * 3;
        canvas[di] = img.data[si]!;
        canvas[di + 1] = img.data[si + 1]!;
        canvas[di + 2] = img.data[si + 2]!;
      }
    }
    const dot = (x: number, y: number, c: [number, number, number]): void => {
      x = Math.round(x);
      y = Math.round(y);
      if (x < 0 || y < H || x >= IW * Z || y >= H + IH * Z) return;
      const i = (y * W + x) * 3;
      canvas[i] = c[0];
      canvas[i + 1] = c[1];
      canvas[i + 2] = c[2];
    };
    const inset = (x: number, y: number): [number, number] => [(x - ax + 0.5) * Z, H + (y - ay + 0.5) * Z];
    const [mx, my] = inset(aim.x, aim.y);
    for (let t = -3; t <= 3; t++) {
      for (let o = -1; o <= 1; o++) {
        dot(mx + t, my + o, [255, 0, 255]);
        dot(mx + o, my + t, [255, 0, 255]);
      }
    }
    if (core) {
      const [cx, cy] = inset(core.x, core.y);
      for (let k = 0; k < 720; k++) {
        const a = (k * Math.PI) / 360;
        for (const dr of [0, 1, 2])
          dot(cx + (core.r * Z + dr) * Math.cos(a), cy + (core.r * Z + dr) * Math.sin(a), [0, 255, 0]);
      }
      for (let t = -3; t <= 3; t++) {
        dot(cx + t, cy, [0, 255, 0]);
        dot(cx, cy + t, [0, 255, 0]);
      }
    }
  }
  writeJpeg(canvas, W, H + IH * Z, join(debugDir, `f${frame}.jpg`), 960);
}

// ---------------------------------------------------------------------------------------------------------------------
// 本体

const fmt = (v: number | undefined, digits = 1): string =>
  v === undefined || !Number.isFinite(v) ? '' : v.toFixed(digits);

if (debugDir) mkdirSync(debugDir, { recursive: true });

console.error(`背景を作る（${bgFrom}〜${bgTo ?? '末尾'}、${bgStep}f ごと）…`);
const { bg, used, seen } = await buildBackground(video, bgFrom, bgTo, bgStep);
console.error(`背景: 戦闘中のフレーム ${used} / ${seen} の中央値`);
if (debugDir) writeJpeg(bg, HALF_W, HALF_H, join(debugDir, 'background.jpg'), HALF_W);

const header = [
  'frame',
  'aim_x',
  'aim_y',
  'aim_conf',
  'aim_color',
  'aim_type',
  'aim_size',
  'aim_redmark',
  'core_x',
  'core_y',
  'core_r',
  'core_hot',
  'hitmark',
  'dx',
  'dy',
  'tgt_x0',
  'tgt_y0',
  'tgt_x1',
  'tgt_y1',
  'tgt_w',
  'tgt_h',
  'tgt_cx',
  'tgt_cy',
  'tgt_area',
  'tgt_band_w',
  'tgt_clipped',
  'fx',
];
const rows: string[] = [header.join(',')];
let total = 0;
let nAim = 0;
let nCore = 0;
let nTarget = 0;
for await (const { frame, img } of readFrames(video, from, to, step)) {
  total += 1;
  const { aim } = findAim(img);
  const core = aim ? findCore(img, aim) : null;
  const target = aim ? findTarget(toHalfField(img, 0), bg, aim) : null;
  if (aim) nAim += 1;
  if (core) nCore += 1;
  if (target) nTarget += 1;
  rows.push(
    [
      frame,
      fmt(aim?.x),
      fmt(aim?.y),
      fmt(aim?.conf, 2),
      aim?.color ?? '',
      aim?.type ?? '',
      fmt(aim?.size),
      aim?.type === 'ring' ? (aim.redMarks ? 1 : 0) : '',
      fmt(core?.x),
      fmt(core?.y),
      fmt(core?.r),
      core?.area ?? '',
      aim ? hitMarker(img, aim) : '',
      aim && core ? fmt(aim.x - core.x) : '',
      aim && core ? fmt(aim.y - core.y) : '',
      target?.x0 ?? '',
      target?.y0 ?? '',
      target?.x1 ?? '',
      target?.y1 ?? '',
      target ? target.x1 - target.x0 : '',
      target ? target.y1 - target.y0 : '',
      target ? (target.x0 + target.x1) / 2 : '',
      target ? (target.y0 + target.y1) / 2 : '',
      target?.area ?? '',
      fmt(target?.bandW, 0),
      target ? (target.clipped ? 1 : 0) : '',
      fmt(target?.fx, 2),
    ].join(','),
  );
  drawDebug(img, frame, aim, core, target);
}

const text = rows.join('\n') + '\n';
if (values.csv) writeFileSync(values.csv, text);
else process.stdout.write(text);
console.error(`${total} フレーム: 照準 ${nAim}・コア ${nCore}・的 ${nTarget}`);
