// レシピ midfar-landing: 射撃場の 3 分モードの録画で、中遠（4 区間目）の的の足元の y・上端の y・高さ・幅（外接矩形。
// 的だけが取れたコマの中央値）と、中遠の着地点（C-0044 の A・B・C）を出す（V-0373「読み方」の 2・V-0386「読み方」の 1。
// plan/design-records-automation-log.md 8.9 節）。
//
// 測る範囲（既定 f5400〜9600）を step ごとに aim.ts と同じ部品（aim-lib.ts）で測る。背景は録画の全体の 120f ごとの、
// 戦闘中のフレームの中央値（aim.ts の既定）。測定は derived/<録画 id>/ にキャッシュする。
//
// --opt:
//   from=<f>・to=<f>   測る範囲（既定 5400・9600）
//   step=<f>           測る間隔（既定 30）
//   start=<f>          区間の始まりを手で与える（既定は足元が 550〜595 のコマが 3 つ続いた最初のコマ）
import { buildBackground, findAim, findTarget, readFrames, toHalfField } from '../aim-lib.ts';
import { derived } from './cache.ts';
import {
  FOOT,
  FX_HIDDEN,
  HEIGHT_MAX,
  LANDING_A_MIN,
  LANDING_B,
  LANDING_C,
  MIN_USED,
  SKIP_AFTER_START,
  formatMidfarTsv,
  parseMidfarTsv,
  summarizeMidfar,
  type MidfarRow,
} from './midfar.ts';
import { observation, type Recipe, type RecipeContext } from './types.ts';

/** 背景の作り方（aim.ts の既定） */
const BG_STEP = 120;

function intOption(ctx: RecipeContext, key: string, fallback: number | undefined): number | undefined {
  const raw = ctx.options[key];
  if (raw === undefined) return fallback;
  const v = Number(raw);
  if (!Number.isInteger(v) || v < 0) throw new Error(`--opt ${key} は 0 以上の整数: ${raw}`);
  return v;
}

async function measure(ctx: RecipeContext, from: number, to: number, step: number): Promise<MidfarRow[]> {
  const sha = 'sha256' in ctx.recording ? ctx.recording.sha256 : undefined;
  const text = await derived(
    ctx.derivedDir,
    `midfar-target@1_f${from}-${to}_s${step}`,
    ctx.video,
    sha,
    async () => {
      ctx.log(`背景を作る（録画の全体、${BG_STEP}f ごと）…`);
      const { bg, used, seen } = await buildBackground(ctx.video, 0, undefined, BG_STEP);
      ctx.log(`背景: 戦闘中のフレーム ${used} / ${seen} の中央値`);
      const rows: MidfarRow[] = [];
      for await (const { frame, img } of readFrames(ctx.video, from, to, step)) {
        const { aim } = findAim(img);
        const t = aim ? findTarget(toHalfField(img, 0), bg, aim) : null;
        rows.push(
          t
            ? { frame, x0: t.x0, y0: t.y0, x1: t.x1, y1: t.y1, clipped: t.clipped, fx: Number(t.fx.toFixed(2)) }
            : { frame },
        );
      }
      return formatMidfarTsv(rows);
    },
    ctx.log,
  );
  return parseMidfarTsv(text);
}

export const midfarLanding: Recipe = {
  name: 'midfar-landing',
  version: 1,
  describe:
    '射撃場の 3 分モードの中遠（4 区間目）の的の、足元の y・上端の y・高さ・幅（外接矩形。的だけが取れたコマの中央値。position）。説明に中遠の着地点（C-0044 の A・B・C）',
  options: {
    from: '測る範囲の始め（既定 5400）',
    to: '測る範囲の終わり（既定 9600）',
    step: '測る間隔（既定 30）',
    start: `区間の始まりを手で与える（既定は足元が ${FOOT.min}〜${FOOT.max} のコマが 3 つ続いた最初のコマ）`,
  },
  async run(ctx) {
    const from = intOption(ctx, 'from', 5400)!;
    const to = intOption(ctx, 'to', 9600)!;
    const step = intOption(ctx, 'step', 30)!;
    const start = intOption(ctx, 'start', undefined);
    if (to <= from || step <= 0) throw new Error(`測る範囲が空: f${from}〜${to}・${step}f ごと`);
    const rows = await measure(ctx, from, to, step);
    const s = summarizeMidfar(rows, start ?? undefined);
    if (start === undefined && s.start === undefined)
      throw new Error(`足元が ${FOOT.min}〜${FOOT.max} のコマが 3 つ続かない`);
    ctx.log(
      `区間の始まり f${s.start}・使えたコマ ${s.used} / ${s.candidates}・足元 ${s.foot ?? '-'}・上端 ${s.top ?? '-'}・高さ ${s.height ?? '-'}・幅 ${s.width ?? '-'}・着地点 ${s.landing}`,
    );
    if (s.foot === undefined) throw new Error('使えるコマが無い');
    const landingText = s.landing === '決まらない' ? '中遠の着地点は決まらない' : `中遠 ${s.landing}`;
    const startText =
      start === undefined
        ? `区間の始まり（足元が ${FOOT.min}〜${FOOT.max} のコマが 3 つ続いた最初のコマ）は f${s.start}`
        : `区間の始まりは --opt start で与えた f${s.start}`;
    const q = s.footQuartiles!;
    return [
      {
        ...observation(
          this,
          'position',
          [s.foot, s.top!, s.height!, s.width!],
          `中遠（4 区間目）の的の、足元の y・上端の y・高さ・幅（1920×1080。外接矩形。的だけが取れたコマの中央値）。足元で分けると${landingText}（C-0044。境目は ${LANDING_A_MIN} 以上が A、${LANDING_B.min}〜${LANDING_B.max} が B、${LANDING_C.min}〜${LANDING_C.max} が C）`,
          `aim.ts の部品で f${from}〜${to} を ${step}f ごとに測った（背景は録画の全体の ${BG_STEP}f ごとの、戦闘中のフレームの中央値）。` +
            `使えたコマ ${s.used} / ${s.candidates}（区間の始まりから後の、足元が ${FOOT.min}〜${FOOT.max} のコマ。測った範囲の全体では ${s.candidatesAll}）。${startText} で、その後 ${SKIP_AFTER_START}f を除いた。` +
            `爆発で隠れたコマ（fx ${FX_HIDDEN} 以上）・探す範囲の端に接したコマ・外接矩形の高さ ${HEIGHT_MAX}px 以上のコマを除いた。` +
            `最頻値 ${s.footMode}、四分位 ${q[0]}〜${q[1]}。足元の y は半分の解像度で測るので 2px 刻み。` +
            `境目の間・外か、使えたコマが ${MIN_USED} 未満なら着地点を決めない`,
          { unit: 'px' },
        ),
        scope: { slot: 'all', source: 'target', frames: [from, to] },
      },
    ];
  },
};
