// フレーム番号を指定して静止画を切り出す（証拠フレームの作成用）。
//   node tools/captures/still.ts <動画> --frame 1234 --out out.png [--crop x,y,w,h] [--scale 960]
// -ss（時間指定）ではなく select=eq(n,N) を使う。録画にはフレーム落ちがあり、
// 時間とフレーム番号が比例しないため、番号で取らないと解析結果と対応が取れない。
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { cropFilter, parseCrop } from './ffmpeg.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    frame: { type: 'string' },
    out: { type: 'string' },
    crop: { type: 'string' },
    scale: { type: 'string' },
  },
});

const video = positionals[0];
if (!video || !values.frame || !values.out) {
  console.error('usage: node tools/captures/still.ts <動画> --frame N --out out.png [--crop x,y,w,h] [--scale W]');
  process.exit(1);
}

// コンマをフィルタ区切りと解釈させないよう、式全体を単引用符で囲む。
const filters = [`select='eq(n,${Number(values.frame)})'`];
if (values.crop) filters.push(cropFilter(parseCrop(values.crop)));
if (values.scale) filters.push(`scale=${Number(values.scale)}:-1:flags=lanczos`);

const result = spawnSync(
  'ffmpeg',
  ['-v', 'error', '-i', video, '-vf', filters.join(','), '-fps_mode', 'vfr', '-frames:v', '1', '-y', values.out],
  { stdio: 'inherit' },
);
process.exit(result.status ?? 1);
