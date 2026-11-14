// 録画の中から「一時停止 / 戦闘履歴」パネルを探し、キャラ名の読めるフレームを切り出す。
//   node tools/captures/probe-result.ts <動画...> [--list] [--out-dir DIR] [--step 15] [--samples 3] [--tail 15] [--full]
//
// 立ち絵・ポートレートでのキャラ同定は当てにならない（実際に 2 回取り違えている）。
// このパネルには枠順・クラス・**キャラ名**・LV・戦闘力・与ダメージ総計が文字で出るので、
// 台帳に書く前の裏取りに使う。戦闘中に ESC で出る「一時停止」と、戦闘終了後の
// 「戦闘履歴」はレイアウトが同じで、画面上の位置もほぼ固定。
//
// 検出（暗幕 + 青いヘッダー帯の AND）は probe-result-lib.ts にある。
//
// パネルは録画を止める前に映す（plan/captures/protocol.md「撮る（射撃場）」の 3）ので、まず末尾の --tail 秒だけを走査し、
// 見つからなければ頭から全部を走査する（--full で初めから全部。plan/design-workflow-simplification-14.md 2 節）。末尾で見つかったときは
// 末尾の区間だけを出すので、途中の一時停止のパネルも見るときは --full。フレームの番号は、どちらでも録画の頭から数える（末尾の走査は
// ffprobe の全体の枚数から引く。全体の枚数が分からない録画は頭から全部を走査する）。
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
  tailOffset,
  type Run as Span,
} from './probe-result-lib.ts';

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
    tail: { type: 'string', default: '15' },
    full: { type: 'boolean', default: false },
  },
});

if (positionals.length === 0) {
  console.error(
    'usage: node tools/captures/probe-result.ts <動画...> [--list] [--out-dir DIR] [--samples 3] [--tail 15] [--full]',
  );
  process.exit(1);
}

const step = Math.max(1, Number(values.step));
const sampleCount = Math.max(1, Number(values.samples));
const contrastThreshold = Number(values.contrast);
const blueThreshold = Number(values.blue) / 100;
const tailSeconds = Number(values.tail);

const FRAME_BYTES = PANEL_DETECT.w * PANEL_DETECT.h * 3;

/** 縮小した rgb24 の画を読む ffmpeg の引数。seek は -i の前の引数、select は縮小の前のフィルタ */
function detectArgs(video: string, seek: string[], select: string[]): string[] {
  const filters = [...select, `scale=${PANEL_DETECT.w}:${PANEL_DETECT.h}`, 'format=rgb24'];
  return ['-v', 'error', ...seek, '-i', video, '-vf', filters.join(','), '-fps_mode', 'vfr', '-f', 'rawvideo', '-'];
}

async function scan(video: string): Promise<Sample[]> {
  const args = detectArgs(video, [], [`select='not(mod(n,${step}))'`]);
  const samples: Sample[] = [];
  let index = 0;
  for await (const frame of rawFrames(args, FRAME_BYTES)) {
    samples.push({ frame: index * step, ...measurePanel(frame) });
    index += 1;
  }
  return samples;
}

/**
 * 末尾の seconds 秒を走査する。末尾から読んだ枚数で頭からの番号に直すので、select で間引かずに全部を読む（縮小した画なので軽い）。
 * offset は走査の頭のフレームの番号。頭からの番号に直せなければ null
 */
async function scanTail(
  video: string,
  seconds: number,
  totalFrames: number,
): Promise<{ samples: Sample[]; offset: number } | null> {
  const args = detectArgs(video, ['-sseof', `-${seconds}`], []);
  const local: Sample[] = [];
  let index = 0;
  for await (const frame of rawFrames(args, FRAME_BYTES)) {
    if (index % step === 0) local.push({ frame: index, ...measurePanel(frame) });
    index += 1;
  }
  const offset = tailOffset(totalFrames, index);
  return offset === null ? null : { samples: local.map((s) => ({ ...s, frame: s.frame + offset })), offset };
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

  // 末尾で見つかったときだけ、切り出しも末尾から読む（頭から数えた番号を、末尾の走査の番号に戻して渡す）
  let tail: { samples: Sample[]; offset: number } | null = null;
  if (!values.full && tailSeconds > 0 && probe.nbFrames > 0) {
    tail = await scanTail(video, tailSeconds, probe.nbFrames);
    if (tail !== null && toRuns(tail.samples).length === 0) {
      console.log(`末尾の ${tailSeconds} 秒にパネルが無いので、頭から全部を走査する`);
      tail = null;
    }
  }
  const samples = tail?.samples ?? (await scan(video));
  const runs = toRuns(samples);
  const range = tail === null ? '' : `（末尾の ${tailSeconds} 秒。f${tail.offset} から）`;
  console.log(
    `${probe.nbFrames} フレーム / ${probe.avgFps.toFixed(2)} fps / ${step} フレームおきに ${samples.length} 点を判定${range}`,
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
      const still = { crop, scale: Number(values.scale), quality: 3 };
      if (tail === null) writeStill(video, frame, out, still);
      else writeStill(video, frame - tail.offset, out, { ...still, fromEnd: tailSeconds });
      console.log(`  ${out}`);
    }
  }
}
