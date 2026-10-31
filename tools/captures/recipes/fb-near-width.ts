// レシピ fb-near-width: fb-window-cores の録画（鈴原サクラ・デルタ・操作枠。BigArms）で、近の 2 つの帯（2 つ目と 5 つ目）の
// 的の幅から、近の着地点（近 A・近 B）を決める（V-0542。fb-window-cores の --opt near に渡す）。
//
// - 帯は fb-window-cores と同じ（同じ --opt body・up・atk・jumps で、ヒットの途切れかジャンプで区切る）。
// - 幅は 0354-12 の読み方: 的の外接矩形の上から 45〜55% の行での的の左右の端の幅。照準の代わりに x 700・960・1220（y 480）を
//   与えて的を探し、面積の最も大きいものの中心で探し直す。外接矩形が探す範囲の端に接したフレームは除く（ほかのものとつながった）。
// - 背景はフレームごとに作る: 近でない帯（1・3・4・6 つ目。的が近の場所にいない）を pool 間隔で取り、的の来ない左右の列
//   （半分の解像度で x < 230 と x ≥ 760）で最も似た 7 枚の中央値。BigArms の射撃場は、的の着地で背の高い箱などが出入りし、
//   カメラの寄りも変わるので、戦闘の全体の中央値の背景（aim.ts の既定）では、建物が的とつながって幅が崩れる（V-0542「結果」）。
// - 近 A・近 B は V-0492 の決め方: 幅 300〜369px と 370〜459px のフレームの数の多いほうが 8 割以上かつ 10 フレーム以上なら
//   それぞれ近 A・近 B（0354-12 の 2 つの群。小さいほうが近 A）。そうでなければ決めない。
import {
  FIELD,
  HALF_H,
  HALF_W,
  findTarget,
  median,
  readFrames,
  toHalfField,
  type Aim,
  type Target,
} from '../aim-lib.ts';
import { derived } from './cache.ts';
import { FB_OPTIONS, fbBands, fbSetup } from './fb-window-cores.ts';
import { observation, type Recipe } from './types.ts';

/** 近 A・近 B の幅の群（0354-12） */
export const NEAR_A_WIDTH = [300, 370] as const;
export const NEAR_B_WIDTH = [370, 460] as const;

/** 外接矩形の上から 45〜55% の行での、的の左右の端の幅（px。マスクは半分の解像度） */
export function midWidth(t: Pick<Target, 'y0' | 'y1' | 'mask'>): number {
  const hy0 = (t.y0 - FIELD.y0) / 2;
  const hy1 = (t.y1 - FIELD.y0) / 2;
  let bl = Infinity;
  let br = -Infinity;
  for (let y = Math.floor(hy0 + (hy1 - hy0) * 0.45); y <= Math.ceil(hy0 + (hy1 - hy0) * 0.55); y++)
    for (let x = 0; x < HALF_W; x++) {
      if (!t.mask[y * HALF_W + x]) continue;
      bl = Math.min(bl, x);
      br = Math.max(br, x);
    }
  return Number.isFinite(bl) ? (br - bl + 1) * 2 : NaN;
}

export type NearLanding = { a: number; b: number; landing: 'A' | 'B' | undefined };

/** 幅の群のフレームの数から近の着地点を決める（多いほうが 8 割以上かつ 10 フレーム以上） */
export function nearLanding(widths: readonly number[]): NearLanding {
  const a = widths.filter((w) => w >= NEAR_A_WIDTH[0] && w < NEAR_A_WIDTH[1]).length;
  const b = widths.filter((w) => w >= NEAR_B_WIDTH[0] && w < NEAR_B_WIDTH[1]).length;
  const [more, label] = a >= b ? [a, 'A' as const] : [b, 'B' as const];
  return { a, b, landing: more >= 10 && more >= 0.8 * (a + b) ? label : undefined };
}

/** 背景を選ぶ列（的の来ない左右） */
const sideColumn = (x: number) => x < 230 || x >= 760;

function sideDistance(p: Uint8Array, q: Uint8Array): number {
  let s = 0;
  for (let y = 0; y < HALF_H; y += 3)
    for (let x = 0; x < HALF_W; x += 3) {
      if (!sideColumn(x)) continue;
      const i = (y * HALF_W + x) * 3;
      s += Math.abs(p[i]! - q[i]!) + Math.abs(p[i + 1]! - q[i + 1]!) + Math.abs(p[i + 2]! - q[i + 2]!);
    }
  return s;
}

/** 左右の列で最も似た k 枚の中央値 */
function nearestBackground(half: Uint8Array, pool: readonly Uint8Array[], k: number): Uint8Array {
  const ps = pool
    .map((p) => ({ p, d: sideDistance(half, p) }))
    .sort((x, y) => x.d - y.d)
    .slice(0, k)
    .map((x) => x.p);
  const bg = new Uint8Array(half.length);
  const col = new Uint8Array(ps.length);
  for (let i = 0; i < bg.length; i++) {
    for (let j = 0; j < ps.length; j++) col[j] = ps[j]![i]!;
    col.sort();
    bg[i] = col[ps.length >> 1]!;
  }
  return bg;
}

const aimAt = (x: number): Aim => ({ x, y: 480, conf: 1, color: 'white', type: 'cross', size: 0 });

/** 1 フレームの的の幅。外接矩形が探す範囲の端に接したら undefined */
function frameWidth(half: Uint8Array, bg: Uint8Array): number | undefined {
  let best: Target | null = null;
  for (const x of [700, 960, 1220]) {
    const t = findTarget(half, bg, aimAt(x));
    if (t && (!best || t.area > best.area)) best = t;
  }
  if (!best) return undefined;
  const t = findTarget(half, bg, aimAt((best.x0 + best.x1) / 2)) ?? best;
  if (t.clipped) return undefined;
  const w = midWidth(t);
  return Number.isFinite(w) ? w : undefined;
}

const NEIGHBORS = 7;

export const fbNearWidth: Recipe = {
  name: 'fb-near-width',
  version: 1,
  describe:
    'fb-window-cores の録画の近の 2 つの帯（2 つ目と 5 つ目）の、外接矩形の上から 45〜55% の行での的の幅（フレームの中央値。size）。note に近の着地点（A・B）',
  options: {
    ...FB_OPTIONS,
    step: '近の帯を測る間隔（既定 30）',
    pool: '背景にする帯（1・3・4・6 つ目）を取る間隔（既定 20）',
  },
  async run(ctx) {
    const { hitMax, rows, jumps, given } = await fbSetup(ctx);
    const step = Number(ctx.options.step ?? '30');
    const poolStep = Number(ctx.options.pool ?? '20');
    const bands = fbBands(rows, jumps, hitMax);
    const nearBands = [bands[1]!, bands[4]!];
    const crop = { y: FIELD.y0, h: FIELD.y1 - FIELD.y0 };
    const sha = 'sha256' in ctx.recording ? ctx.recording.sha256 : undefined;
    const key = `fb-near-width@1_${nearBands.map(([a, b]) => `f${a}-${b}`).join('_')}_s${step}_p${poolStep}`;
    const text = await derived(
      ctx.derivedDir,
      key,
      ctx.video,
      sha,
      async () => {
        const pool: Uint8Array[] = [];
        for (const [a, b] of bands.filter((_, i) => i !== 1 && i !== 4))
          for await (const { img } of readFrames(ctx.video, a, b, poolStep, crop))
            pool.push(toHalfField(img, FIELD.y0));
        ctx.log(`背景の候補: 近でない帯の ${pool.length} フレーム`);
        const lines: string[] = [];
        for (const [a, b] of nearBands) {
          const ws: (number | undefined)[] = [];
          for await (const { img } of readFrames(ctx.video, a, b, step, crop)) {
            const half = toHalfField(img, FIELD.y0);
            ws.push(frameWidth(half, nearestBackground(half, pool, NEIGHBORS)));
          }
          lines.push(ws.map((w) => (w === undefined ? '-' : String(w))).join(','));
        }
        return lines.join('\n') + '\n';
      },
      ctx.log,
    );
    const perBand = text
      .trim()
      .split('\n')
      .map((line) => line.split(',').map((x) => (x === '-' ? undefined : Number(x))));
    const results = perBand.map((ws) => {
      const used = ws.filter((w): w is number => w !== undefined);
      return { total: ws.length, used, width: median(used), ...nearLanding(used) };
    });
    const who = ctx.recording.team.map((m) => m.name).join('・');
    const landings = results.map((r) => r.landing ?? '決まらない');
    return [
      observation(
        this,
        'size',
        results.map((r) => r.width),
        `${who} の録画の、近の 2 つの帯（2 つ目と 5 つ目）の、的の外接矩形の上から 45〜55% の行での的の幅（フレームごとの中央値）。近の着地点（近 A・近 B）を見分ける値`,
        `帯は fb-window-cores と同じ（帯の区切りは ${jumps.map((j) => `f${j}`).join('・')}。${given.length > 0 ? '--opt jumps' : 'ヒットの途切れ'}）で、` +
          `近の帯は ${nearBands.map(([a, b]) => `f${a}〜${b}`).join('・')}（最初と最後のヒット）。${step}f ごとに測った。` +
          `背景はフレームごとに、近でない帯を ${poolStep}f ごとに取ったものから、的の来ない左右の列で最も似た ${NEIGHBORS} 枚の中央値。` +
          `外接矩形が探す範囲の端に接したフレームは除いた。使ったフレームは ${results.map((r) => `${r.used.length} / ${r.total}`).join('・')}。` +
          `幅 ${NEAR_A_WIDTH[0]}〜${NEAR_A_WIDTH[1] - 1}px と ${NEAR_B_WIDTH[0]}〜${NEAR_B_WIDTH[1] - 1}px のフレームの数は ` +
          `${results.map((r) => `${r.a} : ${r.b}`).join('・')}。近の着地点は ${landings.join('・')}` +
          `（多いほうが 8 割以上かつ 10 フレーム以上で、小さい群を近 A・大きい群を近 B。V-0492「結果」の決め方）`,
        { unit: 'px' },
      ),
    ];
  },
};
