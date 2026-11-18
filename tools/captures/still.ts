// フレーム番号を指定して静止画を切り出す（証拠フレームの作成と、録画の下見の並べ画）。
//   node tools/captures/still.ts <動画> --frame 1234 --out out.png [--crop x,y,w,h] [--scale 960]
//   node tools/captures/still.ts <動画> (--range A-B [--every N] | --frames a,b,c) --out out.png [--crop x,y,w,h]
//        [--scale 480] [--sheet COLSxROWS] [--font <フォントのファイル>]
// -ss（時間指定）ではなく select（フレーム番号 n）で取る。録画にはフレーム落ちがあり、時間とフレーム番号が比例しないため、
// 番号で取らないと解析結果と対応が取れない。--range（両端を含む。--every で N フレームおき）と --frames（カンマ区切り）は、
// 全部のフレームを 1 回のデコードで取り、最後のフレームを取ったところで止める。
// 出力の名前:
//   --frame（--sheet なし）: --out にそのまま書く。
//   --range・--frames（--sheet なし）: 1 フレーム 1 枚。--out の拡張子の前に _f<番号> を足す（--out d/x.png → d/x_f1200.png）。
//   --sheet: 左上から行ごとに並べた画（並べ画）。1 枚に収まれば --out、収まらなければ _f<最初>-<最後> を足した名前で複数枚。
//     各こまの左上に元のフレーム番号を焼く。フォントは --font、無ければ OS の既定の場所（still-lib.ts の fontCandidates）から
//     あるものを選ぶ。どれも無いか ffmpeg に drawtext が無ければ、番号を焼かずに並べ、こまの番号を順に標準出力に出す。
// --crop の後に番号を焼き、--scale（幅 px）で縮めてから並べる。並べ画は png にする（jpg は数字がつぶれる）。
// 証拠フレームの置き場所（<録画の置き場所>/frames/）に書いたら、Drive の nikke_project_captures/frames/ にも上げる
// （道具の終わりの同期。plan/design-cloud-environment.md 4.2 節）。上げられなくても切り出しは済んでいて、次の同期で上がる。
// まだ取り込んでいない録画は、fetch.ts drive:<record の中の相対パス> で落として、出たパスを渡す。
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { ffprobe, parseCrop, writeStill } from './ffmpeg.ts';
import { uploadFrame } from './frames-upload.ts';
import { labelFontSize, outputs, parseSheet, pickFont, pickFrames, sheetFilters } from './still-lib.ts';
import { cliArgs, fail } from '../../packages/core/scripts/cli.ts';

const { values, positionals } = cliArgs(import.meta.url, {
  allowPositionals: true,
  options: {
    frame: { type: 'string' },
    frames: { type: 'string' },
    range: { type: 'string' },
    every: { type: 'string' },
    out: { type: 'string' },
    crop: { type: 'string' },
    scale: { type: 'string' },
    sheet: { type: 'string' },
    font: { type: 'string' },
  },
});

const video = positionals[0];
const out = values.out;
if (!video || !out) fail();
if (extname(out) === '') fail('--out には拡張子（.png・.jpg）を付ける');

const orFail = <T>(f: () => T): T => {
  try {
    return f();
  } catch (e) {
    return fail((e as Error).message);
  }
};
const pick = orFail(() => pickFrames(values));
const crop = values.crop === undefined ? undefined : orFail(() => parseCrop(values.crop!));
const scale = values.scale === undefined ? undefined : Number(values.scale);
if (scale !== undefined && !(Number.isInteger(scale) && scale > 0)) fail('--scale は幅の px（正の整数）');
const sheet = values.sheet === undefined ? undefined : orFail(() => parseSheet(values.sheet!));

// 出力先のフォルダが無ければ作る（クラウドの新しい VM には frames/ が無い）
mkdirSync(dirname(out), { recursive: true });

if (values.frame !== undefined && sheet === undefined) {
  writeStill(video, pick.frames[0]!, out, { crop, scale });
  uploadFrame(out);
  process.exit(0);
}

/** 番号を焼くフォント（焼けなければ null） */
function labelFont(): string | null {
  const filters = spawnSync('ffmpeg', ['-hide_banner', '-filters'], { encoding: 'utf8' });
  if (!/\sdrawtext\s/.test(filters.stdout ?? '')) {
    console.log('注意: この ffmpeg には drawtext が無いので、番号を焼かずに並べる');
    return null;
  }
  const font = pickFont(values.font === undefined ? undefined : [values.font]);
  if (font === null)
    console.log(
      values.font === undefined
        ? '注意: 番号を焼くフォントが見つからない（--font で指す）ので、番号を焼かずに並べる'
        : `注意: --font の ${values.font} が無いので、番号を焼かずに並べる`,
    );
  return font;
}

let label: { font: string; size: number } | undefined;
if (sheet !== undefined) {
  const font = labelFont();
  if (font !== null) {
    const probe = crop === undefined ? ffprobe(video) : undefined;
    const { w, h } = crop ?? { w: probe!.width, h: probe!.height };
    label = { font, size: labelFontSize(w, h, scale) };
  }
}

const planned = outputs(out, pick.frames, sheet === undefined ? undefined : sheet.cols * sheet.rows);
// 連番で一時のフォルダに書いてから、出力の名前に付け替える（同じフォルダに作り、名前の付け替えで済ませる）
const tmp = mkdtempSync(join(dirname(out), '.still-'));
const args = [
  '-v',
  'error',
  '-i',
  video,
  '-vf',
  sheetFilters({ select: pick.select, crop, scale, label, tile: sheet }),
  '-fps_mode',
  'vfr',
  '-frames:v',
  String(planned.length),
  '-y',
  join(tmp, `%06d${extname(out)}`),
];
let written: string[] = [];
try {
  const result = spawnSync('ffmpeg', args, { stdio: 'inherit' });
  if (result.status === 0) written = readdirSync(tmp).sort();
  for (const [i, file] of written.entries()) renameSync(join(tmp, file), planned[i]!.path);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
if (written.length === 0) fail(`ffmpeg が画を書かなかった（${video}）`);

for (const target of planned.slice(0, written.length)) {
  const first = target.frames[0];
  const last = target.frames[target.frames.length - 1];
  console.log(
    sheet === undefined
      ? target.path
      : `${target.path}  f${first}〜${last}（${target.frames.length} こま）` +
          (label === undefined ? `: ${target.frames.join(',')}` : ''),
  );
  uploadFrame(target.path);
}
if (written.length < planned.length) {
  console.log(
    `注意: ${planned.length} 枚のうち ${written.length} 枚だけ書いた（録画の終わりを越えた番号がある。録画は ${ffprobe(video).nbFrames} フレーム）`,
  );
}
