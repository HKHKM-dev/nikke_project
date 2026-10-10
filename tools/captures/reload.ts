// 画面下中央の RELOADING のバーの長さを全フレーム測り、リロードごとの区間・伸び・最終弾からの長さを出す
// （plan/design-weapon-seconds.md 8 節、V-0057）。V-0046 の使い捨てのスクリプトと同じ読み方をツールにしたもの。
//   node tools/captures/reload.ts <動画> [--mode series|segments|fit] [--from N] [--to N] [--stages]
//                                 [--crop 760,524,400,10] [--white 200] [--min-rows 5] [--max-start 40] [--track-px 367]
//                                 [--shots <ファイル>]
//
// バーは 1920×1080 で y 525〜533 の 9 行、x 776 から右へ伸び、溝（x 776〜1142、--track-px 367）が満ちたフレームで消える。
// 操作キャラのリロードにだけ出る。crop の幅と高さは偶数にする（yuv420 の録画では、奇数は ffmpeg が丸めてフレームの
// 区切りがずれる）。列ごとに min(R,G,B) > white の画素が min-rows 行以上あれば白の列とし、crop の左から max-start px
// までに始まる最初の白の列から続く白の長さを、そのフレームのバーの長さにする。バーは最終弾のフレームから一定の速さで
// 伸び（V-0055）、見え始めは数フレーム遅れて薄く出る。分割リロード（SG）は段ごとに満ちて空に戻る（--stages）。
// 見えた最大の長さの 15% に届かない白（完了で下に移ってくるアイコン・弾の光）は捨てる。
//
// mode:
//   series    フレームごとのバーの長さ（frame	length）
//   segments  リロードごとの区間（見え始め・消えたフレーム = 完了・最大の長さ・段の数）。1 行 1 リロードの JSON
//   fit       segments に直線の当てはめ（伸び px/f・長さ 0 に遡ったフレーム・溝の幅 ÷ 伸び）を足す（既定）。
//             分割リロードでない武器はリロード全体に当てはめ、残差の大きい点（武器のエフェクトの重なり）を落として
//             当てはめ直す。--stages では段ごとに当てはめる。直線で満ちる所まで届かずに消えた回（的のジャンプの窓で
//             取り消された回）は canceled。「完了 − 遡った 0 の点」（barSpan）は、HUD の増分で最終弾が取れない武器
//             （RL は弾が届くまで増分が遅れる）でも出せる最終弾 → 完了の代わり
// --shots に `hud.ts --mode jumps` の出力のファイルを渡すと、リロードごとに最終弾（見え始めより前の最後の増分）・
// 最終弾 → 完了・完了 → 次の増分・遡った 0 の点 − 最終弾と、窓をまたいだ回・最終弾の読み違いの印を足し、
// 集計を標準エラーに出す。
import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { cropFilter, parseCrop, rawFrames } from './ffmpeg.ts';
import {
  barLength,
  type Chunk,
  type ChunkFit,
  DEFAULT_FIT,
  dropTinyChunks,
  findChunks,
  firstFrom,
  fitChunk,
  fitFrames,
  fullLength,
  groupReloads,
  lastBefore,
  median,
  parseHudJumps,
  summarize,
} from './reload-bar.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    crop: { type: 'string', default: '760,524,400,10' },
    mode: { type: 'string', default: 'fit' },
    from: { type: 'string', default: '0' },
    to: { type: 'string' },
    white: { type: 'string', default: '200' },
    'min-rows': { type: 'string', default: '5' },
    'max-start': { type: 'string', default: '40' },
    'track-px': { type: 'string', default: '367' },
    shots: { type: 'string' },
    stages: { type: 'boolean', default: false },
  },
});

const video = positionals[0];
if (!video || !['series', 'segments', 'fit'].includes(values.mode)) {
  console.error(
    'usage: node tools/captures/reload.ts <動画> [--mode series|segments|fit] [--from N] [--to N]\n' +
      '         [--crop x,y,w,h] [--white 200] [--min-rows 5] [--max-start 40] [--track-px 367]\n' +
      '         [--shots <hud.ts --mode jumps の出力>]',
  );
  process.exit(1);
}
const crop = parseCrop(values.crop);
const options = {
  white: Number(values.white),
  minRows: Number(values['min-rows']),
  maxStart: Number(values['max-start']),
};
const first = Number(values.from);
const last = values.to === undefined ? undefined : Number(values.to);

async function readLengths(): Promise<number[]> {
  // select を必ず通す（hud.ts と同じ）。通さないとフレームの番号が tools.md「フレーム番号の約束」とずれる
  const select = last === undefined ? `gte(n\\,${first})` : `between(n\\,${first}\\,${last})`;
  const args = [
    '-v',
    'error',
    '-i',
    video!,
    '-vf',
    `select='${select}',${cropFilter(crop)}`,
    '-fps_mode',
    'passthrough',
  ];
  if (last !== undefined) args.push('-frames:v', String(last - first + 1));
  args.push('-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1');
  const out: number[] = [];
  for await (const rgb of rawFrames(args, crop.w * crop.h * 3)) out.push(barLength(rgb, crop.w, crop.h, options));
  return out;
}

const round = (v: number, d = 2): number => Math.round(v * 10 ** d) / 10 ** d;

type Fit = { rate: number; zero: number; frames: number; rms: number };

type Row = {
  start: number;
  end: number;
  max: number;
  /** 段の数（分割リロードでない武器でも、エフェクトの重なりで割れることがある） */
  stages: number;
  canceled: boolean;
  /** 分割リロードでない武器: リロード全体の当てはめ。--stages: 最初の段の当てはめ */
  fit: Fit | null;
  /** 完了 − 遡った 0 の点（バーだけで出す最終弾 → 完了の代わり。--stages では出さない） */
  barSpan: number | null;
  /** --stages のときだけ: 段ごとの区間と当てはめ */
  chunks?: (Pick<Chunk, 'start' | 'end' | 'max'> & Partial<Fit>)[];
  lastShot?: number | null;
  lastToEnd?: number | null;
  endToNext?: number | null;
  zeroMinusShot?: number | null;
  /** 完了 → 次の増分が、この録画の中央値 + WINDOW_EXTRA を超える（的のジャンプの窓をまたいだ回） */
  window?: boolean;
  /** 遡った 0 の点が最終弾から MISREAD_GAP 以上離れている（最終弾の増分の読み違い・弾が届くまでの遅れ） */
  misread?: boolean;
};

/** 窓をまたいだとみなす、完了 → 次の増分の中央値からの超過（f） */
const WINDOW_EXTRA = 5;
/** 最終弾の読み違いとみなす、遡った 0 の点と最終弾の差（f。V-0055 と同じ） */
const MISREAD_GAP = 3;
/** バーの長さの集計に入れる当てはめの残差の上限（px） */
const MAX_FIT_RMS = 3;
/** リロード全体の当てはめで落とす残差（px。エフェクトの重なり） */
const TOLERANCE = 4;

const toFit = (f: ChunkFit | null): Fit | null =>
  f === null ? null : { rate: round(f.rate, 3), zero: round(f.zero), frames: round(f.frames), rms: round(f.rms) };

async function main(): Promise<void> {
  const lengths = await readLengths();
  if (values.mode === 'series') {
    lengths.forEach((len, i) => console.log(`${first + i}	${len}`));
    return;
  }
  const trackPx = Number(values['track-px']);
  const all = findChunks(lengths, first);
  const full = fullLength(all, trackPx);
  const chunks = dropTinyChunks(all, full);
  const reloads = groupReloads(chunks);
  const stagesMode = values.stages === true;
  const shots = values.shots === undefined ? null : parseHudJumps(readFileSync(values.shots, 'utf8'));
  console.error(
    `${lengths.length} フレーム、${reloads.length} 回のリロード（${chunks.length} 段）、見えた最大 ${full}px`,
  );
  const rows: Row[] = reloads.map((r) => {
    const firstChunk = r.chunks[0]!;
    const lastChunk = r.chunks.at(-1)!;
    const end = lastChunk.end;
    let fit: Fit | null;
    let canceled: boolean;
    let chunkRows: Row['chunks'];
    if (stagesMode) {
      chunkRows = r.chunks.map((c) => ({
        start: c.start,
        end: c.end,
        max: c.max,
        ...(values.mode === 'fit' ? (toFit(fitChunk(lengths, first, c, full, trackPx)) ?? {}) : {}),
      }));
      fit = toFit(fitChunk(lengths, first, firstChunk, full, trackPx));
      canceled = lastChunk.max < full * 0.95;
    } else {
      const f = fitFrames(lengths, first, firstChunk.start, lastChunk.last, full, trackPx, {
        ...DEFAULT_FIT,
        tolerance: TOLERANCE,
      });
      fit = toFit(f);
      // 満ちる前に消えた（的のジャンプの窓で取り消された）回は、直線で満ちる所まで届かない
      canceled = f === null || f.rate * (end - f.zero) < trackPx * 0.95;
    }
    const row: Row = {
      start: firstChunk.start,
      end,
      max: Math.max(...r.chunks.map((c) => c.max)),
      stages: r.chunks.length,
      canceled,
      fit,
      barSpan: stagesMode || fit === null ? null : round(end - fit.zero),
    };
    if (chunkRows !== undefined) row.chunks = chunkRows;
    if (shots !== null) {
      const lastShot = lastBefore(shots, firstChunk.start);
      const next = firstFrom(shots, end);
      row.lastShot = lastShot;
      row.lastToEnd = lastShot === null ? null : end - lastShot;
      row.endToNext = next === null ? null : next - end;
      row.zeroMinusShot = lastShot === null || fit === null ? null : round(fit.zero - lastShot);
    }
    return row;
  });
  if (shots !== null) {
    const typical = median(rows.filter((r) => !r.canceled && r.endToNext != null).map((r) => r.endToNext!));
    for (const r of rows) {
      r.window = r.endToNext == null || r.endToNext > typical + WINDOW_EXTRA;
      // 分割リロードは最初の段が最終弾から離れて始まるので、遡った 0 の点では確かめない
      r.misread =
        r.lastShot == null || (!stagesMode && (r.zeroMinusShot == null || Math.abs(r.zeroMinusShot) >= MISREAD_GAP));
    }
    const fmt = (s: ReturnType<typeof summarize>): string =>
      s === null ? '—' : `平均 ${round(s.mean)}（SE ${round(s.se, 3)}、${s.n} 回、${round(s.min)}〜${round(s.max)}）`;
    const usable = rows.filter((r) => !r.canceled && !r.window);
    const kept = usable.filter((r) => !r.misread);
    const barFits = usable.filter((r) => r.fit !== null && r.fit.rms <= MAX_FIT_RMS);
    const parts = [`最終弾 → 完了 ${fmt(summarize(kept.map((r) => r.lastToEnd!)))}`];
    if (stagesMode) {
      const stageFrames = usable.flatMap((r) =>
        (r.chunks ?? []).flatMap((c) => (c.frames !== undefined && c.rms! <= MAX_FIT_RMS ? [c.frames] : [])),
      );
      parts.push(`段のバーの長さ ${fmt(summarize(stageFrames))}`);
    } else {
      parts.push(`完了 − 遡った 0 の点 ${fmt(summarize(barFits.map((r) => r.barSpan!)))}`);
      parts.push(`バーの長さ ${fmt(summarize(barFits.map((r) => r.fit!.frames)))}`);
    }
    console.error(`取り消し・窓を除いた回（完了 → 次の増分の中央値 ${typical}f）: ${parts.join('、')}`);
  }
  for (const r of rows) console.log(JSON.stringify(r));
}

await main();
