// フレーム番号を指定して静止画を切り出す（証拠フレームの作成用）。
//   node tools/captures/still.ts <動画> --frame 1234 --out out.png [--crop x,y,w,h] [--scale 960]
// -ss（時間指定）ではなく select=eq(n,N) を使う。録画にはフレーム落ちがあり、
// 時間とフレーム番号が比例しないため、番号で取らないと解析結果と対応が取れない。
// 証拠フレームの置き場所（<録画の置き場所>/frames/）に切り出したら、Drive の nikke_project_captures/frames/ にも上げる
// （道具の終わりの同期。plan/design-cloud-environment.md 4.2 節）。上げられなくても切り出しは済んでいて、次の同期で上がる。
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { parseCrop, writeStill } from './ffmpeg.ts';
import { uploadFrame } from './frames-upload.ts';

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

// 出力先のフォルダが無ければ作る（クラウドの新しい VM には frames/ が無い。2026-10-23 の通しの試験）
mkdirSync(dirname(values.out), { recursive: true });
writeStill(video, Number(values.frame), values.out, {
  crop: values.crop ? parseCrop(values.crop) : undefined,
  scale: values.scale ? Number(values.scale) : undefined,
});

uploadFrame(values.out);
