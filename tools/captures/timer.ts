// 画面右上の残り時間（MM:SS）の秒の 1 の位が変わったフレームを拾い、残り時間 1 秒あたりの動画のフレーム数を出す
// （V-0002・V-0003）。数字は読まず、2 値にした画像が変わったフレームだけを見る。秒の値は、離れた 2 フレームの
// 表示を still.ts などで目で読んで決める。
//   node tools/captures/timer.ts <動画...> [--mode summary|changes|steps|stalls|ticks] [--crop 1852,26,14,18]
//                                [--threshold 90] [--start N] [--at f1,f2,...] [--window 35,5]
//
// mode:
//   summary  変わり目の間隔のうち 56〜62f の平均（ふだんの比）と、62〜150f の間隔（長い間隔）の数と長くなった分の合計。
//            117〜123f は 2 秒分の拾いそこねとして 2 で割る
//   changes  変わり目のフレームと、前の変わり目からの間隔
//   steps    残り時間の止まりの段（変わり目 − 58.8235 × 経過秒 の下の縁が 0.8f 以上上がった所。V-0168）。鋸歯の位相で
//            1f の止まりを取りこぼす（V-0286）ので、止まりの大きさは stalls で読む
//   stalls   止まりの区切り（変わり目ごとの (o − 1, o] の共通部分が空になった所。V-0379「読み方」2）と、その大きさ
//            （前後の共通部分の差の両端と真ん中。負は読み違い）。--at を書くと、各フレームの --window（前,後。既定 35,5）
//            に掛かる区切りの大きさの和（V-0379 の発動ごとの止まり）も出す
//   ticks    --at のフレームを、戦闘開始からのゲーム内のティック（止まりを除く）に直す（V-0302）。隣どうしの差も出す。
//            その秒の中に止まりがある（直前と直後の 3 つの変わり目で下の縁が違う）フレームには * を付ける
//   --start  戦闘開始（02:59 が出たフレーム）。省略すると、最初の 250f 以上の間隔の次の変わり目（C-0078）
import { parseArgs } from 'node:util';
import { cropFilter, parseCrop, rawFrames } from './ffmpeg.ts';
import { gameTicksAt, stallsAround, timerOffsets, timerStalls, timerSteps } from './timer-ticks.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    crop: { type: 'string', default: '1852,26,14,18' },
    mode: { type: 'string', default: 'summary' },
    threshold: { type: 'string', default: '90' },
    start: { type: 'string' },
    at: { type: 'string' },
    window: { type: 'string', default: '35,5' },
  },
});
if (positionals.length === 0) {
  console.error(
    'usage: node tools/captures/timer.ts <動画...> [--mode summary|changes|steps|stalls|ticks] [--crop x,y,w,h] [--threshold 90] [--start N] [--at f1,f2,...] [--window 35,5]',
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

/** 戦闘開始: 最初の 250f 以上の間隔（画面の切り替え）の次の変わり目（C-0078） */
function battleStart(frames: number[]): number {
  const i = frames.findIndex((f, j) => j > 0 && f - frames[j - 1]! > 250);
  if (i < 0 || i + 1 >= frames.length) throw new Error('戦闘開始が見つからない（--start で渡す）');
  return frames[i + 1]!;
}

for (const video of positionals) {
  const frames = await changes(video);
  const name = video.split(/[\\/]/).pop();
  if (values.mode === 'changes') {
    console.log(`${name}\n  ${frames.map((f, i) => (i === 0 ? `${f}` : `${f}(+${f - frames[i - 1]!})`)).join(' ')}`);
  } else if (values.mode === 'steps' || values.mode === 'stalls' || values.mode === 'ticks') {
    const start = values.start !== undefined ? Number(values.start) : battleStart(frames);
    const offsets = timerOffsets(frames, start);
    const at = (values.at ?? '')
      .split(',')
      .filter((x) => x !== '')
      .map(Number);
    if (values.mode === 'steps') {
      const steps = timerSteps(offsets);
      console.log(`${name}（戦闘開始 f${start}）\n  ${steps.map((st) => `${st.c}(+${st.size})`).join(' ')}`);
    } else if (values.mode === 'stalls') {
      const stalls = timerStalls(offsets);
      const [before, after] = values.window.split(',').map(Number) as [number, number];
      const fmt = (x: number) => x.toFixed(2);
      const rows = stalls.map((s) => `${s.before}-${s.at}: ${fmt(s.size)}（${fmt(s.low)}〜${fmt(s.high)}）`);
      const around = at.map((f) => {
        const r = stallsAround(stalls, f, before, after);
        return `f${f}: ${fmt(r.size)}（${r.stalls.map((s) => `${s.before}-${s.at}:${fmt(s.size)}`).join(' ')}）`;
      });
      const head = `${name}（戦闘開始 f${start}・変わり目 ${offsets.length}・区切り ${stalls.length}）`;
      console.log([head, ...rows, ...around].join('\n  '));
    } else {
      const rows = at.map((f, i) => {
        const t = gameTicksAt(offsets, start, f);
        const prev = i > 0 ? gameTicksAt(offsets, start, at[i - 1]!).ticks : null;
        return `f${f}: ${t.ticks.toFixed(1)}${t.stallInSecond ? '*' : ''}${prev === null ? '' : `（+${(t.ticks - prev).toFixed(1)}）`}`;
      });
      console.log(`${name}（戦闘開始 f${start}）\n  ${rows.join('\n  ')}`);
    }
  } else {
    console.log(`${name}\n  ${summary(frames)}`);
  }
}
