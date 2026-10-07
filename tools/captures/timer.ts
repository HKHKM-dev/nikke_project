// 画面右上の残り時間（MM:SS）の秒の 1 の位が変わったフレームを拾い、残り時間 1 秒あたりの動画のフレーム数を出す
// （V-0002・V-0003）。数字は読まず、2 値にした画像が変わったフレームだけを見る。秒の値は、離れた 2 フレームの
// 表示を still.ts などで目で読んで決める。
//   node tools/captures/timer.ts <動画...> [--mode summary|changes] [--crop 1852,26,14,18] [--threshold 90]
//
// mode:
//   summary  変わり目の間隔のうち 56〜62f の平均（ふだんの比）と、62〜150f の間隔（長い間隔）の数と長くなった分の合計。
//            117〜123f は 2 秒分の拾いそこねとして 2 で割る
//   changes  変わり目のフレームと、前の変わり目からの間隔
import { parseArgs } from 'node:util';
import { cropFilter, parseCrop, rawFrames } from './ffmpeg.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    crop: { type: 'string', default: '1852,26,14,18' },
    mode: { type: 'string', default: 'summary' },
    threshold: { type: 'string', default: '90' },
  },
});
if (positionals.length === 0) {
  console.error(
    'usage: node tools/captures/timer.ts <動画...> [--mode summary|changes] [--crop x,y,w,h] [--threshold 90]',
  );
  process.exit(1);
}
const crop = parseCrop(values.crop);
const threshold = Number(values.threshold);
/** 変わったとみなす画素数 */
const MIN_DIFF = 12;
/** 数字が写っているとみなす画素数（HUD が出る前の画面を除く） */
const MIN_ON = 15;
/** これより近い変わり目は 1 つにまとめる（数字の切り替わりの中間フレーム） */
const MERGE = 8;

async function changes(video: string): Promise<number[]> {
  const args = ['-v', 'error', '-i', video, '-vf', cropFilter(crop), '-fps_mode', 'passthrough'];
  args.push('-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1');
  const size = crop.w * crop.h;
  let prev: Uint8Array | null = null;
  const out: number[] = [];
  let n = 0;
  for await (const rgb of rawFrames(args, size * 3)) {
    const bin = new Uint8Array(size);
    let on = 0;
    for (let i = 0; i < size; i++) {
      bin[i] = Math.min(rgb[i * 3]!, rgb[i * 3 + 1]!, rgb[i * 3 + 2]!) > threshold ? 1 : 0;
      on += bin[i]!;
    }
    if (prev !== null && on > MIN_ON) {
      let diff = 0;
      for (let i = 0; i < size; i++) diff += bin[i] !== prev[i] ? 1 : 0;
      if (diff > MIN_DIFF && (out.length === 0 || n - out[out.length - 1]! > MERGE)) out.push(n);
    }
    prev = bin;
    n++;
  }
  return out;
}

function summary(frames: number[]): string {
  const gaps = frames.slice(1).map((f, i) => ({ at: frames[i]!, d: f - frames[i]! }));
  const normal = gaps.filter((g) => g.d >= 56 && g.d <= 62);
  const doubled = gaps.filter((g) => g.d >= 117 && g.d <= 123);
  const long = gaps.filter((g) => g.d > 62 && g.d <= 150 && !(g.d >= 117 && g.d <= 123));
  const sum = normal.reduce((a, g) => a + g.d, 0) + doubled.reduce((a, g) => a + g.d, 0);
  const rate = sum / (normal.length + 2 * doubled.length);
  const excess = long.reduce((a, g) => a + (g.d - rate * Math.max(1, Math.floor(g.d / rate))), 0);
  const first = normal[0]?.at ?? frames[0];
  const last =
    normal.length > 0 ? normal[normal.length - 1]!.at + normal[normal.length - 1]!.d : frames[frames.length - 1];
  return [
    `ふだんの比 ${rate.toFixed(3)} f/秒（${normal.length} 間隔 + 2 秒分 ${doubled.length}）`,
    `長い間隔 ${long.length} 個・長くなった分 ${excess.toFixed(0)}f`,
    `ふだんの間隔の最初 ${first}・最後 ${last}`,
    long.length > 0 ? `長い間隔の位置 ${long.map((g) => `${g.at}(+${g.d})`).join(' ')}` : '',
  ]
    .filter((s) => s !== '')
    .join('\n  ');
}

for (const video of positionals) {
  const frames = await changes(video);
  const name = video.split(/[\\/]/).pop();
  if (values.mode === 'changes') {
    console.log(`${name}\n  ${frames.map((f, i) => (i === 0 ? `${f}` : `${f}(+${f - frames[i - 1]!})`)).join(' ')}`);
  } else {
    console.log(`${name}\n  ${summary(frames)}`);
  }
}
