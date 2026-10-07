// レシピ smg-cores: SMG 単騎・射撃場 3 分モードの、距離帯ごと（近・中近・中遠・遠）のコア命中率（V-0298）。
// V-0110・V-0112・V-0114 で使い捨てのスクリプトにしていた数え方をレシピにしたもの。
//
// - 総ダメージの増分（hud-jumps のキャッシュ）を、1 ヒットの格子 胴体 × 攻撃力▲ × (1 + コア c + 会心 r + 距離ボーナス d)
//   （c・r・d は 0 か 1。攻撃力▲は 1 と --opt atk の倍率）で、差 tol 以内で読む。
// - 前のフレームも読めた増分（readGap 1）は 1 ヒットだけ（SMG は 1 フレームに 1 発まで。smg-hits.ts の冒頭）。読めなかった後の
//   増分は、1 ヒットか 2 ヒット（格子の値の和）として読み、ヒットの数とコアの数が一通りに決まらなければ落とす。乗らない増分も落とす
//   （HUD の桁の割れた読み違いが大半）。
// - 区間の切れ目（ジャンプの前の最後の増分のフレーム）は --opt cuts か、smg-hits.ts の detectCuts。区間の並びは
//   中近 → 近 → 遠 → 中遠 → 近 → 遠。
// - 判定の窓: 各区間の頭の head ヒット（既定 30）を除いた残り（V-0114 のミランダの S1 の▲の窓と同じ切り方）。
// - --opt skip の範囲の増分は数えない（V-0114 のミランダの中近 → 近の切れ目の、2 つの候補の間の 1 マガジン）。
import { loadHudJumps } from './hud-jumps.ts';
import { detectCuts, groupMagazines, segmentOf, type HudIncrement } from './smg-hits.ts';
import { observation, roundTo, type Recipe, type RecipeObservation } from './types.ts';

/** 1 ヒットの格子。atk は攻撃力▲の倍率（1 を含む） */
export type CoreGrid = { body: number; core: number; crit: number; distance: number; atk: readonly number[] };

export type GridValue = { value: number; core: 0 | 1; crit: 0 | 1; dist: 0 | 1; atk: number };

/** 1 ヒットの格子の値の全部（2 × 2 × 2 × 攻撃力▲の段の数） */
export function gridValues(g: CoreGrid): GridValue[] {
  const out: GridValue[] = [];
  for (const [atk, m] of g.atk.entries()) {
    for (const core of [0, 1] as const) {
      for (const crit of [0, 1] as const) {
        for (const dist of [0, 1] as const) {
          out.push({
            value: g.body * m * (1 + g.core * core + g.crit * crit + g.distance * dist),
            core,
            crit,
            dist,
            atk,
          });
        }
      }
    }
  }
  return out;
}

/** 増分の読み。hits 個のヒット（parts）に決まったか、決まらない（ambiguous）か、格子に乗らない（unfit） */
export type CoreRead =
  { kind: 'hits'; parts: GridValue[] } | { kind: 'ambiguous'; candidates: GridValue[][] } | { kind: 'unfit' };

/**
 * 増分を格子で読む。readGap 1 は 1 ヒットだけ、それ以外は 1 ヒットか 2 ヒット。候補のヒットの数とコアの数が全部同じなら決まる
 * （会心・距離ボーナス・攻撃力▲の内訳は最初の候補）
 */
export function readIncrement(increment: number, readGap: number, values: readonly GridValue[], tol: number): CoreRead {
  const cands: GridValue[][] = [];
  for (const v of values) if (Math.abs(increment - v.value) <= tol) cands.push([v]);
  if (readGap > 1) {
    for (let i = 0; i < values.length; i++) {
      for (let j = i; j < values.length; j++) {
        if (Math.abs(increment - values[i]!.value - values[j]!.value) <= tol) cands.push([values[i]!, values[j]!]);
      }
    }
  }
  if (cands.length === 0) return { kind: 'unfit' };
  const key = (c: GridValue[]) => `${c.length}:${c.reduce((s, v) => s + v.core, 0)}`;
  if (new Set(cands.map(key)).size > 1) return { kind: 'ambiguous', candidates: cands };
  return { kind: 'hits', parts: cands[0]! };
}

export const BANDS = ['midNear', 'near', 'far', 'midFar', 'near', 'far'] as const;
export type Band = (typeof BANDS)[number];
/** 観測値の並び（V-0110 から同じ） */
export const BAND_ORDER = ['near', 'midNear', 'midFar', 'far'] as const;
const BAND_JA: Record<Band, string> = { midNear: '中近', near: '近', far: '遠', midFar: '中遠' };

export type BandCount = { hits: number; cores: number; crits: number };
export type CoreTally = {
  /** 頭の head ヒットを除いた残り */
  window: Record<Band, BandCount>;
  /** 区間の全部のヒット */
  all: Record<Band, BandCount>;
  /** 区間ごとの全部のヒットの数 */
  segmentHits: number[];
  /** 攻撃力▲の段ごとのヒットの数（全部） */
  atkHits: number[];
  /** 距離帯と距離ボーナスが合わないヒット（近・中近で付かない、遠で付く） */
  distMismatch: number;
  ambiguous: number;
  unfit: number;
  skipped: number;
};

const emptyBands = (): Record<Band, BandCount> => ({
  midNear: { hits: 0, cores: 0, crits: 0 },
  near: { hits: 0, cores: 0, crits: 0 },
  far: { hits: 0, cores: 0, crits: 0 },
  midFar: { hits: 0, cores: 0, crits: 0 },
});

/** 増分の列を数える。skip は数えない範囲 [from, to]（フレーム） */
export function tallyCores(
  rows: readonly HudIncrement[],
  grid: CoreGrid,
  cuts: readonly number[],
  head: number,
  tol: number,
  skip: readonly (readonly [number, number])[] = [],
): CoreTally {
  const values = gridValues(grid);
  const t: CoreTally = {
    window: emptyBands(),
    all: emptyBands(),
    segmentHits: BANDS.map(() => 0),
    atkHits: grid.atk.map(() => 0),
    distMismatch: 0,
    ambiguous: 0,
    unfit: 0,
    skipped: 0,
  };
  for (const r of rows) {
    if (skip.some(([a, b]) => r.frame >= a && r.frame <= b)) {
      t.skipped++;
      continue;
    }
    const read = readIncrement(r.increment, r.readGap, values, tol);
    if (read.kind === 'unfit') {
      t.unfit++;
      continue;
    }
    if (read.kind === 'ambiguous') {
      t.ambiguous++;
      continue;
    }
    const seg = Math.min(segmentOf(r.frame, cuts), BANDS.length - 1);
    const band = BANDS[seg]!;
    const before = t.segmentHits[seg]!;
    t.segmentHits[seg] = before + read.parts.length;
    for (const p of read.parts) {
      t.atkHits[p.atk]!++;
      if ((band === 'near' || band === 'midNear') && p.dist === 0) t.distMismatch++;
      if (band === 'far' && p.dist === 1) t.distMismatch++;
      for (const target of before >= head ? [t.all, t.window] : [t.all]) {
        target[band].hits++;
        target[band].cores += p.core;
        target[band].crits += p.crit;
      }
    }
  }
  return t;
}

/** 区間の切れ目の候補の確かめ用: ヒットの 100f を超える空き（前のフレームと、空きの長さ、前のまとまりのヒットの数） */
export function longGaps(
  rows: readonly HudIncrement[],
  over = 100,
): { frame: number; gap: number; groupSize: number }[] {
  const out: { frame: number; gap: number; groupSize: number }[] = [];
  let groupStart = 0;
  for (let i = 1; i < rows.length; i++) {
    const gap = rows[i]!.frame - rows[i - 1]!.frame;
    if (gap > over) {
      out.push({ frame: rows[i - 1]!.frame, gap, groupSize: i - groupStart });
      groupStart = i;
    }
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

const ratio = (c: BandCount) => (c.hits > 0 ? roundTo(c.cores / c.hits, 3) : 0);
const frac = (c: BandCount) => `${c.cores} / ${c.hits}`;

export const smgCores: Recipe = {
  name: 'smg-cores',
  version: 1,
  describe:
    'SMG 単騎・射撃場 3 分モードの、距離帯ごと（近・中近・中遠・遠）のコア命中率（各区間の頭の head ヒットを除いた残り（rate）と全部（rate））、そのコアの数と当たった数（count）',
  options: {
    body: '1 ヒットの胴体（距離ボーナスなし・非会心・攻撃力▲の外）',
    core: 'コアの上乗せ（コアの倍率 − 1。既定 1。ミランダは 1.5）',
    crit: '会心の上乗せ（既定 0.5）',
    distance: '距離ボーナスの上乗せ（既定 0.3）',
    atk: '攻撃力▲の倍率をカンマ区切りで（1 は自動で入る。ミランダの宝物版 S1 は 1.5011）',
    head: '各区間の頭から除くヒットの数（既定 30）',
    tol: '格子の値との差の許し（既定 2）',
    cuts: '区間の切れ目（ジャンプの前の最後の増分のフレーム）をカンマ区切りで（5 つ）。省けば smg-hits.ts の detectCuts',
    skip: '数えない範囲 <f>-<f> をカンマ区切りで',
    mag: '装弾数（detectCuts に使う。既定 120）',
  },
  async run(ctx) {
    const body = Number(ctx.options.body);
    if (!Number.isFinite(body) || body <= 0) throw new Error('--opt body=<胴体> が要る');
    const num = (k: string, d: number) => (ctx.options[k] === undefined ? d : Number(ctx.options[k]));
    const grid: CoreGrid = {
      body,
      core: num('core', 1),
      crit: num('crit', 0.5),
      distance: num('distance', 0.3),
      atk: [1, ...parseList(ctx.options.atk, 'atk')],
    };
    const head = num('head', 30);
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
    const rows = (await loadHudJumps(ctx)).rows.map((r) => ({ ...r, readGap: r.readGap ?? 1 }));
    const spans = groupMagazines(rows)
      .map((g) => (g.at(-1)!.frame - g[0]!.frame) / (mag - 1))
      .filter((d) => d > 2.1 && d < 2.8)
      .sort((a, b) => a - b);
    const interval = spans.length > 0 ? spans[Math.floor(spans.length / 2)]! : 2.43;
    const given = parseList(ctx.options.cuts, 'cuts');
    // detectCuts は距離ボーナスを 1 ヒットの増分で見るので、ヒットの多い攻撃力▲の段（最後の段）の胴体で探す
    const cutGrid = { body: body * grid.atk.at(-1)!, core: grid.core, crit: grid.crit, distance: grid.distance };
    const cuts = given.length > 0 ? given : detectCuts(rows, cutGrid, mag, interval);
    if (cuts.length !== 5) ctx.log(`区間の切れ目が ${cuts.length} 個（3 分モードは 5 個）: ${cuts.join(',')}`);
    ctx.log(
      `100f を超える空き（前の増分のフレーム:空き:前のまとまりの増分の数）: ${longGaps(rows)
        .map((g) => `${g.frame}:${g.gap}:${g.groupSize}`)
        .join(' ')}`,
    );
    const t = tallyCores(rows, grid, cuts, head, tol, skip);
    const who = ctx.recording.team.map((m) => m.name).join('・');
    const bands = (rec: Record<Band, BandCount>) => BAND_ORDER.map((b) => `${BAND_JA[b]} ${frac(rec[b])}`).join('、');
    const allHits = BAND_ORDER.reduce((s, b) => s + t.all[b].hits, 0);
    const allCrits = BAND_ORDER.reduce((s, b) => s + t.all[b].crits, 0);
    const gridNote =
      `${body} × 攻撃力▲（${grid.atk.join('・')}）× (1 + コア ${grid.core} + 会心 ${grid.crit} + 距離ボーナス ${grid.distance}) の ` +
      `${gridValues(grid).length} 通りの格子で、差 ${tol} 以内で読んだ。前のフレームも読めた増分は 1 ヒット、読めなかった後の増分は 1 か 2 ヒット` +
      `（ヒットの数とコアの数が一通りに決まらないものは落とした）。区間の切れ目は ${cuts.map((c) => `f${c}`).join('・')}` +
      `（${given.length > 0 ? '--opt cuts' : 'detectCuts'}）。区間ごとのヒットの数は ${t.segmentHits.join('・')}。` +
      `攻撃力▲の段ごとのヒットの数は ${t.atkHits.join('・')}。分解できたヒットは ${allHits}、決まらず落とした増分 ${t.ambiguous}、` +
      `格子に乗らず落とした増分 ${t.unfit}${skip.length > 0 ? `、数えなかった範囲（${skip.map(([a, b]) => `f${a}〜f${b}`).join('・')}）の増分 ${t.skipped}` : ''}。` +
      `距離帯と距離ボーナスが合わないヒット ${t.distMismatch}`;
    const out: RecipeObservation[] = [
      observation(
        this,
        'rate',
        BAND_ORDER.map((b) => ratio(t.window[b])),
        `${who}（SMG）単騎の、各区間の頭の ${head} ヒットを除いた残りの距離帯ごとのコア命中率。近・中近・中遠・遠の順。${bands(t.window)}（コア / 当たった数）`,
        gridNote,
      ),
      observation(
        this,
        'count',
        BAND_ORDER.map((b) => t.window[b].cores),
        `${who}（SMG）単騎の、各区間の頭の ${head} ヒットを除いた残りの距離帯ごとのコアのヒットの数。近・中近・中遠・遠の順`,
        gridNote,
        { unit: 'ヒット' },
      ),
      observation(
        this,
        'count',
        BAND_ORDER.map((b) => t.window[b].hits),
        `${who}（SMG）単騎の、各区間の頭の ${head} ヒットを除いた残りの距離帯ごとの当たった数（分解できたヒット）。近・中近・中遠・遠の順`,
        gridNote,
        { unit: 'ヒット' },
      ),
      observation(
        this,
        'rate',
        BAND_ORDER.map((b) => ratio(t.all[b])),
        `${who}（SMG）単騎の全部のヒットの距離帯ごとのコア命中率（参考）。近・中近・中遠・遠の順。${bands(t.all)}。会心の割合は ${allHits > 0 ? roundTo(allCrits / allHits, 3) : 0}`,
        gridNote,
      ),
    ];
    return out;
  },
};
