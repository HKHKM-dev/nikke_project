// レシピ far-landing: 射撃場の 3 分モードの録画で、遠の区間（3 区間目か 6 区間目。範囲は --opt from・to で与える）の的の足元の y・
// 上端の y・高さ・幅（外接矩形。的だけが取れたコマの中央値）と、遠の着地点（C-0477 の遠 A・遠 B）を出す（V-0491）。
// V-0228「読み方」の 3 と V-0423 の `0423-10` で、aim.ts と使い捨てのスクリプトにしていた読み方をレシピにしたもの。
//
// 測る範囲を step ごとに midfar-landing の測り（measureTargetRows。aim.ts と同じ部品）で測り、derived/<録画 id>/ にキャッシュする。
// 背景は録画の全体の 120f ごとの、戦闘中のフレームの中央値。
import { quartiles, type MidfarRow } from './midfar.ts';
import { BG_STEP, intOption, measureTargetRows } from './midfar-landing.ts';
import { median } from './triggers.ts';
import { observation, type Recipe } from './types.ts';

/** V-0228「読み方」の 3 のコマの選び方（録画 0161 の試しの読みで決めた。中遠 C の足元 561 と、中遠の高さ 195px 以上を除く） */
export const FAR_FRAME = {
  fxMax: 0.3,
  height: { min: 110, max: 190 },
  width: { min: 80, max: 170 },
  foot: { min: 515, max: 552 },
} as const;
/** 遠 A・遠 B の境目（V-0228「結果」。V-0423 の `0423-10`）。間は決めない */
export const FAR_A_MIN = 540;
export const FAR_B_MAX = 536;
/** 使えるコマがこれ未満なら着地点を決めない（V-0228） */
export const FAR_MIN_USED = 8;

export type FarLanding = 'A' | 'B' | '間' | '決まらない';

export function farLandingOf(foot: number | undefined, used: number): FarLanding {
  if (foot === undefined || used < FAR_MIN_USED) return '決まらない';
  if (foot >= FAR_A_MIN) return 'A';
  if (foot <= FAR_B_MAX) return 'B';
  return '間';
}

export type FarSummary = {
  foot: number | undefined;
  top: number | undefined;
  height: number | undefined;
  width: number | undefined;
  used: number;
  measured: number;
  footQuartiles: [number, number] | undefined;
  landing: FarLanding;
};

export function isFarFrame(r: MidfarRow): boolean {
  if (r.y0 === undefined || r.y1 === undefined || r.x0 === undefined || r.x1 === undefined) return false;
  const h = r.y1 - r.y0;
  const w = r.x1 - r.x0;
  return (
    r.clipped !== true &&
    r.fx !== undefined &&
    r.fx < FAR_FRAME.fxMax &&
    h >= FAR_FRAME.height.min &&
    h <= FAR_FRAME.height.max &&
    w >= FAR_FRAME.width.min &&
    w <= FAR_FRAME.width.max &&
    r.y1 >= FAR_FRAME.foot.min &&
    r.y1 <= FAR_FRAME.foot.max
  );
}

export function summarizeFar(rows: readonly MidfarRow[]): FarSummary {
  const used = rows.filter(isFarFrame);
  const foot = median(used.map((r) => r.y1!));
  return {
    foot,
    top: median(used.map((r) => r.y0!)),
    height: median(used.map((r) => r.y1! - r.y0!)),
    width: median(used.map((r) => r.x1! - r.x0!)),
    used: used.length,
    measured: rows.length,
    footQuartiles: quartiles(used.map((r) => r.y1!)),
    landing: farLandingOf(foot, used.length),
  };
}

export const farLanding: Recipe = {
  name: 'far-landing',
  version: 1,
  describe:
    '射撃場の 3 分モードの遠の区間（--opt from・to）の的の、足元の y・上端の y・高さ・幅（外接矩形。的だけが取れたコマの中央値。position）。説明に遠の着地点（C-0477 の遠 A・遠 B）',
  options: {
    from: '測る範囲の始め（遠の区間の始まり。要る）',
    to: '測る範囲の終わり（遠の区間の終わり。要る）',
    step: '測る間隔（既定 30）',
    segment: '説明に書く区間の名前（既定「遠」。例: 3 区間目・6 区間目）',
  },
  async run(ctx) {
    const from = intOption(ctx, 'from', undefined);
    const to = intOption(ctx, 'to', undefined);
    const step = intOption(ctx, 'step', 30)!;
    if (from === undefined || to === undefined) throw new Error('--opt from=<f> と to=<f> が要る（遠の区間）');
    if (to <= from || step <= 0) throw new Error(`測る範囲が空: f${from}〜${to}・${step}f ごと`);
    const label = ctx.options.segment ?? '遠';
    const s = summarizeFar(await measureTargetRows(ctx, 'far', from, to, step));
    ctx.log(
      `使えたコマ ${s.used} / ${s.measured}・足元 ${s.foot ?? '-'}・上端 ${s.top ?? '-'}・高さ ${s.height ?? '-'}・幅 ${s.width ?? '-'}・着地点 ${s.landing}`,
    );
    if (s.foot === undefined) throw new Error('使えるコマが無い');
    const landingText =
      s.landing === '決まらない'
        ? '遠の着地点は決まらない'
        : s.landing === '間'
          ? '遠 A と遠 B の間'
          : `遠 ${s.landing}`;
    const q = s.footQuartiles!;
    const F = FAR_FRAME;
    return [
      {
        ...observation(
          this,
          'position',
          [s.foot, s.top!, s.height!, s.width!],
          `遠（${label}）の的の、足元の y・上端の y・高さ・幅（1920×1080。外接矩形。的だけが取れたコマの中央値）。足元で分けると${landingText}（C-0477。${FAR_A_MIN} 以上が遠 A、${FAR_B_MAX} 以下が遠 B）`,
          `aim.ts の部品で f${from}〜${to} を ${step}f ごとに測った（背景は録画の全体の ${BG_STEP}f ごとの、戦闘中のフレームの中央値）。` +
            `コマの選び方は V-0228「読み方」の 3（探す範囲の端に接していない・fx ${F.fxMax} 未満・高さ ${F.height.min}〜${F.height.max}px・` +
            `幅 ${F.width.min}〜${F.width.max}px・足元の y ${F.foot.min}〜${F.foot.max}）。使えたコマ ${s.used} / ${s.measured}。` +
            `足元の四分位 ${q[0]}〜${q[1]}。使えたコマが ${FAR_MIN_USED} 未満なら着地点を決めない`,
          { unit: 'px' },
        ),
        scope: { slot: 'all', source: 'target', frames: [from, to] },
      },
    ];
  },
};
