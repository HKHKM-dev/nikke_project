// レシピ sg-pellets: SG 単騎の録画で、的のジャンプで分けた区間ごとの当たったペレットの割合・会心・コアを、HUD の増分から出す
// （V-0062・V-0069・V-0070・V-0073 の読み方。plan/design-records-automation.md 3.4 節）。
//
// --opt:
//   pellet=<胴体>            1 ペレットの胴体（距離ボーナスなし）。無ければ録画の hit の観測値の 1 つ目を使う
//   crit=<会心> core=<コア>  スペック固定 OFF の 1 ペレットの会心・コア。無ければ hit の観測値の 2・3 つ目
//   nearBody=<近の胴体>      スペック固定 OFF の近の胴体。無ければ 胴体 × 1.3 の切り捨てと切り上げのうち、厳密に合う発が多い方
//   slack=<幅>               スペック固定 OFF のコアの 1 ペレットが画面の値より多くなりうる幅（既定 2）
//   pelletUntil=<f>:<胴体>   そのフレームより前の発は別の胴体（クイーン（真）の最初の 15 秒の攻撃力▲など）
//   critRate=<会心率>        スペック固定 ON の近以外の見積もりに置く会心率（既定 0.154。C-0159）
//   coreRates=<中近>,<遠>,<中遠>  同じ見積もりに置くコア命中率（既定 0.026,0.006,0.016。V-0072 の値）
//   cuts=<f>,<f>,...         区間の切れ目（ジャンプの明けの最初の発のフレーム）を手で与える
//   debug=1                  発ごとの分解を標準エラーに出す
import { readFileSync, existsSync } from 'node:fs';
import { loadHudJumps } from './hud-jumps.ts';
import {
  calibrateExact,
  distribution,
  regimeOfExact,
  regimeOfUnits,
  solveExact,
  solveUnits,
  splitGroupHits,
  type ExactValues,
} from './pellets.ts';
import { findJumpBoundaries, intervalName, splitIntervals, type Interval, type TriggerGroup } from './triggers.ts';
import { observation, roundTo, type Recipe, type RecipeContext, type RecipeObservation } from './types.ts';
import type { Observation } from '../../../packages/core/src/records/observations.ts';

const OBSERVATIONS_DIR = new URL('../../../records/observations/', import.meta.url);

/** 録画の hit の観測値（1 ペレットの値 [胴体, 会心, コア]）があれば返す */
function pelletFromObservations(
  recordingId: string,
): { body: number; crit?: number; core?: number; id: string } | undefined {
  const path = new URL(`${recordingId}.json`, OBSERVATIONS_DIR);
  if (!existsSync(path)) return undefined;
  const list = JSON.parse(readFileSync(path, 'utf8')) as Observation[];
  const hit = list.find(
    (o) => o.kind === 'hit' && Array.isArray(o.value) && !o.invalid && /1 ペレット/.test(o.description),
  );
  if (!hit || !Array.isArray(hit.value)) return undefined;
  const [body, crit, core] = hit.value;
  return body === undefined ? undefined : { body, crit, core, id: hit.id };
}

type PerGroup = {
  group: TriggerGroup;
  /** 当たった数（決まったとき） */
  h?: number;
  /** 会心 + 2 × コア（units）か、会心・コアの数（exact） */
  u?: number;
  c?: number;
  k?: number;
  /** 分けられなかった */
  failed: boolean;
  alternatives: number;
  /** 2 発以上の組を発ごとに分けた当たった数（近の区間で、決まったときだけ。splitGroupHits） */
  split?: number[];
};

type IntervalStats = {
  interval: Interval;
  triggers: number;
  /** 分けられた発の数と、当たったペレット（exact か near のとき） */
  solvedTriggers: number;
  hits: number;
  u: number;
  crit: number;
  core: number;
  failed: number;
  /** 見積もり（units の近以外） */
  estimated: number | undefined;
  sumIncrement: number;
  perGroup: PerGroup[];
};

export const sgPellets: Recipe = {
  name: 'sg-pellets',
  version: 3,
  describe:
    'SG 単騎の区間ごとの当たったペレットの割合（rate）、近の当たった数の分布（count）、近の「会心 + 2 × コア」（rate）、' +
    'スペック固定 OFF ならコア命中率と会心率（rate）',
  options: {
    pellet: '1 ペレットの胴体（距離ボーナスなし）。無ければ hit の観測値',
    crit: 'スペック固定 OFF の 1 ペレットの会心',
    core: 'スペック固定 OFF の 1 ペレットのコア',
    nearBody: 'スペック固定 OFF の近の胴体',
    slack: 'スペック固定 OFF のコアの 1 ペレットが画面の値より多くなりうる幅（既定 2）',
    pelletUntil: '<f>:<胴体>。そのフレームより前の発の胴体',
    critRate: 'スペック固定 ON の近以外の見積もりに置く会心率（既定 0.154）',
    coreRates: '同じ見積もりのコア命中率 中近,遠,中遠（既定 0.026,0.006,0.016）',
    cuts: '区間の切れ目（ジャンプの明けの最初の発のフレーム）をカンマ区切りで',
    debug: '発ごとの分解を標準エラーに出す',
  },
  async run(ctx) {
    const fixed = ctx.recording.fixedSpec;
    if (fixed === null) throw new Error('録画の fixedSpec が無い');
    const fromObs = pelletFromObservations(ctx.recording.id);
    const body = ctx.options.pellet !== undefined ? Number(ctx.options.pellet) : fromObs?.body;
    if (body === undefined) throw new Error('1 ペレットの胴体が分からない。--opt pellet=<胴体> を与える');
    const bodySource = ctx.options.pellet !== undefined ? '--opt pellet' : `観測値 ${fromObs!.id}`;
    const until = parseUntil(ctx.options.pelletUntil);
    const bodyOf = (g: TriggerGroup): number => (until !== undefined && g.frame < until.frame ? until.body : body);
    const { groups } = await loadHudJumps(ctx);
    const cuts = ctx.options.cuts?.split(',').map((s) => Number(s.trim()));

    const mode = fixed ? 'units' : 'exact';
    let exact: { near: ExactValues; far: ExactValues; note: string } | undefined;
    if (mode === 'exact') {
      const crit = ctx.options.crit !== undefined ? Number(ctx.options.crit) : fromObs?.crit;
      const core = ctx.options.core !== undefined ? Number(ctx.options.core) : fromObs?.core;
      if (crit === undefined || core === undefined) {
        throw new Error('スペック固定 OFF は会心・コアの 1 ペレットの値が要る（--opt crit= core=）');
      }
      const slack = Number(ctx.options.slack ?? '2');
      const samples = groups.map((g) => ({ increment: g.increment, maxPellets: g.shots * 10 }));
      const far = calibrateExact(samples, [body], crit - body, core - body, slack);
      const nearBodies =
        ctx.options.nearBody !== undefined
          ? [Number(ctx.options.nearBody)]
          : [...new Set([Math.floor(body * 1.3), Math.ceil(body * 1.3)])];
      const near = calibrateExact(samples, nearBodies, crit - body, core - body, slack);
      exact = {
        near,
        far,
        note:
          `1 ペレットの胴体 ${fmt(body)}・会心 ${fmt(crit)}・コア ${fmt(core)}〜${fmt(core + slack)}（${bodySource}）。会心の上乗せは、` +
          `増分に厳密に合う発が最も多い値に ±3 の範囲で合わせた: 近以外 +${fmt(far.critAdd)}（${far.fits} 発が合う）、` +
          `近は胴体 ${fmt(near.body)}・会心 +${fmt(near.critAdd)}（${near.fits} 発）`,
      };
    }
    const regimeOf = (g: TriggerGroup) =>
      mode === 'units'
        ? regimeOfUnits(g.increment, bodyOf(g) / 10, g.shots * 10)
        : regimeOfExact(g.increment, exact!.near, exact!.far, g.shots * 10);
    const found = findJumpBoundaries(groups, regimeOf, cuts);
    for (const n of found.notes) ctx.log(n);
    if (found.errors.length > 0) throw new Error(found.errors.join('\n'));
    const intervals = splitIntervals(groups, found.boundaries);
    const critRate = Number(ctx.options.critRate ?? '0.154');
    const coreRates = (ctx.options.coreRates ?? '0.026,0.006,0.016').split(',').map(Number) as [number, number, number];
    const coreRateOf = (label: Interval['label']): number =>
      label === '中近' ? coreRates[0] : label === '遠' ? coreRates[1] : coreRates[2];

    const stats: IntervalStats[] = intervals.map((interval) => {
      const near = interval.label === '近';
      /** 1 発（10 ペレットまで）として解いた当たった数。近の区間の、2 発以上の組を分けるときに使う */
      const solveOne = (group: TriggerGroup, increment: number): number | undefined => {
        if (mode === 'units') {
          const s = solveUnits(increment, bodyOf(group) / 10, true, 10);
          return s.kind === 'near' ? s.h : undefined;
        }
        const s = solveExact(increment, exact!.near, 10);
        return s.kind === 'ok' ? s.h : undefined;
      };
      const withSplit = (p: PerGroup): PerGroup => {
        const parts = p.group.parts;
        if (!near || p.h === undefined || p.group.shots < 2 || parts === undefined) return p;
        const split = splitGroupHits(parts, p.group.shots, p.h, (inc) => solveOne(p.group, inc));
        return split === undefined ? p : { ...p, split };
      };
      const perGroup: PerGroup[] = interval.groups.map((group) => {
        const maxPellets = group.shots * 10;
        if (mode === 'units') {
          const s = solveUnits(group.increment, bodyOf(group) / 10, near, maxPellets);
          if (s.kind === 'near')
            return withSplit({ group, h: s.h, u: s.u, failed: false, alternatives: s.alternatives });
          return { group, failed: s.kind === 'none', alternatives: 0 };
        }
        const s = solveExact(group.increment, near ? exact!.near : exact!.far, maxPellets);
        if (s.kind === 'ok')
          return withSplit({
            group,
            h: s.h,
            c: s.c,
            k: s.k,
            u: s.c + 2 * s.k,
            failed: false,
            alternatives: s.alternatives,
          });
        return { group, failed: true, alternatives: 0 };
      });
      if (ctx.options.debug !== undefined) {
        for (const p of perGroup) {
          const sol =
            p.h === undefined
              ? p.failed
                ? '分けられない'
                : '近以外（h は見積もり）'
              : `h ${p.h}${p.split === undefined ? '' : `（発ごとに ${p.split.join('・')}）`} u ${p.u}${p.c === undefined ? '' : ` 会心 ${p.c} コア ${p.k}`}`;
          ctx.log(
            `  ${intervalName(interval)} f${p.group.frame} +${fmt(p.group.increment)}${p.group.shots > 1 ? `（${p.group.shots} 発）` : ''}: ${sol}${p.alternatives > 0 ? `（ほか ${p.alternatives} 候補）` : ''}`,
          );
        }
      }
      const solved = perGroup.filter((p) => p.h !== undefined);
      const sumIncrement = interval.groups.reduce((s, g) => s + g.increment, 0);
      const estimated =
        mode === 'units' && interval.label !== '近'
          ? interval.groups.reduce(
              (s, g) => s + g.increment / (bodyOf(g) * (1 + 0.5 * critRate + coreRateOf(interval.label))),
              0,
            )
          : undefined;
      return {
        interval,
        triggers: interval.triggers,
        solvedTriggers: solved.reduce((s, p) => s + p.group.shots, 0),
        hits: solved.reduce((s, p) => s + p.h!, 0),
        u: solved.reduce((s, p) => s + (p.u ?? 0), 0),
        crit: solved.reduce((s, p) => s + (p.c ?? 0), 0),
        core: solved.reduce((s, p) => s + (p.k ?? 0), 0),
        failed: perGroup.filter((p) => p.failed).length,
        estimated,
        sumIncrement,
        perGroup,
      };
    });
    return [
      ...rateObservations(this, ctx, stats, mode, bodySource, body, exact?.note, critRate, coreRates, found.summary),
      ...nearObservations(this, ctx, stats, mode),
    ];
  },
};

function parseUntil(spec: string | undefined): { frame: number; body: number } | undefined {
  if (spec === undefined) return undefined;
  const [f, b] = spec.split(':').map(Number);
  if (f === undefined || b === undefined || !Number.isFinite(f) || !Number.isFinite(b))
    throw new Error(`pelletUntil は <f>:<胴体>: ${spec}`);
  return { frame: f, body: b };
}

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

function who(ctx: RecipeContext): string {
  return ctx.recording.team.map((m) => `${m.name}（SG）`).join('・');
}

function conditions(ctx: RecipeContext): string {
  const parts = ['単騎'];
  if (ctx.recording.autoFire) parts.push('AUTO');
  parts.push(ctx.recording.fixedSpec ? 'スペック固定 ON' : 'スペック固定 OFF');
  return parts.join('・');
}

/** 区間ごとの割合（と、スペック固定 OFF の会心率・コア命中率） */
function rateObservations(
  recipe: Recipe,
  ctx: RecipeContext,
  stats: IntervalStats[],
  mode: 'units' | 'exact',
  bodySource: string,
  body: number,
  exactNote: string | undefined,
  critRate: number,
  coreRates: [number, number, number],
  summary: { magazine: number; reloadGap: number; shotInterval: number },
): RecipeObservation[] {
  const used = stats.filter((s) => !s.interval.short);
  const labels = used.map((s) => s.interval.label).join(' → ');
  const frames = used.map((s) => `f${s.interval.first}〜${s.interval.last}`).join('・');
  const triggers = used.map((s) => s.triggers).join('・');
  const ratio = (s: IntervalStats): number => {
    const hits = s.estimated ?? s.hits;
    const shots = s.estimated !== undefined ? s.triggers : s.solvedTriggers;
    return roundTo(hits / (shots * 10), 3);
  };
  const pellets = used.map((s) => (s.estimated !== undefined ? roundTo(s.estimated, 1) : s.hits)).join('・');
  const failed = used.map((s) => s.failed).join('・');
  const short = stats.find((s) => s.interval.short);
  const common =
    `区間（トリガーの最初と最後）は ${frames}。トリガー数は ${triggers}、当たったペレットは ${pellets}。` +
    `分けられなかった組は ${failed} 個（分子からも分母からも外した）。` +
    `発の間 ${summary.shotInterval}f・マガジン ${summary.magazine} トリガー・リロードの空き ${summary.reloadGap}f。` +
    (short ? `最後の短い遠の区間（${short.triggers} トリガー）は入れていない。` : '');
  const out: RecipeObservation[] = [];
  if (mode === 'units') {
    const estimateNote =
      `近の区間は距離ボーナス（×1.3）の端数から、トリガーごとに当たった数が一意に決まる（1 ペレットの胴体 ${fmt(body)}、${bodySource}）。` +
      `ほかの区間は、区間の増分の合計 ÷（1 ペレットの胴体 ×（1 + 0.5 × ${critRate} + コア命中率））の見積もり` +
      `（コア命中率は中近 ${coreRates[0]}・遠 ${coreRates[1]}・中遠 ${coreRates[2]}）。`;
    out.push(
      observation(
        recipe,
        'rate',
        used.map(ratio),
        `${who(ctx)}${conditions(ctx)} の 180 秒で、的のジャンプで分けた区間（${labels}）ごとの、当たったペレットの割合（当たった数 ÷（トリガー数 × 10））。近は増分から数えた値、ほかは見積もり`,
        common + estimateNote,
        { unit: '割合' },
      ),
    );
    return out;
  }
  out.push(
    observation(
      recipe,
      'rate',
      used.map(ratio),
      `${who(ctx)}${conditions(ctx)} の、的のジャンプで分けた区間（${labels}）ごとの当たったペレットの割合（当たった数 ÷（トリガー数 × 10））。どの区間も増分から数えた値（見積もりではない）`,
      common +
        `スペック固定 OFF では会心の上乗せが胴体の半分でなく、コアが胴体 2 個と 1〜2 違うので、近以外の区間でも当たった数・会心・コアが増分から決まる（${exactNote}。候補が複数の発は当たった数が最大で、次にコアが少ないものを取った）。`,
      { unit: '割合' },
    ),
  );
  out.push(
    observation(
      recipe,
      'rate',
      used.map((s) => roundTo(s.core / s.hits, 3)),
      `${who(ctx)}${conditions(ctx)} の、区間（${labels}）ごとのコア命中率（コアに当たったペレット ÷ 当たったペレット）`,
      `コアは ${used.map((s) => s.core).join('・')} 個。会心は ${used.map((s) => s.crit).join('・')} 個（会心率は計 ${roundTo(
        used.reduce((a, s) => a + s.crit, 0) / used.reduce((a, s) => a + s.hits, 0),
        3,
      )}）。当たったペレットは ${used.map((s) => s.hits).join('・')}。数え方は割合の観測値と同じ`,
      { unit: '割合' },
    ),
  );
  out.push(
    observation(
      recipe,
      'rate',
      used.map((s) => roundTo(s.crit / s.hits, 3)),
      `${who(ctx)}${conditions(ctx)} の、区間（${labels}）ごとの会心率（会心になったペレット ÷ 当たったペレット）`,
      `会心は ${used.map((s) => s.crit).join('・')} 個、当たったペレットは ${used.map((s) => s.hits).join('・')}。数え方は割合の観測値と同じ`,
      { unit: '割合' },
    ),
  );
  return out;
}

/** 近の 2 区間の、当たった数の分布と「会心 + 2 × コア」 */
function nearObservations(
  recipe: Recipe,
  ctx: RecipeContext,
  stats: IntervalStats[],
  mode: 'units' | 'exact',
): RecipeObservation[] {
  const near = stats.filter((s) => s.interval.label === '近');
  if (near.length === 0) return [];
  const names = near.map((s) => intervalName(s.interval)).join('・');
  const dist = near.flatMap((s) =>
    distribution(s.perGroup.flatMap((p) => (p.h === undefined ? [] : p.group.shots === 1 ? [p.h] : (p.split ?? [])))),
  );
  const multi = near.map((s) => s.perGroup.filter((p) => p.h !== undefined && p.group.shots > 1));
  const splitCount = multi.map((list) => list.filter((p) => p.split !== undefined).length);
  const unsplit = multi.map((list) => list.filter((p) => p.split === undefined).length);
  const out: RecipeObservation[] = [];
  out.push(
    observation(
      recipe,
      'count',
      dist,
      `${who(ctx)}${conditions(ctx)} の近の ${near.length} 区間（${names}）で、当たったペレットが 10・9・8・7 以下だったトリガーの数（区間ごとに 4 つずつ）`,
      near
        .map(
          (s) =>
            `${intervalName(s.interval)}: ${s.triggers} トリガー${s.failed > 0 ? `（分けられなかった ${s.failed} 組を除いて ${s.solvedTriggers}）` : ''}・当たったペレット ${s.hits}（割合 ${roundTo(s.hits / (s.solvedTriggers * 10), 3)}）・会心 + 2 × コアのぶん ${s.u}`,
        )
        .join('。') +
        `。読みが割れて 2 発以上にまとめた組のうち、読みを発ごとに区切ってどの区切り方でも当たった数が同じになった組（${splitCount.join('・')} 個）は、発ごとの値を分布に入れた。` +
        `決まらなかった組（${unsplit.join('・')} 個）は、当たった数の合計には入れたが分布には入れていない`,
      { unit: 'トリガー' },
    ),
  );
  if (mode === 'units') {
    out.push(
      observation(
        recipe,
        'rate',
        near.map((s) => roundTo(s.u / s.hits, 4)),
        `${who(ctx)}${conditions(ctx)} の近の ${near.length} 区間（${names}）の、当たったペレット 1 個あたりの「会心 + 2 × コア」のぶん（会心率 + 2 × コア命中率。近の増分から一意に出る）`,
        near.map((s) => `${intervalName(s.interval)}: 会心 + 2 × コア ${s.u} ÷ 当たったペレット ${s.hits}`).join('。') +
          '。会心とコアは、1 発の値（コア 1 + 胴体 1 = 会心 2）でも分けられない',
        { unit: '割合' },
      ),
    );
  }
  return out;
}
