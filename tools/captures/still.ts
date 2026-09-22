// フレーム番号を指定して静止画を切り出す（証拠フレームの作成用）。
//   node tools/captures/still.ts <動画> --frame 1234 --out out.png [--crop x,y,w,h] [--scale 960]
// -ss（時間指定）ではなく select=eq(n,N) を使う。録画にはフレーム落ちがあり、
// 時間とフレーム番号が比例しないため、番号で取らないと解析結果と対応が取れない。
import { parseArgs } from 'node:util';
import { parseCrop, writeStill } from './ffmpeg.ts';

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

writeStill(video, Number(values.frame), values.out, {
  crop: values.crop ? parseCrop(values.crop) : undefined,
  scale: values.scale ? Number(values.scale) : undefined,
});
