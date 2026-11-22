// still.ts の部品（引数の読み取り・取るフレームの並び・ffmpeg のフィルタ・出力の名前・番号を焼くフォントの選び方）。
// 使い方は still.ts の冒頭。
import { existsSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { selectExpr } from './aim-lib.ts';
import { type Crop, cropFilter } from './ffmpeg.ts';

const nonNegativeInt = (value: string, flag: string): number => {
  if (!/^\d+$/.test(value.trim())) throw new Error(`${flag} は 0 以上の整数で指定する（受け取った値: ${value}）`);
  return Number(value.trim());
};

/** --range A-B（両端を含む） */
export function parseRange(value: string): { first: number; last: number } {
  const m = /^\s*(\d+)\s*-\s*(\d+)\s*$/.exec(value);
  if (!m) throw new Error(`--range は A-B の形で指定する（受け取った値: ${value}）`);
  const first = Number(m[1]);
  const last = Number(m[2]);
  if (first > last) throw new Error(`--range の A は B 以下にする（受け取った値: ${value}）`);
  return { first, last };
}

/** --sheet COLSxROWS */
export function parseSheet(value: string): { cols: number; rows: number } {
  const m = /^\s*(\d+)\s*[xX]\s*(\d+)\s*$/.exec(value);
  const cols = Number(m?.[1]);
  const rows = Number(m?.[2]);
  if (!m || cols < 1 || rows < 1) throw new Error(`--sheet は 列x行 の形で指定する（例: 6x5。受け取った値: ${value}）`);
  return { cols, rows };
}

/** --frame・--frames・--range（と --every）のどれか 1 つから、取るフレーム（昇順・重なりなし）と、それを選ぶ select の式を作る */
export function pickFrames(args: { frame?: string; frames?: string; range?: string; every?: string }): {
  frames: number[];
  select: string;
} {
  const given = [args.frame, args.frames, args.range].filter((v) => v !== undefined).length;
  if (given !== 1) throw new Error('--frame・--frames・--range のどれか 1 つを指定する');
  if (args.every !== undefined && args.range === undefined) throw new Error('--every は --range と一緒に使う');
  if (args.range !== undefined) {
    const { first, last } = parseRange(args.range);
    const every = args.every === undefined ? 1 : nonNegativeInt(args.every, '--every');
    if (every < 1) throw new Error('--every は 1 以上');
    const frames: number[] = [];
    for (let n = first; n <= last; n += every) frames.push(n);
    return { frames, select: selectExpr(first, last, every) };
  }
  const [list, flag] = args.frame !== undefined ? [[args.frame], '--frame'] : [args.frames!.split(','), '--frames'];
  const frames = [...new Set(list.map((v) => nonNegativeInt(v, flag)))].sort((a, b) => a - b);
  return { frames, select: frames.map((n) => `eq(n\\,${n})`).join('+') };
}

/** 番号を焼くフォントの候補（Windows・Linux の主な配布・macOS の既定の場所。前から順に探す） */
export function fontCandidates(env: NodeJS.ProcessEnv = process.env): string[] {
  const windows = (env['WINDIR'] ?? env['SystemRoot'] ?? 'C:/Windows').replace(/\\/g, '/');
  return [
    `${windows}/Fonts/arial.ttf`,
    `${windows}/Fonts/consola.ttf`,
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/TTF/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
    '/usr/share/fonts/liberation-sans/LiberationSans-Regular.ttf',
    '/usr/share/fonts/truetype/freefont/FreeSans.ttf',
    '/usr/share/fonts/noto/NotoSans-Regular.ttf',
    '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf',
    '/System/Library/Fonts/Supplemental/Arial.ttf',
    '/Library/Fonts/Arial.ttf',
    '/System/Library/Fonts/Helvetica.ttc',
  ];
}

/** 候補のうち、あるファイルの最初のもの。無ければ null（番号を焼かずに並べる） */
export function pickFont(
  candidates: readonly string[] = fontCandidates(),
  exists: (path: string) => boolean = existsSync,
): string | null {
  return candidates.find((path) => exists(path)) ?? null;
}

/**
 * ffmpeg のフィルタの引数に書くファイルのパス。区切りは / にし、: を \: にして単引用符で囲む（フィルタの並びの読みが引用符を、
 * フィルタの引数の読みが \: を外す）
 */
export function filterPath(path: string): string {
  if (path.includes("'")) throw new Error(`フィルタに渡すパスに ' は使えない: ${path}`);
  return `'${path.replace(/\\/g, '/').replace(/:/g, '\\:')}'`;
}

/** 焼く番号の文字の大きさ（切り出した画の px）。縮めた後も 14px 以上で、画の高さの 6 割を超えない */
export function labelFontSize(width: number, height: number, scale?: number): number {
  const shrink = scale === undefined ? 1 : scale / width;
  const size = Math.max(Math.round(height / 14), Math.ceil(14 / shrink));
  return Math.max(1, Math.min(size, Math.ceil(height * 0.6)));
}

type SheetFilterOptions = {
  select: string;
  /** 最後に取るフレーム（その後はデコードしない） */
  last: number;
  crop?: Crop;
  scale?: number;
  /** 番号を焼くフォントと大きさ（無ければ焼かない） */
  label?: { font: string; size: number };
  tile?: { cols: number; rows: number };
};

/**
 * 1 回のデコードで取る -vf の並び: trim → crop → drawtext → select → scale → tile。
 * trim は最後に取るフレームの後で入力を終わらせる（tile がこまの余った最後の 1 枚を出すのに、録画の終わりまで読まないように）。
 * drawtext は select の前に置き、選ぶフレームでだけ動かす（enable）。%{n} は select の前の通し番号（元のフレーム番号）になる。
 */
export function sheetFilters(o: SheetFilterOptions): string {
  const filters: string[] = [`trim=end_frame=${o.last + 1}`];
  if (o.crop) filters.push(cropFilter(o.crop));
  if (o.label) {
    filters.push(
      [
        `drawtext=fontfile=${filterPath(o.label.font)}`,
        `text='%{n}'`,
        'x=4',
        'y=4',
        `fontsize=${o.label.size}`,
        'fontcolor=yellow',
        'box=1',
        'boxcolor=black@0.6',
        'boxborderw=3',
        `enable='${o.select}'`,
      ].join(':'),
    );
  }
  filters.push(`select='${o.select}'`);
  if (o.scale) filters.push(`scale=${o.scale}:-1:flags=lanczos`);
  if (o.tile) filters.push(`tile=${o.tile.cols}x${o.tile.rows}:padding=2`);
  return filters.join(',');
}

/** out の拡張子の前に suffix を足す（d/x.png と _f1200 → d/x_f1200.png） */
export function withSuffix(out: string, suffix: string): string {
  const ext = extname(out);
  return join(dirname(out), `${basename(out, ext)}${suffix}${ext}`);
}

/** frames を size 個ずつに分ける */
function chunk<T>(items: readonly T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let i = 0; i < items.length; i += size) groups.push(items.slice(i, i + size));
  return groups;
}

/**
 * 書き出す画と、それぞれに入るフレーム。並べ画は 1 枚に収まれば out、収まらなければ _f<最初>-<最後> を足した名前で複数枚。
 * 並べ画でなければ 1 フレーム 1 枚で、1 枚だけなら out、複数なら _f<番号> を足した名前
 */
export function outputs(out: string, frames: readonly number[], cells?: number): { path: string; frames: number[] }[] {
  if (cells === undefined && frames.length === 1) return [{ path: out, frames: [...frames] }];
  if (cells === undefined) return frames.map((n) => ({ path: withSuffix(out, `_f${n}`), frames: [n] }));
  const groups = chunk(frames, cells);
  if (groups.length === 1) return [{ path: out, frames: groups[0]! }];
  return groups.map((g) => ({ path: withSuffix(out, `_f${g[0]}-${g[g.length - 1]}`), frames: g }));
}

/** 録画の終わりを越えた番号（frames は昇順。番号は 0 から、録画は nbFrames フレーム）。フレーム数が分からない（0 以下）ときは空 */
export function framesBeyond(frames: readonly number[], nbFrames: number): number[] {
  return nbFrames > 0 ? frames.filter((n) => n >= nbFrames) : [];
}
