// 左のスキルの帯（「スキル2 ○○」）が出たフレームを、欄の明るさの立ち上がりで拾う（V-0313）。
// 周期のスキルの発動（帯）と倍率ダメージのヒット（HUD の増分）の差を読むのに使う。多人数の録画では、ほかのキャラの帯も
// 同じ欄に出るので、ヒットごとに窓の中の立ち上がりを全部挙げ、帯の文字を still.ts などで確かめる。
//   node tools/captures/banner.ts <動画> --from N --to N [--crop 0,578,100,36]          # 区間の立ち上がり
//   node tools/captures/banner.ts <動画> --hits f1,f2,... [--window 140] [--crop ...]    # ヒットごとの立ち上がりとの差 D
//   --mode white: 明るさの代わりに、帯の文字の部分（既定 crop 120,582,80,28）の白っぽい画素（帯の地）の数が 200 を越えたフレームを拾う。
//   操作キャラが撃つ録画で、マズルフラッシュ（黄色・橙）を帯と取り違えない（V-0325）。帯の立ち上がりより約 4f 遅い
import { parseArgs } from 'node:util';
import { bannerRises, risesBeforeHits, whiteOnsets, whitePixels } from './banner-lib.ts';
import { cropFilter, parseCrop, rawFrames } from './ffmpeg.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    from: { type: 'string' },
    to: { type: 'string' },
    hits: { type: 'string' },
    window: { type: 'string', default: '140' },
    crop: { type: 'string' },
    mode: { type: 'string', default: 'brightness' },
  },
});
const video = positionals[0];
if (video === undefined || (values.hits === undefined && (values.from === undefined || values.to === undefined))) {
  console.error(
    'usage: node tools/captures/banner.ts <動画> (--from N --to N | --hits f1,f2,... [--window 140]) [--crop x,y,w,h]',
  );
  process.exit(1);
}
const white = values.mode === 'white';
const crop = parseCrop(values.crop ?? (white ? '120,582,80,28' : '0,578,100,36'));

/** 区間 [a, b] の欄の灰色の平均の明るさ */
async function brightness(a: number, b: number): Promise<[number, number][]> {
  const args = ['-v', 'error', '-i', video!, '-vf', `select='between(n\\,${a}\\,${b})',${cropFilter(crop)}`];
  args.push(
    '-fps_mode',
    'passthrough',
    '-frames:v',
    String(b - a + 1),
    '-f',
    'rawvideo',
    '-pix_fmt',
    white ? 'rgb24' : 'gray',
    'pipe:1',
  );
  const out: [number, number][] = [];
  let n = a;
  for await (const frame of rawFrames(args, crop.w * crop.h * (white ? 3 : 1))) {
    if (white) out.push([n, whitePixels(frame)]);
    else {
      let sum = 0;
      for (let i = 0; i < frame.length; i++) sum += frame[i]!;
      out.push([n, sum / frame.length]);
    }
    n++;
  }
  return out;
}

const onsets = (series: [number, number][]) => (white ? whiteOnsets(series) : bannerRises(series));

if (values.hits !== undefined) {
  const hits = values.hits.split(',').map(Number);
  const window = Number(values.window);
  for (const hit of hits) {
    const rises = onsets(await brightness(hit - window - 1, hit + 8));
    const [row] = risesBeforeHits(rises, [hit], window);
    console.log(`${hit}: D ${row!.ds.join(' ') || '-'}`);
  }
} else {
  console.log(onsets(await brightness(Number(values.from), Number(values.to))).join(' '));
}
