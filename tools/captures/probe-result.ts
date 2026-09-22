// 録画の中から「一時停止 / 戦闘履歴」パネルを探し、キャラ名の読めるフレームを切り出す。
//   node tools/captures/probe-result.ts <動画...> [--list] [--out-dir DIR] [--step 15] [--samples 3]
//
// 立ち絵・ポートレートでのキャラ同定は当てにならない（実際に 2 回取り違えている）。
// このパネルには枠順・クラス・**キャラ名**・LV・戦闘力・与ダメージ総計が文字で出るので、
// 台帳に書く前の裏取りに使う。戦闘中に ESC で出る「一時停止」と、戦闘終了後の
// 「戦闘履歴」はレイアウトが同じで、画面上の位置もほぼ固定。
//
// 検出は 2 つの特徴の AND:
//   1. 中央のカードが明るく、周囲が暗い（パネルが開くと背景が暗幕になる）
//   2. カード上部に青いヘッダー帯がある（これが無いと射撃場の出撃画面を拾ってしまう）
// 実測（録画 04・17・21）では パネル 60〜87% に対し 出撃画面・戦闘中は 0〜24% と離れている。
//
// 切り出した画像の文字は OCR せず目視で読む。名前欄は長いと横スクロールで切れるので
// （録画 21 のクイーン（真）は「ーン（真）」しか写らないフレームがある）、
// 1 区間から複数枚サンプルする。
import { mkdirSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { type Crop, ffprobe, parseCrop, rawFrames, writeStill } from './ffmpeg.ts';

/** 判定用の縮小サイズ。パネルが開いているかが分かれば十分なので粗くてよい */
const DETECT_W = 64;
const DETECT_H = 36;

/** パネル内部の白いカード（画面サイズに対する割合） */
const CARD = { x0: 0.37, y0: 0.22, x1: 0.64, y1: 0.85 };
/** パネル上部の青いヘッダー帯（画面サイズに対する割合） */
const HEADER = { x0: 0.36, y0: 0.03, x1: 0.65, y1: 0.2 };

/** 既定の切り出し範囲（1920×1080 基準）。一時停止・戦闘履歴のどちらも収まる */
const DEFAULT_CROP: Crop = { x: 640, y: 40, w: 660, h: 990 };
const DEFAULT_CROP_BASE = { width: 1920, height: 1080 };

type Sample = { frame: number; contrast: number; blue: number };
type Run = { from: number; to: number; contrast: number; blue: number };

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    list: { type: 'boolean', default: false },
    'out-dir': { type: 'string', default: '.' },
    step: { type: 'string', default: '15' },
    samples: { type: 'string', default: '3' },
    contrast: { type: 'string', default: '60' },
    blue: { type: 'string', default: '40' },
    crop: { type: 'string' },
    scale: { type: 'string', default: '900' },
  },
});

if (positionals.length === 0) {
  console.error('usage: node tools/captures/probe-result.ts <動画...> [--list] [--out-dir DIR] [--samples 3]');
  process.exit(1);
}

const step = Math.max(1, Number(values.step));
const sampleCount = Math.max(1, Number(values.samples));
const contrastThreshold = Number(values.contrast);
const blueThreshold = Number(values.blue) / 100;

/** 縮小フレームを走査して、カードの明暗差と青ヘッダーの占有率を出す */
function measure(frame: Buffer): { contrast: number; blue: number } {
  const px = (v: number, n: number) => Math.round(v * n);
  const card = { x0: px(CARD.x0, DETECT_W), x1: px(CARD.x1, DETECT_W), y0: px(CARD.y0, DETECT_H), y1: px(CARD.y1, DETECT_H) }; // prettier-ignore
  const head = { x0: px(HEADER.x0, DETECT_W), x1: px(HEADER.x1, DETECT_W), y0: px(HEADER.y0, DETECT_H), y1: px(HEADER.y1, DETECT_H) }; // prettier-ignore

  let inner = 0;
  let innerCount = 0;
  let outer = 0;
  let outerCount = 0;
  let blueHit = 0;
  let blueCount = 0;
  for (let y = 0; y < DETECT_H; y += 1) {
    for (let x = 0; x < DETECT_W; x += 1) {
      const offset = (y * DETECT_W + x) * 3;
      const r = frame[offset]!;
      const g = frame[offset + 1]!;
      const b = frame[offset + 2]!;
      const luma = (r * 299 + g * 587 + b * 114) / 1000;
      if (x >= card.x0 && x < card.x1 && y >= card.y0 && y < card.y1) {
        inner += luma;
        innerCount += 1;
      } else {
        outer += luma;
        outerCount += 1;
      }
      if (x >= head.x0 && x < head.x1 && y >= head.y0 && y < head.y1) {
        blueCount += 1;
        // NIKKE のパネルのヘッダーは彩度の高い青。背景の暗幕や白いカードとは離れている。
        if (b > r + 40 && b > 110) blueHit += 1;
      }
    }
  }
  return { contrast: inner / innerCount - outer / outerCount, blue: blueHit / blueCount };
}

async function scan(video: string): Promise<Sample[]> {
  const filters = [`select='not(mod(n,${step}))'`, `scale=${DETECT_W}:${DETECT_H}`, 'format=rgb24'];
  const args = ['-v', 'error', '-i', video, '-vf', filters.join(','), '-fps_mode', 'vfr', '-f', 'rawvideo', '-'];
  const samples: Sample[] = [];
  let index = 0;
  for await (const frame of rawFrames(args, DETECT_W * DETECT_H * 3)) {
    samples.push({ frame: index * step, ...measure(frame) });
    index += 1;
  }
  return samples;
}

/** 閾値を超えたサンプルを、連続したものどうしでまとめる */
function toRuns(samples: Sample[]): Run[] {
  const runs: Run[] = [];
  let current: Run | null = null;
  for (const s of samples) {
    const hit = s.contrast >= contrastThreshold && s.blue >= blueThreshold;
    if (hit) {
      if (current === null) current = { from: s.frame, to: s.frame, contrast: s.contrast, blue: s.blue };
      else {
        current.to = s.frame;
        current.contrast = Math.max(current.contrast, s.contrast);
        current.blue = Math.max(current.blue, s.blue);
      }
    } else if (current !== null) {
      runs.push(current);
      current = null;
    }
  }
  if (current !== null) runs.push(current);
  return runs;
}

/**
 * 区間から切り出すフレームを選ぶ。名前欄が横スクロールするので区間全体に散らす。
 * 開閉のアニメーション中を避けるため、両端は使わず (i + 1) / (n + 1) の位置を取る。
 */
function pickFrames(run: Run): number[] {
  const length = run.to - run.from;
  return Array.from({ length: sampleCount }, (_, i) => run.from + Math.round((length * (i + 1)) / (sampleCount + 1)));
}

function scaledDefaultCrop(width: number, height: number): Crop {
  const sx = width / DEFAULT_CROP_BASE.width;
  const sy = height / DEFAULT_CROP_BASE.height;
  return {
    x: Math.round(DEFAULT_CROP.x * sx),
    y: Math.round(DEFAULT_CROP.y * sy),
    w: Math.round(DEFAULT_CROP.w * sx),
    h: Math.round(DEFAULT_CROP.h * sy),
  };
}

for (const video of positionals) {
  const probe = ffprobe(video);
  const stem = basename(video, extname(video));
  console.log(`\n=== ${basename(video)} ===`);

  const samples = await scan(video);
  const runs = toRuns(samples);
  console.log(
    `${probe.nbFrames} フレーム / ${probe.avgFps.toFixed(2)} fps / ${step} フレームおきに ${samples.length} 点を判定`,
  );

  if (runs.length === 0) {
    const best = samples.reduce((a, b) => (b.contrast > a.contrast ? b : a), samples[0]!);
    console.log('パネルの写っている区間は見つからなかった。');
    console.log(
      `最もそれらしいフレーム: f${best.frame}（明暗差 ${best.contrast.toFixed(0)} / 青ヘッダー ${(best.blue * 100).toFixed(0)}%）`,
    );
    continue;
  }

  const crop = values.crop ? parseCrop(values.crop) : scaledDefaultCrop(probe.width, probe.height);
  if (!values.list) mkdirSync(values['out-dir'], { recursive: true });

  for (const [i, run] of runs.entries()) {
    // 区間の境界は step の粒度でしか分からない（±step フレームの誤差がある）。
    const seconds = ((run.to - run.from + step) / (probe.avgFps || 60)).toFixed(1);
    console.log(
      `区間 ${i + 1}: f${run.from}..${run.to}（約 ${seconds} 秒 / 明暗差 ${run.contrast.toFixed(0)} / 青ヘッダー ${(run.blue * 100).toFixed(0)}%）`,
    );
    if (values.list) continue;
    for (const frame of pickFrames(run)) {
      const out = join(values['out-dir'], `${stem}_f${frame}_panel.jpg`);
      writeStill(video, frame, out, { crop, scale: Number(values.scale), quality: 3 });
      console.log(`  ${out}`);
    }
  }
}
