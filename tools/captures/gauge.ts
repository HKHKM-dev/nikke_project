// 画面右の「BURST」ゲージバーを画素で読み、フレームごとの充填率を出す（Stage 7 のゲージ較正用）。
//   node tools/captures/gauge.ts <動画> [--from N] [--to N] [--step 1] [--mode series|jumps|events] [--side right|left]
//
// バーは 1920×1080 で x 1793〜1905・y 442（113px）。充填部は輝度 約 171、未充填部は 約 110 なので、
// 行の画素がすべてどちらかに近いフレームだけを「バーが見えている」とみなし、明るい画素の割合を充填率にする。
// フルバースト中・CT 待ち・チェーン中はバーの位置に別の UI（タイマー・段階のアイコン）が出るので「-」になる。
// バーは本当のゲージの約 12.6〜96% しか映さない（C-0084。1px ≈ 本当の 0.74%）。約 12.6% までは 0px、約 96% からは 113px のまま。
// 本当の満タンは「バー消失」のフレーム（C-0083）。AR の 1 発（0.4%）は 1 発ずつは読めず、SR / SG の 1 発（5〜13%）は 1 発ずつ読める。
// ゲームのオプションでバーストの欄を左に出した録画は --side left（x 8〜124・y 442 の 117px。明るさは右と同じで、左から溜まる。
// 空でも左端の 2px は明るい。本当のゲージとの対応は較正していない。チェーン中は段のタイマーのバーが同じ行に出て、充填と読まれる）。
//
// mode:
//   series  各フレームの充填率（%）。見えていないフレームは「-」
//   jumps   充填率が増えたフレームと増分（1 発ずつの読み取り用）
//   events  「溜め始め」「満タン」「バー消失」のフレーム。1 回目の溜め始めからの相対フレームも出す
import { parseArgs } from 'node:util';
import { rawFrames } from './ffmpeg.ts';

const BARS = {
  right: { x: 1793, y: 442, w: 113, h: 2 },
  left: { x: 8, y: 442, w: 117, h: 2 },
} as const;
const FILLED = 171;
const EMPTY = 110;
/** 充填・未充填のどちらかからこれ以上離れた画素があれば、バー以外の UI が重なっているとみなす */
const TOLERANCE = 30;
/** 満タンとみなす充填率。右端の 1px は満タンでも暗いままなので 112/113 で満タンになる */
const FULL_FILL = 111.5 / 113;
/** 明るさの境目 */
const THRESHOLD = (FILLED + EMPTY) / 2;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    from: { type: 'string', default: '0' },
    to: { type: 'string' },
    step: { type: 'string', default: '1' },
    mode: { type: 'string', default: 'events' },
    side: { type: 'string', default: 'right' },
  },
});

const video = positionals[0];
if (!video) {
  console.error(
    'usage: node tools/captures/gauge.ts <動画> [--from N] [--to N] [--step 1] [--mode series|jumps|events] [--side right|left]',
  );
  process.exit(1);
}
const from = Number(values.from);
const to = values.to === undefined ? undefined : Number(values.to);
const step = Number(values.step);
const mode = values.mode;
const side = values.side;
if (side !== 'right' && side !== 'left') {
  console.error('--side は right か left');
  process.exit(1);
}
const BAR = BARS[side];

/** 1 行ぶん（上の行だけ使う）の充填率 0..1。バー以外の UI が重なっていれば null */
function readFill(frame: Buffer): number | null {
  let filled = 0;
  for (let x = 0; x < BAR.w; x++) {
    const v = frame[x]!;
    if (Math.abs(v - FILLED) > TOLERANCE && Math.abs(v - EMPTY) > TOLERANCE) return null;
    if (v > THRESHOLD) filled += 1;
  }
  return filled / BAR.w;
}

const select = to === undefined ? `gte(n\\,${from})` : `between(n\\,${from}\\,${to})`;
const args = [
  '-v',
  'error',
  '-i',
  video,
  '-vf',
  `select='${select}',format=gray,crop=${BAR.w}:${BAR.h}:${BAR.x}:${BAR.y}`,
  '-fps_mode',
  'passthrough',
  '-f',
  'rawvideo',
  '-',
];

const series: { frame: number; fill: number | null }[] = [];
let n = from;
for await (const buf of rawFrames(args, BAR.w * BAR.h)) {
  series.push({ frame: n, fill: readFill(buf) });
  n += 1;
}

const pct = (v: number): string => (v * 100).toFixed(1);

if (mode === 'series') {
  const out: string[] = [];
  for (let i = 0; i < series.length; i += step) {
    const s = series[i]!;
    out.push(`${s.frame}:${s.fill === null ? '-' : pct(s.fill)}`);
  }
  console.log(out.join(' '));
} else if (mode === 'jumps') {
  // 直前に見えていたフレームからの増分。1px 未満の揺れは拾わない
  let last: { frame: number; fill: number } | null = null;
  for (const s of series) {
    if (s.fill === null) continue;
    if (last !== null && s.fill > last.fill + 0.5 / BAR.w) {
      console.log(
        `${s.frame}\t${pct(last.fill)} → ${pct(s.fill)}\t+${pct(s.fill - last.fill)}%\t(${s.frame - last.frame}f)`,
      );
    }
    last = { frame: s.frame, fill: s.fill };
  }
} else {
  // 「溜め始め（0% から最初に増えたフレーム）」「満タン」「バー消失（チェーン・フルバースト・CT 待ちの UI に切り替わった）」を出す。
  // 溜め始めは直前が 0% の見えているフレームから増えたときだけ数える（戦闘前の演出でバーの位置が光るのを拾わない）。
  // 戦闘開始（射撃場）は 1 回目の溜め始めとほぼ同じ（初弾の着弾。SR / RL はチャージ時間ぶん遅れる）。
  let origin: number | null = null;
  let charging = false;
  let full = false;
  let prev: { frame: number; fill: number | null } | null = null;
  const TAB = '\t';
  const rel = (f: number): string => (origin === null ? '' : `${TAB}+${f - origin}f`);
  for (const s of series) {
    const visible = s.fill !== null;
    if (visible && prev !== null && prev.fill === 0 && s.fill! > 0 && !charging) {
      charging = true;
      full = false;
      if (origin === null) origin = prev.frame;
      console.log(`${prev.frame}${TAB}溜め始め${rel(prev.frame)}`);
    }
    if (visible && charging && !full && s.fill! >= FULL_FILL) {
      full = true;
      charging = false;
      console.log(`${s.frame}${TAB}満タン${rel(s.frame)}`);
    }
    if (!visible && prev !== null && prev.fill !== null && full) {
      console.log(`${s.frame}${TAB}バー消失${rel(s.frame)}`);
      full = false;
    }
    prev = s;
  }
}
