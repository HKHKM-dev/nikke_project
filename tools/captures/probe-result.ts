// 録画の中から「一時停止 / 戦闘履歴」パネルを探し、キャラ名の読めるフレームを切り出す。
//   node tools/captures/probe-result.ts <動画...> [--list] [--out-dir DIR] [--step 15] [--samples 3]
//
// 立ち絵・ポートレートでのキャラ同定は当てにならない（実際に 2 回取り違えている）。
// このパネルには枠順・クラス・**キャラ名**・LV・戦闘力・与ダメージ総計が文字で出るので、
// 台帳に書く前の裏取りに使う。戦闘中に ESC で出る「一時停止」と、戦闘終了後の
// 「戦闘履歴」はレイアウトが同じで、画面上の位置もほぼ固定。
//
// 検出（暗幕 + 青いヘッダー帯の AND）は result-screen-lib.ts にあり、result-screen.ts（リザルト画面の読み取り）と共通。
//
// 切り出した画像の文字は OCR せず目視で読む。名前欄は長いと横スクロールで切れるので
// （録画 0021 のクイーン（真）は「ーン（真）」しか写らないフレームがある）、
// 1 区間から複数枚サンプルする。
import { mkdirSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { ffprobe, parseCrop, rawFrames, writeStill } from './ffmpeg.ts';
import {
  PANEL_CROP,
  PANEL_DETECT,
  PANEL_THRESHOLDS,
  isPanel,
  measurePanel,
  runsOf,
  scaleCrop,
  type PanelFeatures,
  type Run as Span,
} from './result-screen-lib.ts';

type Sample = { frame: number } & PanelFeatures;
type Run = Span & PanelFeatures;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    list: { type: 'boolean', default: false },
    'out-dir': { type: 'string', default: '.' },
    step: { type: 'string', default: '15' },
    samples: { type: 'string', default: '3' },
    contrast: { type: 'string', default: String(PANEL_THRESHOLDS.contrast) },
    blue: { type: 'string', default: String(PANEL_THRESHOLDS.blue * 100) },
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

async function scan(video: string): Promise<Sample[]> {
  const filters = [`select='not(mod(n,${step}))'`, `scale=${PANEL_DETECT.w}:${PANEL_DETECT.h}`, 'format=rgb24'];
  const args = ['-v', 'error', '-i', video, '-vf', filters.join(','), '-fps_mode', 'vfr', '-f', 'rawvideo', '-'];
  const samples: Sample[] = [];
  let index = 0;
  for await (const frame of rawFrames(args, PANEL_DETECT.w * PANEL_DETECT.h * 3)) {
    samples.push({ frame: index * step, ...measurePanel(frame) });
    index += 1;
  }
  return samples;
}

/** 閾値を超えたサンプルの区間と、区間の中の特徴の最大 */
function toRuns(samples: Sample[]): Run[] {
  const threshold = { contrast: contrastThreshold, blue: blueThreshold };
  return runsOf(samples, (s) => isPanel(s, threshold)).map((r) => {
    const inRun = samples.filter((s) => s.frame >= r.from && s.frame <= r.to);
    return {
      ...r,
      contrast: Math.max(...inRun.map((s) => s.contrast)),
      blue: Math.max(...inRun.map((s) => s.blue)),
    };
  });
}

/**
 * 区間から切り出すフレームを選ぶ。名前欄が横スクロールするので区間全体に散らす。
 * 開閉のアニメーション中を避けるため、両端は使わず (i + 1) / (n + 1) の位置を取る。
 */
function pickFrames(run: Run): number[] {
  const length = run.to - run.from;
  return Array.from({ length: sampleCount }, (_, i) => run.from + Math.round((length * (i + 1)) / (sampleCount + 1)));
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

  const crop = values.crop ? parseCrop(values.crop) : scaleCrop(PANEL_CROP, probe.width, probe.height);
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
