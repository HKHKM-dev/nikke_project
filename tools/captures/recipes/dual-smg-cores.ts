// レシピ dual-smg-cores: 二丁持ちの SMG（muzzleCount 2）単騎・射撃場 3 分モードの、区間ごとのコア命中率とヒットごとの命中率（V-0705）。
//
// - 二丁持ちの 1 発は 2 ヒット（C-1023）で、HUD の総ダメージの増分（hud-jumps のキャッシュ）は、その発で当たったヒット（1 か 2）の和。
//   値 = 胴体 × 攻撃力▲ × (h × (1 + 距離ボーナス d) + コア × k + 会心 × j)（h は当たったヒットの数、k・j はそのうちのコア・会心の数、
//   d は区間で決まる。近・中近は 1、遠は 0、中遠は 0 か 1）。前のフレームも読めた増分（readGap 1）だけを 1 発として読み、読めなかった
//   後の増分（数発がまとまる）は落とす。
// - 会心の上乗せが 0.5 なら「会心 2 つ = コア 1 つ」、距離ボーナスの無い所では「コアの 1 ヒット = 胴体の 2 ヒット」のように、増分ごとには
//   h・k が決まらないことがある。そこで、増分ごとに合う (h, k, j, 会心の版) の候補を全部残し、ヒットの当たり（命中率 q）・コア（p）・
//   会心（版ごとの c）がヒットごとに独立として、EM で最尤の値を決める。q と p は距離帯ごと。h は「1 ヒット以上当たった発」の条件付き
//   （2 ヒットとも外れた発は増分が無い）。会心の版（--opt crit を , で並べる。ソリンの S2 の有無など）は、増分ごとにどれか 1 つが効くとみて、
//   版の割合も同時に決める。攻撃力▲の段は区別しない（同じ重み）。
// - 2 ヒットとも外れた発は、マガジンの中の増分の空き（読めた増分どうしの 20f 未満の空き）を発の刻みで割って数え、q から出す (1 − q)² と並べる。
// - 区間の切れ目は --opt cuts か smg-hits.ts の detectCuts（2 ヒットの和を「胴体 2 倍の 1 ヒット」とみて距離ボーナスを見る）。
import { loadHudJumps } from './hud-jumps.ts';
import { BAND_ORDER, BANDS, longGaps, type Band } from './smg-cores.ts';
import { detectCuts, groupMagazines, segmentOf, type HudIncrement } from './smg-hits.ts';
import { observation, roundTo, type Recipe } from './types.ts';

export type DualGrid = {
  body: number;
  /** コアの上乗せ（コアの倍率 − 1） */
  core: number;
  /** 会心の上乗せの版（素の 0.5、クリティカルダメージ▲の乗った値 など） */
  crits: readonly number[];
  distance: number;
  /** 攻撃力▲の倍率（1 を含む） */
  atk: readonly number[];
  /** 1 発のヒットの数（二丁持ちは 2） */
  muzzles: number;
};

/** 増分の候補。hits は当たったヒットの数、cores・crits はそのうちのコア・会心の数、crit は会心の版の番号 */
export type DualCandidate = { hits: number; cores: number; crits: number; crit: number };

/** 距離帯ごとの距離ボーナスの有無の候補（中遠は着地点で付くか付かないか） */
export const DIST_OF: Record<Band, readonly number[]> = { near: [1], midNear: [1], far: [0], midFar: [0, 1] };

/** 1 発の増分を格子で読む（候補が無ければ空）。許しは tol + 0.5 ×（ヒットの数 − 1）（ヒットごとの丸め） */
export function readDualIncrement(increment: number, g: DualGrid, dists: readonly number[], tol: number): DualCandidate[] {
  const found = new Map<string, DualCandidate>();
  for (let hits = 1; hits <= g.muzzles; hits++) {
    const allow = tol + 0.5 * (hits - 1);
    for (const m of g.atk) {
      for (const dist of dists) {
        for (const [crit, critAdd] of g.crits.entries()) {
          for (let cores = 0; cores <= hits; cores++) {
            for (let crits = 0; crits <= hits; crits++) {
              const value = g.body * m * (hits * (1 + g.distance * dist) + g.core * cores + critAdd * crits);
              if (Math.abs(increment - value) <= allow) found.set(`${hits}:${cores}:${crits}:${crit}`, { hits, cores, crits, crit });
            }
          }
        }
      }
    }
  }
  return [...found.values()];
}

/** 区間（segment。0 始まり）ごとに読めた増分 */
export type DualRow = { segment: number; candidates: DualCandidate[] };

export type DualFit = {
  /** 距離帯ごとのコア命中率とヒットごとの命中率（1 ヒット以上当たった発からの最尤） */
  core: Record<Band, number>;
  hit: Record<Band, number>;
  /** 区間ごとのコア命中率（6 区間。q・会心は距離帯ごとの値に固定） */
  coreBySegment: number[];
  /** 距離帯ごと・区間ごとの当たったヒットの数の期待値 */
  hits: Record<Band, number>;
  hitsBySegment: number[];
  /** 会心の版ごとの会心率と、版の効いた増分の割合 */
  critRate: number[];
  critShare: number[];
  /** コアの数が一通りに決まった増分の割合 */
  determined: number;
  logLikelihood: number;
};

function binom(n: number, k: number): number {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

const bandRecord = (f: (b: Band) => number): Record<Band, number> => ({
  midNear: f('midNear'),
  near: f('near'),
  far: f('far'),
  midFar: f('midFar'),
});

const bandOf = (segment: number): Band => BANDS[Math.min(segment, BANDS.length - 1)]!;

/** EM で、距離帯ごとのコア命中率・命中率と、会心の版ごとの会心率・割合を最尤で決める。最後に区間ごとのコア命中率も決める */
export function fitDual(rows: readonly DualRow[], muzzles: number, critVersions: number, iterations = 400): DualFit {
  const nSeg = BANDS.length;
  let bandP = bandRecord(() => 0.1);
  let bandQ = bandRecord(() => 0.8);
  const segP = Array.from({ length: nSeg }, () => 0.1);
  let critRate = Array.from({ length: critVersions }, () => 0.15);
  let critShare = Array.from({ length: critVersions }, () => 1 / critVersions);
  const step = (pOf: (r: DualRow) => number) => {
    const acc = {
      cores: Array.from({ length: nSeg }, () => 0),
      hits: Array.from({ length: nSeg }, () => 0),
      shots: Array.from({ length: nSeg }, () => 0),
      crits: critRate.map(() => 0),
      critHits: critRate.map(() => 0),
      share: critRate.map(() => 0),
      ll: 0,
    };
    for (const r of rows) {
      const p = pOf(r);
      const q = bandQ[bandOf(r.segment)];
      const anyHit = 1 - (1 - q) ** muzzles;
      const ws = r.candidates.map((c) => {
        const cr = critRate[c.crit]!;
        return (
          ((binom(muzzles, c.hits) * q ** c.hits * (1 - q) ** (muzzles - c.hits)) / anyHit) *
          binom(c.hits, c.cores) *
          p ** c.cores *
          (1 - p) ** (c.hits - c.cores) *
          critShare[c.crit]! *
          binom(c.hits, c.crits) *
          cr ** c.crits *
          (1 - cr) ** (c.hits - c.crits)
        );
      });
      const sum = ws.reduce((a, b) => a + b, 0);
      if (!(sum > 0)) continue;
      acc.ll += Math.log(sum);
      acc.shots[r.segment]!++;
      r.candidates.forEach((c, i) => {
        const w = ws[i]! / sum;
        acc.hits[r.segment]! += w * c.hits;
        acc.cores[r.segment]! += w * c.cores;
        acc.crits[c.crit]! += w * c.crits;
        acc.critHits[c.crit]! += w * c.hits;
        acc.share[c.crit]! += w;
      });
    }
    return acc;
  };
  const sumBand = (xs: readonly number[], b: Band) => xs.reduce((a, x, k) => a + (bandOf(k) === b ? x : 0), 0);
  const solveQ = (meanHits: number) => {
    // 1 ヒット以上当たった発の当たったヒットの数の平均 = muzzles × q ÷ (1 − (1 − q)^muzzles) を q について二分法で解く
    if (!(meanHits > 1)) return 1e-6;
    if (meanHits >= muzzles) return 1;
    let lo = 1e-9;
    let hi = 1;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if ((muzzles * mid) / (1 - (1 - mid) ** muzzles) < meanHits) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };
  for (let it = 0; it < iterations; it++) {
    const s = step((r) => bandP[bandOf(r.segment)]);
    bandP = bandRecord((b) => {
      const h = sumBand(s.hits, b);
      return h > 0 ? sumBand(s.cores, b) / h : 0;
    });
    bandQ = bandRecord((b) => {
      const n = sumBand(s.shots, b);
      return n > 0 ? solveQ(sumBand(s.hits, b) / n) : 0.8;
    });
    critRate = s.crits.map((c, v) => (s.critHits[v]! > 0 ? c / s.critHits[v]! : critRate[v]!));
    const total = s.share.reduce((a, b) => a + b, 0);
    critShare = s.share.map((x) => x / total);
  }
  const last = step((r) => bandP[bandOf(r.segment)]);
  for (let it = 0; it < iterations; it++) {
    const s = step((r) => segP[r.segment]!);
    for (let k = 0; k < nSeg; k++) segP[k] = s.hits[k]! > 0 ? s.cores[k]! / s.hits[k]! : 0;
  }
  const determined = rows.filter((r) => new Set(r.candidates.map((c) => c.cores)).size === 1).length;
  return {
    core: bandP,
    hit: bandQ,
    coreBySegment: segP,
    hits: bandRecord((b) => sumBand(last.hits, b)),
    hitsBySegment: last.hits,
    critRate,
    critShare,
    determined: rows.length > 0 ? determined / rows.length : 0,
    logLikelihood: last.ll,
  };
}

/**
 * 2 ヒットとも外れた発の数。前のフレームも読めた増分どうしの、limit 未満の空き（マガジンの中）を発の刻みで割り、
 * 間に挟まる発を数える。区間ごとに [外れた発, 撃った発（読めた増分 + 外れた発）]
 */
export function missedShots(
  rows: readonly HudIncrement[],
  cuts: readonly number[],
  interval: number,
  limit = 20,
): { missed: number; shots: number }[] {
  const out = BANDS.map(() => ({ missed: 0, shots: 0 }));
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]!;
    const prev = rows[i - 1]!;
    if (r.readGap !== 1 || prev.readGap !== 1) continue;
    const seg = Math.min(segmentOf(r.frame, cuts), BANDS.length - 1);
    const gap = r.frame - prev.frame;
    if (gap >= limit) continue;
    const missed = Math.max(0, Math.round(gap / interval) - 1);
    out[seg]!.missed += missed;
    out[seg]!.shots += missed + 1;
  }
  return out;
}

function parseList(text: string | undefined, name: string): number[] {
  const xs = (text ?? '')
    .split(',')
    .filter((x) => x !== '')
    .map(Number);
  if (xs.some((x) => !Number.isFinite(x))) throw new Error(`--opt ${name}=<数>,<数>,... の形が違う`);
  return xs;
}

const BAND_JA: Record<Band, string> = { midNear: '中近', near: '近', far: '遠', midFar: '中遠' };
const SEG_JA = BANDS.map((b) => BAND_JA[b]);

export const dualSmgCores: Recipe = {
  name: 'dual-smg-cores',
  version: 1,
  describe:
    '二丁持ちの SMG 単騎・射撃場 3 分モードの、距離帯ごと（近・中近・中遠・遠）と区間ごと（6 区間）のコア命中率と、距離帯ごとのヒットの命中率・2 ヒットとも外れた発の割合（rate。1 発の増分から最尤）、当たったヒットの数（count）',
  options: {
    body: '1 ヒットの胴体（距離ボーナスなし・非会心・攻撃力▲の外）',
    core: 'コアの上乗せ（コアの倍率 − 1。既定 1）',
    crit: '会心の上乗せの版をカンマ区切りで（既定 0.5。クリティカルダメージ▲の時間があれば 0.5,<上乗せ>）',
    distance: '距離ボーナスの上乗せ（既定 0.3）',
    atk: '攻撃力▲の倍率をカンマ区切りで（1 は自動で入る）',
    tol: '格子の値との差の許し（既定 2。ヒットごとに 0.5 を足す）',
    cuts: '区間の切れ目（ジャンプの前の最後の増分のフレーム）をカンマ区切りで（5 つ）。省けば smg-hits.ts の detectCuts',
    skip: '数えない範囲 <f>-<f> をカンマ区切りで',
    mag: '装弾数（detectCuts に使う。既定 120）',
  },
  async run(ctx) {
    const body = Number(ctx.options.body);
    if (!Number.isFinite(body) || body <= 0) throw new Error('--opt body=<胴体> が要る');
    const num = (k: string, d: number) => (ctx.options[k] === undefined ? d : Number(ctx.options[k]));
    const crits = parseList(ctx.options.crit, 'crit');
    const grid: DualGrid = {
      body,
      core: num('core', 1),
      crits: crits.length > 0 ? crits : [0.5],
      distance: num('distance', 0.3),
      atk: [1, ...parseList(ctx.options.atk, 'atk')],
      muzzles: 2,
    };
    const tol = num('tol', 2);
    const mag = num('mag', 120);
    const skip = (ctx.options.skip ?? '')
      .split(',')
      .filter((x) => x !== '')
      .map((s) => {
        const m = /^(\d+)-(\d+)$/.exec(s);
        if (m === null) throw new Error('--opt skip=<f>-<f>,... の形が違う');
        return [Number(m[1]), Number(m[2])] as const;
      });
    const rows: HudIncrement[] = (await loadHudJumps(ctx)).rows.map((r) => ({ ...r, readGap: r.readGap ?? 1 }));
    const spans = groupMagazines(rows)
      .map((g) => (g.at(-1)!.frame - g[0]!.frame) / (mag - 1))
      .filter((d) => d > 2.1 && d < 2.8)
      .sort((a, b) => a - b);
    const interval = spans.length > 0 ? spans[Math.floor(spans.length / 2)]! : 2.5;
    const given = parseList(ctx.options.cuts, 'cuts');
    // 2 ヒットの和を、胴体 2 倍の 1 ヒット（コア・会心の上乗せは半分）とみて距離ボーナスを見る
    const cutGrid = { body: 2 * body * grid.atk.at(-1)!, core: grid.core / 2, crit: grid.crits[0]! / 2, distance: grid.distance };
    const cuts = given.length > 0 ? given : detectCuts(rows, cutGrid, mag, interval);
    if (cuts.length !== 5) ctx.log(`区間の切れ目が ${cuts.length} 個（3 分モードは 5 個）: ${cuts.join(',')}`);
    ctx.log(
      `100f を超える空き（前の増分のフレーム:空き:前のまとまりの増分の数）: ${longGaps(rows)
        .map((g) => `${g.frame}:${g.gap}:${g.groupSize}`)
        .join(' ')}`,
    );
    let lumped = 0;
    let unfit = 0;
    let skipped = 0;
    const read: DualRow[] = [];
    for (const r of rows) {
      if (skip.some(([a, b]) => r.frame >= a && r.frame <= b)) {
        skipped++;
        continue;
      }
      if (r.readGap !== 1) {
        lumped++;
        continue;
      }
      const segment = Math.min(segmentOf(r.frame, cuts), BANDS.length - 1);
      const candidates = readDualIncrement(r.increment, grid, DIST_OF[bandOf(segment)], tol);
      if (candidates.length === 0) unfit++;
      else read.push({ segment, candidates });
    }
    const fit = fitDual(read, grid.muzzles, grid.crits.length);
    const missed = missedShots(
      rows.filter((r) => !skip.some(([a, b]) => r.frame >= a && r.frame <= b)),
      cuts,
      interval,
    );
    const missedBand = (b: Band) => {
      let m = 0;
      let n = 0;
      missed.forEach((x, k) => {
        if (bandOf(k) === b) ((m += x.missed), (n += x.shots));
      });
      return { m, n };
    };
    const who = ctx.recording.team.map((m) => m.name).join('・');
    const note =
      `${body} × 攻撃力▲（${grid.atk.join('・')}）× (h × (1 + 距離ボーナス ${grid.distance} × d) + コア ${grid.core} × k + 会心 × j)` +
      `（会心の上乗せの版 ${grid.crits.join('・')}。d は近・中近 1、遠 0、中遠 0 か 1）の格子で、差 ${tol}（ヒットごとに +0.5）以内で読んだ。` +
      `前のフレームも読めた増分を 1 発とし、合う (h, k, j) の候補を全部残して、ヒットの当たり・コア・会心がヒットごとに独立として EM で最尤の値を決めた。` +
      `区間の切れ目は ${cuts.map((c) => `f${c}`).join('・')}（${given.length > 0 ? '--opt cuts' : 'detectCuts'}）。` +
      `読めた増分 ${read.length}（コアの数が一通りに決まったのは ${roundTo(fit.determined * 100, 1)}%）、数発がまとまって落とした増分 ${lumped}、` +
      `格子に乗らず落とした増分 ${unfit}${skip.length > 0 ? `、数えなかった範囲の増分 ${skipped}` : ''}。` +
      `会心率は版ごとに ${fit.critRate.map((c) => roundTo(c, 3)).join('・')}（増分の割合 ${fit.critShare.map((c) => roundTo(c, 3)).join('・')}）。` +
      `対数尤度 ${roundTo(fit.logLikelihood, 1)}`;
    return [
      observation(
        this,
        'rate',
        BAND_ORDER.map((b) => roundTo(fit.core[b], 4)),
        `${who}（二丁持ちの SMG）単騎の、距離帯ごとのコア命中率（コアのヒット / 当たったヒット。最尤）。近・中近・中遠・遠の順`,
        note,
      ),
      observation(
        this,
        'count',
        BAND_ORDER.map((b) => roundTo(fit.hits[b], 0)),
        `${who}（二丁持ちの SMG）単騎の、距離帯ごとの当たったヒットの数（読めた増分のヒットの数の期待値）。近・中近・中遠・遠の順`,
        note,
        { unit: 'ヒット' },
      ),
      observation(
        this,
        'rate',
        fit.coreBySegment.map((p) => roundTo(p, 4)),
        `${who}（二丁持ちの SMG）単騎の、区間ごとのコア命中率（最尤。命中率・会心率は距離帯ごとの当てはめの値に固定）。${SEG_JA.join('・')}の順（ヒットの数 ${fit.hitsBySegment.map((h) => roundTo(h, 0)).join('・')}）`,
        note,
      ),
      observation(
        this,
        'rate',
        BAND_ORDER.map((b) => roundTo(fit.hit[b], 4)),
        `${who}（二丁持ちの SMG）単騎の、距離帯ごとのヒットごとの命中率（1 ヒット以上当たった発の、当たったヒットの数からの最尤）。近・中近・中遠・遠の順`,
        note,
      ),
      observation(
        this,
        'rate',
        BAND_ORDER.map((b) => {
          const { m, n } = missedBand(b);
          return n > 0 ? roundTo(m / n, 4) : 0;
        }),
        `${who}（二丁持ちの SMG）単騎の、距離帯ごとの 2 ヒットとも外れた発の割合（マガジンの中の増分の空きから）。近・中近・中遠・遠の順` +
          `（${BAND_ORDER.map((b) => {
            const { m, n } = missedBand(b);
            return `${m}/${n}`;
          }).join('・')}。ヒットの命中率が独立なら (1 − q)² は ${BAND_ORDER.map((b) => roundTo((1 - fit.hit[b]) ** 2, 4)).join('・')}）`,
        `前のフレームも読めた増分どうしの 20f 未満の空きを、発の刻み ${roundTo(interval, 3)}f で割って、間に挟まる発を数えた（区間の切れ目は上と同じ ${cuts.map((c) => `f${c}`).join('・')}）`,
      ),
    ];
  },
};
