// チャージ武器（SR・RL）単騎の射撃の列（plan/design-charge-shots.md 2 節。V-0090 の使い捨てのスクリプトの数え方）。
// HUD の総ダメージの増分を 1 発の値の格子で発に分け、発の刻み・リロードの空き・装弾数の格子をたどって、
// 総ダメージに出ない発（刻みの抜け）・部分チャージの発・ジャンプの窓を見つける。
import type { HitGrid, HudIncrement } from './smg-hits.ts';

/** 1 発の値の格子（距離ボーナス・コア・会心の有無の 8 通り）と、コアに当たった値か */
export function shotValues(grid: HitGrid): { value: number; core: boolean }[] {
  const out: { value: number; core: boolean }[] = [];
  for (const d of [0, 1])
    for (const c of [0, 1])
      for (const r of [0, 1])
        out.push({ value: grid.body * (1 + grid.distance * d + grid.core * c + grid.crit * r), core: c === 1 });
  return out;
}

/** 増分を発として見たもの。lo〜hi は発の時刻が入りうる幅（読めない間の始まり 〜 増分のフレーム） */
export type ShotRead = {
  lo: number;
  hi: number;
  increment: number;
  kind: 'full' | 'odd';
  core?: boolean;
  rows: number;
};

/** 格子との差の許し（表示の丸め） */
const VALUE_TOL = 2;
/** 発でない増分を足し引きするときの許し */
const SUM_TOL = 3;
/** 割れた読みを足し戻す長さ（f） */
const MERGE_SPAN = 25;
/** 格子の時刻との差の許し（f） */
const TIME_TOL = 3;

/**
 * 増分を発（格子に乗る値）と、発でない増分（格子に乗らず、読めない間の無い増分で 2 回以上出る値と、その 2 つの和。S1 の段・
 * バーストのヒットなど）と、説明のつかない増分（部分チャージの発の候補）に分ける。格子に乗らない増分は、格子の値 + 発でない増分
 * （読めない間に重なった読み）か、25f 先までの増分を足して格子に乗る（桁送りで割れた読み）なら 1 発にする
 */
export function classifyIncrements(
  rows: readonly HudIncrement[],
  grid: HitGrid,
): { reads: ShotRead[]; others: number[]; dropped: number } {
  const values = shotValues(grid);
  const onGrid = (v: number) => values.find((g) => Math.abs(v - g.value) <= VALUE_TOL);
  const counts = new Map<number, number>();
  for (const r of rows) {
    if (r.readGap === 1 && !onGrid(r.increment)) counts.set(r.increment, (counts.get(r.increment) ?? 0) + 1);
  }
  const atoms = [...counts.keys()];
  const recurring = [...counts].filter(([, n]) => n >= 2).map(([v]) => v);
  const sums = [...recurring, ...recurring.flatMap((a) => recurring.map((b) => a + b))];
  const isOther = (v: number) => sums.some((o) => Math.abs(v - o) <= SUM_TOL);
  const shotIn = (v: number) =>
    onGrid(v) ??
    values.find((g) => isOther(v - g.value) || atoms.some((a) => a !== v && Math.abs(v - g.value - a) <= SUM_TOL));

  const reads: ShotRead[] = [];
  let dropped = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const lo = r.frame - r.readGap + 1;
    const g = onGrid(r.increment);
    if (g) {
      reads.push({ lo, hi: r.frame, increment: r.increment, kind: 'full', core: g.core, rows: 1 });
      continue;
    }
    if (isOther(r.increment)) {
      dropped++;
      continue;
    }
    const g2 = shotIn(r.increment);
    if (g2) {
      reads.push({ lo, hi: r.frame, increment: r.increment, kind: 'full', core: g2.core, rows: 1 });
      continue;
    }
    let sum = r.increment;
    let from = lo;
    let j = i + 1;
    let hit: { value: number; core: boolean } | undefined;
    while (j < rows.length && rows[j]!.frame - r.frame <= MERGE_SPAN) {
      sum += rows[j]!.increment;
      from = Math.min(from, rows[j]!.frame - rows[j]!.readGap + 1);
      hit = shotIn(sum);
      if (hit) break;
      j++;
    }
    if (hit) {
      reads.push({ lo: from, hi: rows[j]!.frame, increment: sum, kind: 'full', core: hit.core, rows: j - i + 1 });
      i = j;
      continue;
    }
    reads.push({ lo, hi: r.frame, increment: r.increment, kind: 'odd', rows: 1 });
  }
  return { reads, others: recurring, dropped };
}

function modeOf(values: readonly number[]): number | undefined {
  const m = new Map<number, number>();
  for (const x of values) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0];
}

export type Cadence = { interval: number; reloadGap: number; mag: number };

/**
 * 読めない間の無いフルチャージの発どうしの間から、刻み（最頻の間 ±2f の平均）・リロードの空き（刻みの 1.8〜6 倍の最頻）・
 * 装弾数（リロードの空きの間の、刻みで続く発の数の最頻）を測る
 */
export function measureCadence(reads: readonly ShotRead[]): Cadence {
  const exact = reads.filter((r) => r.kind === 'full' && r.lo === r.hi);
  const diffs = exact.slice(1).map((r, i) => r.hi - exact[i]!.hi);
  const top = modeOf(diffs.filter((d) => d >= 15 && d <= 150));
  if (top === undefined) throw new Error('発の刻みが測れない（フルチャージの発が足りない）');
  const near = diffs.filter((d) => Math.abs(d - top) <= 2);
  const interval = near.reduce((a, b) => a + b, 0) / near.length;
  const reloadGap = modeOf(diffs.filter((d) => d > 1.8 * interval && d < 6 * interval));
  if (reloadGap === undefined) throw new Error('リロードの空きが測れない');
  const runs: number[] = [];
  let run = 1;
  for (const d of diffs) {
    if (Math.abs(d - reloadGap) <= TIME_TOL) {
      runs.push(run);
      run = 1;
    } else if (Math.abs(d - interval) <= TIME_TOL) run++;
    else run = 1;
  }
  const mag = modeOf(runs);
  if (mag === undefined) throw new Error('装弾数が測れない');
  return { interval, reloadGap, mag };
}

export type ChargeShot = { frame: number; kind: 'full' | 'partial' | 'missing'; core?: boolean; wide: boolean };
/** ジャンプの窓。before は窓の前の最後の発、after は明けの最初の発（戦闘の終わりまでなら undefined） */
export type ShotWindow = { before: number; after: number | undefined };
export type ChargeRead = Cadence & {
  shots: ChargeShot[];
  windows: ShotWindow[];
  /** リロードとして当てはめた空きの前の発のフレーム */
  reloads: number[];
  /** 説明のつかない増分（部分チャージの発にもならなかったもの） */
  odd: ShotRead[];
  /** 発でない増分として捨てた値（2 回以上出る値） */
  others: number[];
  dropped: number;
};

type Hypothesis = { missing: number; times: number[]; reloadAt: number; magAfter: number | undefined };

/**
 * 格子をたどって発を並べる。前の発 p・マガジンの発の数 c から、次の発が来うる時刻（抜け 0〜2 発。リロードは c が装弾数に
 * 達した所だけ）を並べ、増分が ±3f（読めない間の幅つき）に乗る最も抜けの少ない当てはめを取る。抜けのある当てはめは、
 * その後の発を次のリロードまで数えてマガジンの発の数がちょうど装弾数になるかで確かめる。どれも乗らなければ窓にし、
 * c を不明にする。格子に乗らない増分が前の発から刻み + 3f 以内にあり、次の発が格子に乗らなければ、窓の前の部分チャージの発
 */
export function readChargeShots(rows: readonly HudIncrement[], grid: HitGrid): ChargeRead {
  const { reads, others, dropped } = classifyIncrements(rows, grid);
  const cadence = measureCadence(reads);
  const { interval: I, reloadGap: G, mag: M } = cadence;

  const hypotheses = (p: number, c: number | undefined, r: ShotRead): Hypothesis[] => {
    const out: Hypothesis[] = [];
    for (let k = 0; k <= 2; k++) {
      for (let j = -1; j <= k; j++) {
        if (c !== undefined && j === -1 && c + k + 1 > M) continue;
        if (c !== undefined && j >= 0 && c + j !== M) continue;
        const times: number[] = [];
        let t = p;
        for (let s = 0; s <= k; s++) {
          t += s === j ? G : I;
          times.push(t);
        }
        if (t >= r.lo - TIME_TOL && t <= r.hi + TIME_TOL) {
          out.push({
            missing: k,
            times,
            reloadAt: j,
            magAfter: j >= 0 ? k + 1 - j : c === undefined ? undefined : c + k + 1,
          });
        }
      }
    }
    return out;
  };
  const lookahead = (idx: number, t0: number, magAfter: number | undefined): boolean => {
    if (magAfter === undefined) return true;
    let c = magAfter;
    let t = t0;
    for (let i = idx + 1; i < reads.length; i++) {
      const r = reads[i]!;
      if (r.kind !== 'full') continue;
      const d = r.hi - t;
      if (Math.abs(d - I) <= TIME_TOL || (r.lo - t <= I + TIME_TOL && r.hi - t >= I - TIME_TOL)) c += 1;
      else if (Math.abs(d - 2 * I) <= TIME_TOL) c += 2;
      else if (Math.abs(d - G) <= TIME_TOL || Math.abs(d - G - I) <= TIME_TOL) return c === M;
      else return c <= M;
      if (c > M) return false;
      t = r.lo === r.hi ? r.hi : t + Math.round(d / I) * I;
    }
    return c <= M;
  };

  const shots: ChargeShot[] = [];
  const windows: ShotWindow[] = [];
  const reloads: number[] = [];
  const odd: ShotRead[] = [];
  let p: number | undefined;
  let c: number | undefined;
  let forceWindow = false;
  const valid = (i: number, r: ShotRead) =>
    p === undefined
      ? undefined
      : hypotheses(p, c, r).find((h) => h.missing === 0 || lookahead(i, h.times.at(-1)!, h.magAfter));
  for (let i = 0; i < reads.length; i++) {
    const r = reads[i]!;
    if (r.kind === 'odd') {
      const ni = reads.findIndex((x, k) => k > i && x.kind === 'full');
      const nextFits = ni >= 0 && valid(ni, reads[ni]!) !== undefined;
      if (p !== undefined && r.hi > p && r.hi - p <= I + TIME_TOL && !nextFits) {
        shots.push({ frame: r.hi, kind: 'partial', wide: false });
        p = r.hi;
        forceWindow = true;
        if (ni < 0) windows.push({ before: r.hi, after: undefined });
      } else odd.push(r);
      continue;
    }
    const h = forceWindow ? undefined : valid(i, r);
    forceWindow = false;
    if (p === undefined) c = 1;
    else if (h === undefined) {
      windows.push({ before: p, after: r.hi });
      c = undefined;
    } else {
      for (let s = 0; s < h.missing; s++) shots.push({ frame: Math.round(h.times[s]!), kind: 'missing', wide: false });
      if (h.reloadAt >= 0) reloads.push(Math.round(h.reloadAt === 0 ? p : h.times[h.reloadAt - 1]!));
      c = h.magAfter;
    }
    shots.push({ frame: r.hi, kind: 'full', core: r.core!, wide: r.lo !== r.hi });
    p = r.lo !== r.hi && h !== undefined ? Math.round(h.times.at(-1)!) : r.hi;
  }
  return { ...cadence, shots, windows, reloads, odd, others, dropped };
}
