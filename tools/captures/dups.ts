// 前のフレームと同じ画（重複フレーム）を拾う（V-0004）。画面全体を縮小した灰色の画像で、前のフレームとの差の
// 平均がしきい値より小さいフレームを重複とみなす。描画が 60FPS に間に合わない場面で、録画が同じ画を重ねたもの。
//   node tools/captures/dups.ts <動画> [--from N] [--to N] [--threshold 0.15] [--mode summary|list|diff]
//
// mode:
//   summary  区間のフレーム数・重複フレーム数と、重複の続く区間（3 フレーム以上）の一覧
//   list     重複フレームの番号
//   diff     フレームごとの差の平均（しきい値を決めるとき用）
import '../../packages/core/scripts/below-normal.ts';
import { parseArgs } from 'node:util';
import { rawFrames } from './ffmpeg.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    from: { type: 'string', default: '0' },
    to: { type: 'string' },
    threshold: { type: 'string', default: '0.15' },
    mode: { type: 'string', default: 'summary' },
  },
});
const video = positionals[0];
if (!video) {
  console.error(
    'usage: node tools/captures/dups.ts <動画> [--from N] [--to N] [--threshold 0.15] [--mode summary|list|diff]',
  );
  process.exit(1);
}
const W = 192;
const H = 108;
const first = Number(values.from);
const last = values.to === undefined ? undefined : Number(values.to);
const threshold = Number(values.threshold);

const select = last === undefined ? `gte(n\\,${first})` : `between(n\\,${first}\\,${last})`;
const args = [
  '-v',
  'error',
  '-i',
  video,
  '-vf',
  `select='${select}',scale=${W}:${H}:flags=area`,
  '-fps_mode',
  'passthrough',
];
if (last !== undefined) args.push('-frames:v', String(last - first + 1));
args.push('-f', 'rawvideo', '-pix_fmt', 'gray', 'pipe:1');

let prev: Buffer | null = null;
let n = first;
const dups: number[] = [];
for await (const frame of rawFrames(args, W * H)) {
  if (prev !== null) {
    let sum = 0;
    for (let i = 0; i < W * H; i++) sum += Math.abs(frame[i]! - prev[i]!);
    const mean = sum / (W * H);
    if (values.mode === 'diff') console.log(`${n}\t${mean.toFixed(3)}`);
    if (mean < threshold) dups.push(n);
  }
  prev = Buffer.from(frame);
  n++;
}

if (values.mode === 'list') console.log(dups.join(' '));
if (values.mode === 'summary') {
  const runs: [number, number][] = [];
  for (const d of dups) {
    const r = runs[runs.length - 1];
    if (r !== undefined && d === r[1] + 1) r[1] = d;
    else runs.push([d, d]);
  }
  console.log(`フレーム ${first}〜${n - 1}（${n - first}）・重複 ${dups.length}`);
  const long = runs.filter(([a, b]) => b - a + 1 >= 3);
  if (long.length > 0)
    console.log(`3 フレーム以上続く重複: ${long.map(([a, b]) => `${a}-${b}(${b - a + 1})`).join(' ')}`);
}
