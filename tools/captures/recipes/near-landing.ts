// レシピ near-landing: SG 単騎の録画で、近の区間ごとの照準の高さ ±30px での的の幅（的のふだんの姿勢のフレームの中央値）と、
// 近の着地点（C-0155 の A・B）を出す（V-0069 の読み方の 3。plan/design-records-automation.md 8.6 節）。
//
// 近の区間（トリガーの最初と最後）は sg-pellets の区間の求め方で決める（--opt の pellet・cuts などは sg-pellets と同じ）。
// 区間の中を step ごとに aim.ts と同じ部品（aim-lib.ts）で測る。背景は録画の全体の 120f ごとの、戦闘中のフレームの中央値
// （aim.ts の既定）。区間ごとの測定は derived/<録画 id>/ にキャッシュする。
//
// --opt:
//   near=<f>-<f>,<f>-<f>   近の区間（トリガーの最初と最後）を手で与える（sg-pellets の区間を使わない）
//   step=<f>               測る間隔（既定 20）
//   ほかは sg-pellets の --opt（pellet・crit・core・nearBody・slack・pelletUntil・cuts）
import { buildBackground, findAim, findTarget, readFrames, toHalfField } from '../aim-lib.ts';
import { derived } from './cache.ts';
import {
  FX_HIDDEN,
  LANDING_A,
  LANDING_B_MIN,
  POSE_TOP_MIN,
  formatAimTargetTsv,
  parseAimTargetTsv,
  summarizeLanding,
  type AimTargetRow,
  type LandingSummary,
} from './landing.ts';
import { sgIntervals } from './sg-pellets.ts';
import { observation, type Recipe, type RecipeContext } from './types.ts';

/** 背景の作り方（aim.ts の既定） */
const BG_STEP = 120;

type NearInterval = { name: string; first: number; last: number };

async function nearIntervals(ctx: RecipeContext): Promise<{ list: NearInterval[]; how: string }> {
  if (ctx.options.near !== undefined) {
    const list = ctx.options.near.split(',').map((spec, i) => {
      const [first, last] = spec.split('-').map((s) => Number(s.trim()));
      if (
        first === undefined ||
        last === undefined ||
        !Number.isFinite(first) ||
        !Number.isFinite(last) ||
        last < first
      )
        throw new Error(`near は <f>-<f>,<f>-<f>: ${ctx.options.near}`);
      return { name: `近 ${i + 1} 回目`, first, last };
    });
    return { list, how: '--opt near で与えた' };
  }
  const { intervals } = await sgIntervals(ctx);
  const list = intervals
    .filter((iv) => iv.label === '近')
    .map((iv) => ({ name: `近 ${iv.nth ?? ''} 回目`, first: iv.first, last: iv.last }));
  return { list, how: 'sg-pellets の区間の求め方で決めた' };
}

function round(v: number, digits: number): number {
  return Number(v.toFixed(digits));
}

/** 区間を step ごとに測る（aim.ts の CSV の aim_y・tgt_y0・tgt_band_w・fx と同じ丸め） */
async function measure(
  ctx: RecipeContext,
  iv: NearInterval,
  step: number,
  background: () => Promise<Uint8Array>,
): Promise<AimTargetRow[]> {
  const sha = 'sha256' in ctx.recording ? ctx.recording.sha256 : undefined;
  const key = `aim-target@1_f${iv.first}-${iv.last}_s${step}`;
  const text = await derived(
    ctx.derivedDir,
    key,
    ctx.video,
    sha,
    async () => {
      const bg = await background();
      const rows: AimTargetRow[] = [];
      for await (const { frame, img } of readFrames(ctx.video, iv.first, iv.last, step)) {
        const { aim } = findAim(img);
        const target = aim ? findTarget(toHalfField(img, 0), bg, aim) : null;
        rows.push({
          frame,
          aimY: aim ? round(aim.y, 1) : undefined,
          top: target?.y0,
          bandW: target ? round(target.bandW, 0) : undefined,
          fx: target ? round(target.fx, 2) : undefined,
        });
      }
      return formatAimTargetTsv(rows);
    },
    ctx.log,
  );
  return parseAimTargetTsv(text);
}

function who(ctx: RecipeContext): string {
  return ctx.recording.team.map((m) => `${m.name}（SG）`).join('・');
}

function conditions(ctx: RecipeContext): string {
  const parts = ['単騎'];
  if (ctx.recording.autoFire) parts.push('AUTO');
  if (ctx.recording.fixedSpec === false) parts.push('スペック固定 OFF');
  return parts.join('・');
}

export const nearLanding: Recipe = {
  name: 'near-landing',
  version: 1,
  describe:
    'SG 単騎の近の区間ごとの、照準の高さ ±30px での的の幅（的のふだんの姿勢のフレームの中央値。size）。note に近の着地点（C-0155 の A・B）',
  options: {
    near: '近の区間（トリガーの最初と最後）を <f>-<f>,<f>-<f> で与える。無ければ sg-pellets の区間',
    step: '測る間隔（既定 20）',
    pellet: 'ほかは sg-pellets の --opt（pellet・crit・core・nearBody・slack・pelletUntil・cuts）',
  },
  async run(ctx) {
    const step = Number(ctx.options.step ?? '20');
    const { list, how } = await nearIntervals(ctx);
    if (list.length === 0) throw new Error('近の区間が無い');
    let bg: Promise<Uint8Array> | undefined;
    const background = (): Promise<Uint8Array> => {
      bg ??= (async () => {
        ctx.log(`背景を作る（録画の全体、${BG_STEP}f ごと）…`);
        const b = await buildBackground(ctx.video, 0, undefined, BG_STEP);
        ctx.log(`背景: 戦闘中のフレーム ${b.used} / ${b.seen} の中央値`);
        return b.bg;
      })();
      return bg;
    };
    const summaries: LandingSummary[] = [];
    for (const iv of list) {
      const rows = await measure(ctx, iv, step, background);
      const s = summarizeLanding(rows);
      ctx.log(
        `${iv.name}（f${iv.first}〜${iv.last}）: 幅 ${s.width ?? '-'}・使ったフレーム ${s.used} / ${s.total}・上端の y ${s.top ?? '-'}・照準の y ${s.aimY ?? '-'}・着地点 ${s.landing}`,
      );
      summaries.push(s);
    }
    if (summaries.some((s) => s.width === undefined)) throw new Error('的の幅が出ない区間がある');
    const names = list.map((iv) => iv.name).join('・');
    const join = (f: (s: LandingSummary) => string | number | undefined): string =>
      summaries.map((s) => String(f(s) ?? '-')).join('・');
    return [
      observation(
        this,
        'size',
        summaries.map((s) => s.width!),
        `${who(ctx)}${conditions(ctx)} の近の ${list.length} 区間（${names}）の、照準の高さ ±30px での的の幅（的のふだんの姿勢のフレームの中央値）。近の着地点（C-0155）を見分ける値`,
        `区間は ${list.map((iv) => `f${iv.first}〜${iv.last}`).join('・')}（トリガーの最初と最後。${how}）。` +
          `aim.ts の部品で ${step}f ごとに測った（背景は録画の全体の ${BG_STEP}f ごとの、戦闘中のフレームの中央値）。` +
          `ふだんの姿勢は的の上端の y が ${POSE_TOP_MIN} 以上のフレーム（腕を上げると 170 前後になる）で、爆発などで隠れたフレーム（fx ${FX_HIDDEN} 以上）は除いた。` +
          `使ったフレームは ${summaries.map((s) => `${s.used} / ${s.total}`).join('・')}。` +
          `的の上端の y の中央値は ${join((s) => s.top)}、照準の中心の y は ${join((s) => s.aimY)}。` +
          `着地点は ${join((s) => s.landing)}（近 A は幅 ${LANDING_A.min}〜${LANDING_A.max}px、近 B は ${LANDING_B_MIN}px 以上。V-0069・V-0070 の 14 本の範囲で、外は決めない。` +
          `近 B は的の足元が aim.ts の探す範囲の下端 702 に掛かり、足元の y は読めない）`,
        { unit: 'px' },
      ),
    ];
  },
};
