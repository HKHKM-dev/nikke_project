// 指定領域のフレーム間差分を測り、発射・着弾・HUD 更新のような「変化」をフレーム番号で拾う。
//   node tools/captures/diff.ts <動画> --crop x,y,w,h [--from N] [--to N] [--peaks] [--csv out.csv]
// 使い分け（2026-09-22 の較正で有効だった領域）:
//   SR/RL … 手元（反動）  AR … 同じ手元のパルス列  MG/SMG … HUD 総ダメージカウンター
// 残弾カウンターは数字がロール表示されて毎フレーム変化するので使えない。
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { cropFilter, ffprobe, parseCrop, rawFrames } from './ffmpeg.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    crop: { type: 'string' },
    from: { type: 'string' },
    to: { type: 'string' },
    downscale: { type: 'string', default: '160' },
    peaks: { type: 'boolean', default: false },
    sigma: { type: 'string', default: '3' },
    'min-gap': { type: 'string', default: '3' },
    csv: { type: 'string' },
  },
});

const video = positionals[0];
if (!video || !values.crop) {
  console.error(
    'usage: node tools/captures/diff.ts <動画> --crop x,y,w,h [--from N] [--to N] [--peaks] [--csv out.csv]',
  );
  process.exit(1);
}

const crop = parseCrop(values.crop);
const probe = ffprobe(video);
const from = values.from ? Number(values.from) : 0;
const to = values.to ? Number(values.to) : Math.max(0, probe.nbFrames - 1);

const width = Number(values.downscale);
const height = Math.max(2, 2 * Math.round(crop.h * (width / crop.w) * 0.5));
const frameBytes = width * height;

// フィルタ引数のコンマは ffmpeg 側でフィルタ区切りと解釈されるので、式全体を単引用符で囲む。
const filters = [`select='between(n,${from},${to})'`, cropFilter(crop), `scale=${width}:${height}`, 'format=gray'];
const args = ['-v', 'error', '-i', video, '-vf', filters.join(','), '-fps_mode', 'vfr', '-f', 'rawvideo', '-'];

const diffs: number[] = [];
let previous: Buffer | null = null;
for await (const frame of rawFrames(args, frameBytes)) {
  if (previous) {
    let sum = 0;
    for (let i = 0; i < frameBytes; i += 1) sum += Math.abs(frame[i]! - previous[i]!);
    diffs.push(sum / frameBytes);
  }
  previous = Buffer.from(frame);
}

// diffs[i] は「フレーム (from + i) と (from + i + 1) の差」。変化した後のフレーム番号を返す。
const frameOf = (i: number) => from + i + 1;

if (values.csv) {
  const lines = ['frame,diff', ...diffs.map((d, i) => `${frameOf(i)},${d.toFixed(4)}`)];
  writeFileSync(values.csv, lines.join('\n') + '\n');
  console.error(`wrote ${values.csv} (${diffs.length} rows)`);
}

const mean = diffs.reduce((a, b) => a + b, 0) / (diffs.length || 1);
const std = Math.sqrt(diffs.reduce((a, b) => a + (b - mean) ** 2, 0) / (diffs.length || 1));
console.log(`frames ${from}..${to} / 解析 ${diffs.length} 差分 / 平均 ${mean.toFixed(3)} / 標準偏差 ${std.toFixed(3)}`);

if (!values.peaks) process.exit(0);

const threshold = mean + Number(values.sigma) * std;
const minGap = Number(values['min-gap']);
const candidates = diffs
  .map((d, i) => ({ i, d }))
  .filter(({ d }) => d >= threshold)
  .sort((a, b) => b.d - a.d);

const picked: number[] = [];
for (const { i } of candidates) {
  if (picked.every((p) => Math.abs(p - i) >= minGap)) picked.push(i);
}
picked.sort((a, b) => a - b);

const frames = picked.map(frameOf);
const intervals = frames.slice(1).map((f, i) => f - frames[i]!);
const histogram = new Map<number, number>();
for (const gap of intervals) histogram.set(gap, (histogram.get(gap) ?? 0) + 1);

console.log(`閾値 ${threshold.toFixed(3)} (平均 + ${values.sigma}σ) / 最小間隔 ${minGap}f`);
console.log(`検出 ${frames.length} 件: ${frames.join(' ')}`);
console.log(`間隔: ${intervals.join(' ')}`);
console.log(
  `間隔の分布: ${[...histogram.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([gap, n]) => `${gap}f×${n}`)
    .join(', ')}`,
);
