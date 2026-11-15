// レシピ hp-bars: 画面下の顔のカードの HP のバーの長さを、満タンの幅で割って、枠ごとの HP の割合を時間で読む
// （V-0730・V-0790・V-0791・V-0797 の読み方）。全フレームの測りをキャッシュし
// （hp-bars@<版>.tsv）、割合と区間の中央値・伸び縮みは hp-bars-lib.ts で決める。
//
// - カードは左から 5 つの置き場所のどこかに出る。水色のバーが読める置き場所を左から編成の枠に当てる（--opt cards で指定もできる）。
// - 割合は（白のバーの右端 − 左端）÷（水色のバーの右端 − 左端）。左端と水色の右端は録画を通した中央値で、白の右端だけを画ごとに測る
//   （端の画素は明るさで按分。1 画素はバーの約 1.1%）。左の属性のアイコンが水色のバーの左端に重なる枠も、これで読める。
// - 読まない画: カードが隠れた画（バーストの演出・戦闘の前後）、暗い画（戦闘の終わり。白が DIM_LEVEL より暗い）、
//   シールドの出ている画（白の右に別の色が続き、フルバースト中などに白が短く出る）。HP が約 8% 以下の画も、白の明るさを測る左端の
//   後の 5 画素に白が無いので、隠れた画と同じく読まない。区間の中央値と伸び縮みは、読めた測りだけで出す。
import { cropFilter, rawFrames } from '../ffmpeg.ts';
import { CARD_SLOTS } from '../card-layout.ts';
import { derived } from './cache.ts';
import {
  type CardGeometry,
  changesOf,
  formatHpTsv,
  geometryOf,
  type HpRawRow,
  measureCard,
  parseHpTsv,
  plateausOf,
  presentPositions,
  rangeMedian,
  samplesOf,
  CYAN_ROWS,
  DIM_LEVEL,
  STRIP,
  WHITE_ROWS,
} from './hp-bars-lib.ts';
import { observation, parseRanges, roundTo, type Recipe, type RecipeObservation } from './types.ts';

const VERSION = 1;
const CACHE_KEY = `hp-bars@${VERSION}`;

async function measure(video: string): Promise<string> {
  const { x: X, y: Y, w: W, h: H } = STRIP;
  const args = ['-v', 'error', '-i', video, '-vf', cropFilter(STRIP), '-fps_mode', 'passthrough'];
  args.push('-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1');
  const rows: HpRawRow[] = [];
  let frame = 0;
  for await (const buf of rawFrames(args, W * H * 3)) {
    const px = (x: number, y: number): [number, number, number] => {
      // 帯の外は暗い（連なりが帯の端を越えて次の行に回り込まない）
      if (x < X || x >= X + W || y < Y || y >= Y + H) return [0, 0, 0];
      const i = ((y - Y) * W + (x - X)) * 3;
      return [buf[i]!, buf[i + 1]!, buf[i + 2]!];
    };
    rows.push({ frame, cards: CARD_SLOTS.map((slot) => measureCard(px, slot)) });
    frame++;
  }
  return formatHpTsv(rows);
}

const pct = (v: number) => (Number.isNaN(v) ? null : roundTo(v, 2));

export const hpBars: Recipe = {
  name: 'hp-bars',
  version: VERSION,
  describe:
    '画面下の顔のカードの HP のバー（白）の長さ ÷ 満タンの幅（水色）で、枠ごとの HP の割合を読む。--opt ranges の区間ごとの枠ごとの中央値（rate）と、' +
    '--opt changes の閾値より大きい伸び・縮みのフレームと量（timing・rate）。どちらも省くと、枠ごとの一定の段を出して止まる',
  options: {
    ranges: '割合の中央値を取る区間（動画のフレーム。a-b をカンマで並べる。例 960-1600,2640-3520）',
    step: '測る間隔（フレーム。既定 5。フレーム番号がこの倍数の画を測る）',
    changes:
      '伸び・縮みの閾値（%。例 1）。前の測りからこれより大きく動き、次の測りでも動いたままの所（回復・最大HP の▲▼の付き外れ）',
    cards:
      'カードの置き場所（左から 1〜5）を編成の枠の順にカンマで並べる（例 3,4）。省くと、水色のバーが読める置き場所を左から当てる',
    shield: '1 ならシールドの出ている画も読む（既定は読まない）',
  },
  async run(ctx) {
    const sha = 'sha256' in ctx.recording ? ctx.recording.sha256 : undefined;
    const text = await derived(ctx.derivedDir, CACHE_KEY, ctx.video, sha, () => measure(ctx.video), ctx.log);
    const rows = parseHpTsv(text);
    const team = ctx.recording.team;
    const positions =
      ctx.options.cards === undefined ? presentPositions(rows) : ctx.options.cards.split(',').map((s) => Number(s) - 1);
    if (
      positions.length !== team.length ||
      new Set(positions).size !== positions.length ||
      positions.some((p) => !(p >= 0 && p < CARD_SLOTS.length))
    )
      throw new Error(
        `カードの置き場所（${positions.map((p) => p + 1).join('・')}）と編成の人数（${team.length}）が合わない。--opt cards で指定する`,
      );
    const step = Number(ctx.options.step ?? 5);
    if (!Number.isInteger(step) || step < 1) throw new Error(`--opt step は 1 以上の整数: ${ctx.options.step}`);
    const withShield = ctx.options.shield === '1';
    const geometry: CardGeometry[] = positions.map((p) => geometryOf(rows, p));
    const cards = team.map((m, i) => {
      const g = geometry[i]!;
      const samples = samplesOf(rows, g, step).map((s) =>
        withShield && s.unread === 'shield' ? { ...s, unread: null } : s,
      );
      return { member: m, g, samples };
    });
    for (const c of cards)
      ctx.log(
        `枠 ${c.member.slot}（${c.member.name}）: 置き場所 ${c.g.position + 1}、左端 x${c.g.left.toFixed(2)}・満タンの右端 x${c.g.full.toFixed(2)}（${(c.g.full - c.g.left).toFixed(2)}px）`,
      );
    const how =
      `画面下の顔のカードの HP のバー（白。y${WHITE_ROWS.join('・')} の中央値）の右端までの長さを、水色のバー（y${CYAN_ROWS[0]}〜${CYAN_ROWS.at(-1)}）の右端までの長さ（満タンの幅）で割った` +
      `（左端と水色の右端は録画を通した中央値。端の画素は明るさで按分。${step}f おきの測り。キャッシュ ${CACHE_KEY}）。` +
      `カードが隠れた画・暗い画（白の明るさ ${DIM_LEVEL} 未満）${withShield ? '' : '・シールドの出ている画'}は読まない`;
    const out: RecipeObservation[] = [];

    if (ctx.options.ranges === undefined && ctx.options.changes === undefined) {
      for (const c of cards) {
        const segs = plateausOf(c.samples, 0.6, 60);
        ctx.log(
          `枠 ${c.member.slot}（${c.member.name}）の一定の段（60f 以上）: ${segs.map((s) => `f${s.from}〜${s.to} ${s.value.toFixed(2)}%`).join('・') || 'なし'}`,
        );
      }
      ctx.log('--opt ranges か --opt changes を付けると観測値を出す');
      return [];
    }

    if (ctx.options.ranges !== undefined) {
      const who = cards.map((c) => c.member.name).join(' / ');
      for (const r of parseRanges(ctx.options.ranges)) {
        const meds = cards.map((c) => rangeMedian(c.samples, r));
        const counts = cards
          .map((c, i) => {
            const m = meds[i]!;
            const skip = Object.entries(m.skipped)
              .filter(([, n]) => n > 0)
              .map(([k, n]) => `${{ hidden: '隠れた', dim: '暗い', shield: 'シールド' }[k]} ${n}`);
            return `${c.member.name} ${m.used}${skip.length > 0 ? `（読まない ${skip.join('・')}）` : ''}`;
          })
          .join('・');
        // 読めた測りの無い枠を null で残すので、記録だけの観測値（use: record）の値に入れる
        const draft = observation(
          this,
          'rate',
          [],
          `HP のバーの割合の f${r.from}〜${r.to} の中央値（${who}。読めた測りの無い枠は null）`,
          `${how}。使った測りの数: ${counts}`,
          { unit: '%' },
        );
        out.push({ ...draft, use: 'record', value: meds.map((m) => pct(m.value)) });
      }
    }

    if (ctx.options.changes !== undefined) {
      const threshold = Number(ctx.options.changes);
      if (!(threshold > 0)) throw new Error(`--opt changes は正の数（%）: ${ctx.options.changes}`);
      for (const c of cards) {
        for (const [sign, verb] of [
          [1, '伸び'],
          [-1, '縮み'],
        ] as const) {
          const list = changesOf(c.samples, threshold, sign);
          if (list.length === 0) continue;
          const who = `${c.member.name}（枠 ${c.member.slot}）`;
          const note =
            `${how}。${verb}は、読めた測りをつなぎ、前の測りから ${threshold}% より大きく動き、次の測りでも動いたままの測り` +
            `（続く測りにまたがる動きは 1 つにまとめた）`;
          out.push(
            observation(
              this,
              'timing',
              list.map((x) => x.frame),
              `${who}の HP のバーの割合が ${threshold}% より大きく${verb === '伸び' ? '伸びた' : '縮んだ'}測りのフレーム（${step}f おき）`,
              note,
              { unit: 'f' },
            ),
          );
          out.push(
            observation(
              this,
              'rate',
              list.map((x) => roundTo(x.after - x.before, 2)),
              `${who}の HP のバーの割合の${verb}の量（上のフレームの前の測りから次の測りまで）。前の測りの値は ${list.map((x) => roundTo(x.before, 2)).join('・')}`,
              note,
              { unit: '%' },
            ),
          );
        }
      }
    }
    return out;
  },
};
