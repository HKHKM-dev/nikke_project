// レシピ dual-smg-stages: 二丁持ちの SMG（muzzleCount 2）単騎・射撃場 3 分モードで、射撃の回数で積み上がる命中率▲（クエンシー：エスケープ
// クイーンの S2 のルート探索）の N ごとのコア命中率を区間ごとに出し、命中率▲がコア命中率に効く形（和・積・指数・和など）と比べる（V-0746。
// V-0709 で使い捨てのスクリプトにしていた読み方）。
//
// - 発ごとの格子はモデルの値: 録画の編成と --opt setup（観測値の ID の compare.setup）で sim を回し、モデルの n 発目のフレームの 1 ヒットの
//   値（コア × 会心 × 距離。指標 hitDamage）・会心率（critRateAt）・命中率▲の和 N と効果ごとの内訳（値の小片の hitRate）を出す。二丁持ちの
//   1 発は 2 ヒット（C-1023）で、きっかけの発の 2 ヒット目は次の発の段（C-1009。モデルは次の発から）なので、2 ヒット目はモデルの次の発の値
//   （マガジンの最後の発は同じ発）。
// - 録画の増分（hud-jumps のキャッシュ）をマガジン（40f を超える空きで分けたまとまり）に分け、戦闘の初めのマガジンをモデルの 1 つ目の
//   マガジンに、前のマガジンを --opt carry 発以上撃ってリロード（--opt reload f 以下の空き）で始まったマガジンをモデルの 2 つ目のマガジンに
//   当てる（1 段階が満ちて残る。C-1009）。ほかのマガジン（ジャンプの後に始まるもの）は使わない。
// - マガジンの中の発の番号は、増分の順に、前の発の次から --opt ahead 発先までで、値が格子に合う最初の番号に進める（2 ヒットとも外れた発を
//   飛ばす）。動画のフレームから出すと、HUD の 1f の遅れで積み上がりの途中が 1 発ずれる（V-0709）。前のフレームが読めなかった増分（数発の
//   まとまり）は読まずに、空きを発の刻みで割った数だけ進める。
// - 増分ごとに、当たったヒット（1 ヒット目・2 ヒット目・両方）・コア・会心の組の候補を全部残し、区間 × N ごとのコア命中率と、区間 × N の帯
//   ごとのヒットの命中率を EM で最尤に決める（会心率はモデルの値に固定）。帯の値は帯の中の N ごとの値を、当たったヒットの数の期待値で
//   合わせたもの（コアのヒットの期待値 ÷ 当たったヒットの期待値）。σ は帯の中の N を 1 つの値に揃えた対数尤度が 0.5 下がる幅の半分。
// - 形の比べ: 区間の N ごとのコア命中率を形 f(p0, N) に置き換え（命中率は EM の値に固定）、p0 を最尤にした値と σ、自由な値との対数尤度の差を
//   出す。--opt p0 を与えたら、その p0 での対数尤度の差と帯ごとの予測も出す。
import { loadRecordingsFile, loadRecordsData } from '../../../packages/core/scripts/records-data.ts';
import { buildTeamInput, METRICS, type CompareSpec } from '../../../packages/core/src/records/observations.ts';
import type { RecordingEntry } from '../../../packages/core/src/records/recordings.ts';
import { valuePiecesOf } from '../../../packages/core/src/skills/holders.ts';
import { runSimulation } from '../../../packages/core/src/sim/engine.ts';
import { resolveSetup } from './buff-edge.ts';
import { loadHudJumps } from './hud-jumps.ts';
import { BAND_JA, BANDS, longGaps, parseList, type Band } from './smg-cores.ts';
import { estimateInterval, groupMagazines, segmentOf, type HudIncrement } from './smg-hits.ts';
import { observation, roundTo, type Recipe, type RecipeObservation } from './types.ts';

/** 1 ヒットのモデルの値。values[距離ボーナスの有無][コア × 2 + 会心] */
export type HitModel = {
  values: readonly [readonly number[], readonly number[]];
  critRate: number;
  /** 命中率▲の和 */
  n: number;
  /** 命中率▲の効果ごとの和（積の形に使う） */
  parts: readonly number[];
};

/** モデルの 1 発（2 ヒット）。mag はモデルのマガジンの番号（0 始まり） */
export type ModelShot = { mag: number; hits: readonly [HitModel, HitModel] };

/** 増分の候補。hits は当たったヒット（0 = 1 ヒット目、1 = 2 ヒット目）ごとのコア・会心 */
export type StageCandidate = { hits: { which: 0 | 1; core: 0 | 1; crit: 0 | 1 }[] };

/** 距離帯ごとの距離ボーナスの有無の候補（中遠は着地点で付くか付かないか） */
const DIST_OF: Record<Band, readonly (0 | 1)[]> = { near: [1], midNear: [1], far: [0], midFar: [0, 1] };

const CELLS = [0, 1, 2, 3] as const;

/** 1 発の増分を、その発のモデルの 2 ヒットの格子で読む（候補が無ければ空）。許しは tol + 0.5 ×（ヒットの数 − 1） */
export function readStageIncrement(
  increment: number,
  shot: ModelShot,
  dists: readonly (0 | 1)[],
  tol: number,
): StageCandidate[] {
  const found = new Map<string, StageCandidate>();
  const add = (hits: StageCandidate['hits'], value: number) => {
    if (Math.abs(increment - value) > tol + 0.5 * (hits.length - 1)) return;
    found.set(hits.map((h) => `${h.which}${h.core}${h.crit}`).join(','), { hits });
  };
  const hit = (which: 0 | 1, cell: number) => ({
    which,
    core: (cell >> 1) as 0 | 1,
    crit: (cell & 1) as 0 | 1,
  });
  for (const d of dists) {
    const [a, b] = [shot.hits[0].values[d], shot.hits[1].values[d]];
    for (const i of CELLS) {
      add([hit(0, i)], a[i]!);
      add([hit(1, i)], b[i]!);
      for (const j of CELLS) add([hit(0, i), hit(1, j)], a[i]! + b[j]!);
    }
  }
  return [...found.values()];
}

/** 読めた増分。shot はモデルの発の番号（0 始まり） */
export type StageRow = { segment: number; shot: number; candidates: StageCandidate[] };

export type AssignStats = {
  magazines: number;
  used: number;
  unfit: number;
  lumped: number;
  /** 前の発の次から ahead 発先までに合わず、前後 resync 発の中で合わせ直した増分 */
  resynced: number;
  /** 格子に乗らない増分のフレーム */
  unfitFrames: number[];
};

/**
 * マガジンをモデルのマガジンに当て、増分ごとに発の番号を値で決めて候補を読む。starts はモデルのマガジンの最初の発の番号
 * （0 始まり。[1 つ目, 2 つ目]）
 */
export function assignShots(
  rows: readonly HudIncrement[],
  model: readonly ModelShot[],
  starts: readonly [number, number],
  opts: {
    cuts: readonly number[];
    interval: number;
    tol: number;
    carry: number;
    reload: number;
    ahead: number;
    resync: number;
  },
): { rows: StageRow[]; stats: AssignStats } {
  const mags = groupMagazines(rows);
  const out: StageRow[] = [];
  const stats: AssignStats = { magazines: mags.length, used: 0, unfit: 0, lumped: 0, resynced: 0, unfitFrames: [] };
  const shotsOf = (g: readonly HudIncrement[]) => Math.round((g.at(-1)!.frame - g[0]!.frame) / opts.interval) + 1;
  mags.forEach((g, k) => {
    let start: number;
    if (k === 0) start = starts[0];
    else {
      const prev = mags[k - 1]!;
      const gap = g[0]!.frame - prev.at(-1)!.frame;
      if (gap > opts.reload || shotsOf(prev) < opts.carry) return;
      start = starts[1];
    }
    stats.used++;
    const magOf = model[start]!.mag;
    let last = start - 1;
    let lastFrame = g[0]!.frame;
    for (const r of g) {
      const segment = Math.min(segmentOf(r.frame, opts.cuts), BANDS.length - 1);
      if (r.readGap !== 1 && r !== g[0]) {
        stats.lumped++;
        last += Math.max(1, Math.round((r.frame - lastFrame) / opts.interval));
        lastFrame = r.frame;
        continue;
      }
      lastFrame = r.frame;
      let read: StageRow | undefined;
      for (const s of searchOrder(last, opts.ahead, opts.resync)) {
        const shot = model[s];
        if (shot === undefined || shot.mag !== magOf) continue;
        const candidates = readStageIncrement(r.increment, shot, DIST_OF[BANDS[segment]!], opts.tol);
        if (candidates.length > 0) {
          if (s <= last || s > last + opts.ahead) stats.resynced++;
          read = { segment, shot: s, candidates };
          break;
        }
      }
      if (read === undefined) {
        stats.unfit++;
        stats.unfitFrames.push(r.frame);
        last++;
        continue;
      }
      out.push(read);
      last = read.shot;
    }
  });
  return { rows: out, stats };
}

/**
 * 発の番号を探す順: 前の発の次から ahead 発先まで（2 ヒットとも外れた発を飛ばす）、合わなければ前の発の前後 resync 発の中で近い順
 * （数発のまとまりの空きから進めた数がずれると、積み上がりの途中の増分が合わなくなり、段が満ちるまで戻らない）
 */
export function searchOrder(last: number, ahead: number, resync: number): number[] {
  const order = Array.from({ length: ahead }, (_, k) => last + 1 + k);
  for (let d = 1; d <= resync; d++) {
    if (last + 1 - d < last + 1) order.push(last + 1 - d);
    if (last + d > last + ahead) order.push(last + d);
  }
  return order;
}

/** N の帯の番号（upper は帯の上端。最後の帯は upper の最後より上） */
export function bandOfN(n: number, upper: readonly number[]): number {
  const i = upper.findIndex((u) => n <= u + 1e-9);
  return i === -1 ? upper.length : i;
}

/** 命中率▲がコア命中率に効く形（p0 は元の値。上限 1） */
export const FORMS = {
  sum: { ja: '和', f: (p0: number, h: HitModel) => Math.min(1, p0 / (1 - h.n) ** 2) },
  product: { ja: '積', f: (p0: number, h: HitModel) => Math.min(1, p0 / productOf(h) ** 2) },
  expSum: { ja: '指数・和', f: (p0: number, h: HitModel) => 1 - (1 - p0) ** (1 / (1 - h.n) ** 2) },
  expProduct: { ja: '指数・積', f: (p0: number, h: HitModel) => 1 - (1 - p0) ** (1 / productOf(h) ** 2) },
  linear: { ja: 'p0 ÷ (1 − N)', f: (p0: number, h: HitModel) => Math.min(1, p0 / (1 - h.n)) },
} as const;
export type FormName = keyof typeof FORMS;
export const FORM_NAMES = Object.keys(FORMS) as FormName[];

function productOf(h: HitModel): number {
  return h.parts.reduce((a, x) => a * (1 - x), 1);
}

/** 当てはめの値。キーは区間と N（HitModel の n を丸めた文字列） */
export type StageFit = {
  /** 区間 → N のキー → コア命中率 */
  core: Map<number, Map<string, number>>;
  /** 区間 → N のキー → 当たったヒットの数・コアのヒットの数の期待値 */
  hits: Map<number, Map<string, number>>;
  cores: Map<number, Map<string, number>>;
  /** 区間 → 帯 → ヒットの命中率 */
  hitRate: Map<number, Map<number, number>>;
  logLikelihood: number;
};

export const nKey = (n: number) => n.toFixed(4);

type Grouped = {
  segment: number;
  band: number;
  cands: { hits: { key: string; core: number; crit: number; cr: number }[]; pattern: number }[];
  n: number;
};

/** 同じ区間・同じ候補の増分を 1 つにまとめる（数を重みにする）。pattern は当たったヒット（1・2・3 = 両方） */
function groupRows(rows: readonly StageRow[], model: readonly ModelShot[], upper: readonly number[]): Grouped[] {
  const map = new Map<string, Grouped>();
  for (const r of rows) {
    const shot = model[r.shot]!;
    const cands = r.candidates.map((c) => ({
      pattern: c.hits.reduce((a, h) => a | (1 << h.which), 0),
      hits: c.hits.map((h) => {
        const m = shot.hits[h.which];
        return { key: nKey(m.n), core: h.core, crit: h.crit, cr: m.critRate };
      }),
    }));
    const band = bandOfN(shot.hits[0].n, upper);
    const key = `${r.segment}|${band}|${JSON.stringify(cands)}`;
    const g = map.get(key);
    if (g === undefined) map.set(key, { segment: r.segment, band, cands, n: 1 });
    else g.n++;
  }
  return [...map.values()];
}

const get2 = <K, V>(m: Map<number, Map<K, V>>, a: number, b: K, d: V): V => m.get(a)?.get(b) ?? d;
const add2 = <K>(m: Map<number, Map<K, number>>, a: number, b: K, x: number) => {
  let inner = m.get(a);
  if (inner === undefined) m.set(a, (inner = new Map()));
  inner.set(b, (inner.get(b) ?? 0) + x);
};

/** E ステップ。pOf はヒットのコア命中率（区間・N のキー）、qOf は区間・帯のヒットの命中率 */
function expect(
  groups: readonly Grouped[],
  pOf: (segment: number, key: string) => number,
  qOf: (segment: number, band: number) => number,
) {
  const hits = new Map<number, Map<string, number>>();
  const cores = new Map<number, Map<string, number>>();
  const shotHits = new Map<number, Map<number, number>>();
  const shots = new Map<number, Map<number, number>>();
  const llBySegment = new Map<number, number>();
  for (const g of groups) {
    const q = qOf(g.segment, g.band);
    const any = 1 - (1 - q) ** 2;
    const ws = g.cands.map((c) => {
      let w = (c.pattern === 3 ? q * q : q * (1 - q)) / any;
      for (const h of c.hits) {
        const p = pOf(g.segment, h.key);
        w *= (h.core ? p : 1 - p) * (h.crit ? h.cr : 1 - h.cr);
      }
      return w;
    });
    const sum = ws.reduce((a, b) => a + b, 0);
    if (!(sum > 0)) continue;
    llBySegment.set(g.segment, (llBySegment.get(g.segment) ?? 0) + g.n * Math.log(sum));
    add2(shots, g.segment, g.band, g.n);
    g.cands.forEach((c, i) => {
      const w = (g.n * ws[i]!) / sum;
      add2(shotHits, g.segment, g.band, w * c.hits.length);
      for (const h of c.hits) {
        add2(hits, g.segment, h.key, w);
        add2(cores, g.segment, h.key, w * h.core);
      }
    });
  }
  return { hits, cores, shotHits, shots, llBySegment };
}

/** 1 ヒット以上当たった発の当たったヒットの数の平均 = 2q ÷ (1 − (1 − q)²) を q について解く */
function solveQ(meanHits: number): number {
  if (!(meanHits > 1)) return 1e-6;
  if (meanHits >= 2) return 1;
  let lo = 1e-9;
  let hi = 1;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if ((2 * mid) / (1 - (1 - mid) ** 2) < meanHits) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** 区間 × N ごとのコア命中率と、区間 × 帯ごとのヒットの命中率を EM で最尤に決める */
export function fitStages(
  rows: readonly StageRow[],
  model: readonly ModelShot[],
  upper: readonly number[],
  iterations = 300,
): { fit: StageFit; groups: Grouped[] } {
  const groups = groupRows(rows, model, upper);
  let core = new Map<number, Map<string, number>>();
  let hitRate = new Map<number, Map<number, number>>();
  let e = expect(
    groups,
    () => 0.3,
    () => 0.8,
  );
  for (let it = 0; it < iterations; it++) {
    core = new Map();
    for (const [s, inner] of e.hits)
      for (const [k, h] of inner) add2(core, s, k, h > 0 ? get2(e.cores, s, k, 0) / h : 0);
    hitRate = new Map();
    for (const [s, inner] of e.shots)
      for (const [b, n] of inner) add2(hitRate, s, b, solveQ(get2(e.shotHits, s, b, 0) / n));
    const c = core;
    const q = hitRate;
    e = expect(
      groups,
      (s, k) => get2(c, s, k, 0.3),
      (s, b) => get2(q, s, b, 0.8),
    );
  }
  const ll = [...e.llBySegment.values()].reduce((a, b) => a + b, 0);
  return { fit: { core, hits: e.hits, cores: e.cores, hitRate, logLikelihood: ll }, groups };
}

/** 区間の対数尤度（コア命中率を pOf にし、命中率は当てはめの値に固定） */
function segmentLL(groups: readonly Grouped[], fit: StageFit, segment: number, pOf: (key: string) => number): number {
  const mine = groups.filter((g) => g.segment === segment);
  const e = expect(
    mine,
    (_, k) => pOf(k),
    (s, b) => get2(fit.hitRate, s, b, 0.8),
  );
  return e.llBySegment.get(segment) ?? 0;
}

/**
 * σ の代わり: 対数尤度が最大 x から 0.5 下がる左右の点の幅の半分（上限 1 に掛かる形は対数尤度が折れるので、2 階微分を使わない）。
 * 範囲 [lo, hi] の端まで下がらなければ、その端までで測る
 */
export function halfWidth(ll: (x: number) => number, x: number, lo: number, hi: number): number {
  const top = ll(x);
  const edge = (inside: number, outside: number) => {
    if (top - ll(outside) < 0.5) return outside;
    let a = inside;
    let b = outside;
    for (let i = 0; i < 50; i++) {
      const m = (a + b) / 2;
      if (top - ll(m) < 0.5) a = m;
      else b = m;
    }
    return (a + b) / 2;
  };
  return (edge(x, hi) - edge(x, lo)) / 2;
}

/** 区間の帯ごとの値: コア命中率（期待値の比）・当たったヒットの数・σ（帯の中の N を 1 つの値に揃えた対数尤度が 0.5 下がる幅の半分）・ヒットの重みの N の平均 */
export type BandValue = { core: number; hits: number; sigma: number; meanN: number };

export function bandValues(
  groups: readonly Grouped[],
  fit: StageFit,
  segment: number,
  keysByBand: readonly string[][],
): BandValue[] {
  const hits = fit.hits.get(segment) ?? new Map<string, number>();
  const cores = fit.cores.get(segment) ?? new Map<string, number>();
  const free = fit.core.get(segment) ?? new Map<string, number>();
  return keysByBand.map((keys) => {
    const h = keys.reduce((a, k) => a + (hits.get(k) ?? 0), 0);
    const c = keys.reduce((a, k) => a + (cores.get(k) ?? 0), 0);
    const p = h > 0 ? c / h : 0;
    const meanN = h > 0 ? keys.reduce((a, k) => a + Number(k) * (hits.get(k) ?? 0), 0) / h : 0;
    if (!(h > 0)) return { core: p, hits: h, sigma: NaN, meanN };
    const inBand = new Set(keys);
    const ll = (x: number) => segmentLL(groups, fit, segment, (k) => (inBand.has(k) ? x : (free.get(k) ?? 0)));
    return { core: p, hits: h, sigma: halfWidth(ll, Math.min(1 - 1e-6, Math.max(1e-6, p)), 1e-6, 1 - 1e-6), meanN };
  });
}

/** 形ごとの比べ: p0 を最尤にした値と σ、そのときと（あれば）与えた p0 での、自由な値との対数尤度の差と帯ごとの予測 */
export type FormResult = {
  form: FormName;
  p0: number;
  sigma: number;
  dll: number;
  given?: { dll: number; bands: number[] };
};

export function compareForms(
  groups: readonly Grouped[],
  fit: StageFit,
  segment: number,
  hitsByKey: ReadonlyMap<string, HitModel>,
  keysByBand: readonly string[][],
  given: number | undefined,
  nMax = Infinity,
): FormResult[] {
  const free = fit.core.get(segment) ?? new Map<string, number>();
  const llFree = segmentLL(groups, fit, segment, (k) => free.get(k) ?? 0);
  // nMax より上の N は自由な値のまま（形に置き換えない）
  const hits = fit.hits.get(segment) ?? new Map<string, number>();
  return FORM_NAMES.map((form) => {
    const f = FORMS[form].f;
    const ll = (p0: number) =>
      segmentLL(groups, fit, segment, (k) =>
        Number(k) > nMax + 1e-9 ? (free.get(k) ?? 0) : Math.min(1 - 1e-9, Math.max(1e-9, f(p0, hitsByKey.get(k)!))),
      );
    // 黄金分割で最大を探す
    let lo = 0.005;
    let hi = 0.95;
    const g = (Math.sqrt(5) - 1) / 2;
    for (let i = 0; i < 80; i++) {
      const a = hi - g * (hi - lo);
      const b = lo + g * (hi - lo);
      if (ll(a) < ll(b)) lo = a;
      else hi = b;
    }
    const p0 = (lo + hi) / 2;
    const out: FormResult = {
      form,
      p0,
      sigma: halfWidth(ll, p0, 0.005, 0.95),
      dll: ll(p0) - llFree,
    };
    if (given !== undefined) {
      const bands = keysByBand.map((keys) => {
        const h = keys.reduce((a, k) => a + (hits.get(k) ?? 0), 0);
        return h > 0 ? keys.reduce((a, k) => a + f(given, hitsByKey.get(k)!) * (hits.get(k) ?? 0), 0) / h : NaN;
      });
      out.given = { dll: ll(given) - llFree, bands };
    }
    return out;
  });
}

/** モデルの発の列（1 ヒットの格子・会心率・命中率▲）。枠は 1 */
function modelShots(
  recording: RecordingEntry,
  setupId: string,
  source: string,
): { shots: ModelShot[]; starts: [number, number] } {
  const setup = resolveSetup(setupId, source);
  const data = loadRecordsData(loadRecordingsFile());
  const input = buildTeamInput(recording, setup, data);
  const sim = runSimulation(input);
  const value = (name: string, args: CompareSpec['args']) => METRICS[name]!.sim(sim, { args, input }) as number;
  const frames = sim.shots[0]!.frames;
  const pieces = valuePiecesOf(sim.history).filter((p) => p.slotIndex === 0 && p.effect.stat === 'hitRate');
  const hitAt = (frame: number): HitModel => {
    const at = pieces.filter((p) => p.start <= frame && frame < p.end);
    const parts = new Map<string, number>();
    for (const p of at) {
      const k = `${p.effect.source.resourceId}:${p.effect.source.skill}:${p.effect.effectIndex}`;
      parts.set(k, (parts.get(k) ?? 0) + p.effect.value);
    }
    const cells = (distance: boolean) =>
      [false, true].flatMap((core) =>
        [false, true].map((crit) => value('hitDamage', { slot: 1, frame, core, crit, distance })),
      );
    return {
      values: [cells(false), cells(true)],
      critRate: value('critRateAt', { slot: 1, frame }),
      n: [...parts.values()].reduce((a, b) => a + b, 0),
      parts: [...parts.values()],
    };
  };
  // モデルのマガジン（40f を超える空きで分ける）の 1 つ目と 2 つ目だけを作る
  const mags: number[] = [0];
  for (let i = 1; i < frames.length && mags.length < 3; i++) if (frames[i]! - frames[i - 1]! > 40) mags.push(i);
  if (mags.length < 3) throw new Error('モデルのマガジンが 2 つに満たない');
  const end = mags[2]!;
  const hitModels = frames.slice(0, end).map(hitAt);
  const shots = hitModels.map((h, i): ModelShot => {
    const mag = i < mags[1]! ? 0 : 1;
    const next = i + 1 < end && (i + 1 < mags[1]! ? 0 : 1) === mag ? hitModels[i + 1]! : h;
    return { mag, hits: [h, next] };
  });
  return { shots, starts: [0, mags[1]!] };
}

const DEFAULT_UPPER = [0.136, 0.272, 0.407, 0.571];

export const dualSmgStages: Recipe = {
  name: 'dual-smg-stages',
  version: 1,
  describe:
    '二丁持ちの SMG 単騎・射撃場 3 分モードの、射撃の回数で積み上がる命中率▲の N の帯ごと・区間ごとのコア命中率（rate。1 発の増分とモデルの発ごとの格子から最尤）と、命中率▲がコア命中率に効く形ごとの最尤の元の値（rate）',
  options: {
    setup: 'モデルを回す条件（観測値の ID。その compare.setup。または V-NNNN:<指標 id>）',
    segments: '出す区間（1 始まり。中近・近・遠・中遠・近・遠）をカンマ区切りで（既定 2,5）',
    p0: '形の比べに使う元の値を、segments と同じ順にカンマ区切りで（省けば最尤の p0 だけ）',
    bands: 'N の帯の上端をカンマ区切りで（既定 0.136,0.272,0.407,0.571。最後の帯はその上）',
    cuts: '区間の切れ目（ジャンプの前の最後の増分のフレーム）をカンマ区切りで（4〜5 つ。2 回目の近で終わる録画は 4 つ）。省けば 100f を超える空き',
    tol: '格子の値との差の許し（既定 2。ヒットごとに 0.5 を足す）',
    carry: '2 つ目のマガジンに当てる、前のマガジンの発の数の下限（既定 21）',
    reload: '2 つ目のマガジンに当てる、前のマガジンとの空きの上限（f。既定 100）',
    ahead: '発の番号を探す先の数（既定 3）',
    resync: '先の数の中で合わないとき、前の発の前後で探し直す数（既定 8）',
    nmax: '形の比べに使う N の上限をカンマ区切りで（上限ごとに観測値を出す。N の全部の比べはいつも出す）',
  },
  async run(ctx) {
    const setupId = ctx.options.setup;
    if (setupId === undefined) throw new Error('--opt setup=<観測値の ID> が要る');
    const num = (k: string, d: number) => (ctx.options[k] === undefined ? d : Number(ctx.options[k]));
    const segments = parseList(ctx.options.segments ?? '2,5', 'segments').map((s) => s - 1);
    const given = parseList(ctx.options.p0, 'p0');
    if (given.length > 0 && given.length !== segments.length) throw new Error('--opt p0 は segments と同じ数');
    const upper = ctx.options.bands === undefined ? DEFAULT_UPPER : parseList(ctx.options.bands, 'bands');
    const rows: HudIncrement[] = (await loadHudJumps(ctx)).rows.map((r) => ({ ...r, readGap: r.readGap ?? 1 }));
    const interval = estimateInterval(rows, 120);
    const cutsGiven = parseList(ctx.options.cuts, 'cuts');
    const cuts = cutsGiven.length > 0 ? cutsGiven : longGaps(rows).map((g) => g.frame);
    if (cuts.length < 4 || cuts.length > 5)
      throw new Error(`区間の切れ目が ${cuts.length} 個（4〜5 個が要る。--opt cuts）: ${cuts.join(',')}`);
    const { shots, starts } = modelShots(ctx.recording, setupId, ctx.source);
    const { rows: read, stats } = assignShots(rows, shots, starts, {
      cuts,
      interval,
      tol: num('tol', 2),
      carry: num('carry', 21),
      reload: num('reload', 100),
      ahead: num('ahead', 3),
      resync: num('resync', 8),
    });
    if (stats.unfit > 0) ctx.log(`格子に乗らない増分のフレーム: ${stats.unfitFrames.join(' ')}`);
    const { fit, groups } = fitStages(read, shots, upper);
    const hitsByKey = new Map<string, HitModel>();
    for (const s of shots) for (const h of s.hits) hitsByKey.set(nKey(h.n), h);
    const keys = [...hitsByKey.keys()].sort();
    const keysByBand = Array.from({ length: upper.length + 1 }, (_, b) =>
      keys.filter((k) => bandOfN(Number(k), upper) === b),
    );
    const bandJa = keysByBand.map((ks) => `N ${ks[0]}〜${ks.at(-1)}`);
    const who = ctx.recording.team.map((m) => m.name).join('・');
    const note =
      `モデル（--opt setup ${setupId}）の 1 つ目・2 つ目のマガジンの発ごとの 1 ヒットの格子（hitDamage のコア × 会心 × 距離。2 ヒット目は次の発）に、` +
      `差 ${num('tol', 2)}（ヒットごとに +0.5）以内で当てた。使ったマガジン ${stats.used} / ${stats.magazines}（戦闘の初めと、前のマガジンを ${num('carry', 21)} 発以上撃って ${num('reload', 100)}f 以下の空きで始まったもの）、` +
      `読めた増分 ${read.length}（うち前後 ${num('resync', 8)} 発の中で合わせ直した増分 ${stats.resynced}）、数発のまとまり ${stats.lumped}、格子に乗らない増分 ${stats.unfit}。区間の切れ目 ${cuts.map((c) => `f${c}`).join('・')}。` +
      `会心率はモデルの値に固定し、区間 × N ごとのコア命中率と区間 × 帯ごとのヒットの命中率を EM で最尤に決めた（対数尤度 ${roundTo(fit.logLikelihood, 1)}）`;
    const nMaxes = [...parseList(ctx.options.nmax, 'nmax'), Infinity];
    const out: RecipeObservation[] = [];
    segments.forEach((seg, i) => {
      const segJa = `${BAND_JA[BANDS[seg]!]}（${seg + 1} 区間目）`;
      const bands = bandValues(groups, fit, seg, keysByBand);
      out.push(
        observation(
          this,
          'rate',
          bands.map((b) => roundTo(b.core, 4)),
          `${who}（二丁持ちの SMG）単騎の${segJa}の、命中率▲の N の帯ごとのコア命中率（コアのヒット / 当たったヒット。最尤）。帯は ${bandJa.join('・')} の順` +
            `（当たったヒットの数 ${bands.map((b) => roundTo(b.hits, 0)).join('・')}、σ ${bands.map((b) => roundTo(b.sigma, 4)).join('・')}、ヒットの重みの N の平均 ${bands.map((b) => roundTo(b.meanN, 3)).join('・')}）`,
          note,
        ),
      );
      const p0 = given[i];
      for (const nMax of nMaxes) {
        const forms = compareForms(groups, fit, seg, hitsByKey, keysByBand, p0, nMax);
        const upTo = Number.isFinite(nMax) ? `N ${nMax} 以下で比べた` : 'N の全部で比べた';
        out.push(
          observation(
            this,
            'rate',
            forms.map((f) => roundTo(f.p0, 4)),
            `${who}（二丁持ちの SMG）単騎の${segJa}の、命中率▲がコア命中率に効く形ごとの最尤の元の値 p0（${upTo}）。${forms.map((f) => FORMS[f.form].ja).join('・')} の順` +
              `（σ ${forms.map((f) => roundTo(f.sigma, 4)).join('・')}。N ごとに自由な値との対数尤度の差 ${forms.map((f) => roundTo(f.dll, 1)).join('・')}）`,
            `${note}。${Number.isFinite(nMax) ? `N ${nMax} より上は自由な値のまま。` : ''}形は 和 p0 ÷ (1 − N)²・積 p0 ÷ Π(1 − Nᵢ)²（Nᵢ は効果ごと）・指数・和 1 − (1 − p0)^(1 ÷ (1 − N)²)・指数・積・p0 ÷ (1 − N)（上限 1）` +
              (p0 === undefined
                ? ''
                : `。p0 = ${p0} での自由な値との対数尤度の差 ${forms.map((f) => `${FORMS[f.form].ja} ${roundTo(f.given!.dll, 1)}`).join('・')}、帯ごとの予測 ${forms.map((f) => `${FORMS[f.form].ja} ${f.given!.bands.map((x) => roundTo(x, 3)).join('・')}`).join('／')}`),
          ),
        );
      }
    });
    return out;
  },
};
