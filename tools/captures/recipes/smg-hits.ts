// SMG 単騎の総ダメージの増分を、ヒットの数に分ける（純粋な関数。V-0200 の読み方）。
//
// 1 ヒットの値 = 胴体 × (1 + 距離ボーナス × d + 会心 × r + コア × c)（d・r・c は 0 か 1）。スペック固定 ON なら
// 距離ボーナス 0.3・会心 0.5・コア 1.0 で、距離ボーナスの無い所では「コア 1 = 胴体 2」のように、1 つの増分に入るヒットの数が
// 一通りに決まらないことがある。そこで、その増分の間（前に読めたフレームから増分のフレームまで）に撃った発の数で上から抑える。
//   - 総ダメージは、撃ったのと同じフレームで増える（V-0200。残弾が減ったフレームと増分のフレームが、読めた 501 発すべてで一致）。
//     発は 1 フレームに 1 発まで（SMG の刻みは約 2.4f）。なので前のフレームも読めていた増分（readGap 1）は 1 ヒットまで。
//   - 前のフレームが読めていない増分は、照準の横の残弾（reticle-ammo.ts）の読みから、その間に撃った発の数の上限を出す。
//   - 上限以下の候補のうち最大を取る（当たる割合が高いので）。上限以下の候補が 2 つ以上残れば「決まらない」と数える。

export type HitGrid = { body: number; distance: number; crit: number; core: number };

/** スペック固定 ON の格子（胴体だけ録画から） */
export function fixedSpecGrid(body: number): HitGrid {
  return { body, distance: 0.3, crit: 0.5, core: 1.0 };
}

/** 距離ボーナスの付き方: all（近・中近）、none（遠・中遠の B・C）、mixed（中遠の A。35 の境目で散らばる） */
export type DistanceMode = 'all' | 'none' | 'mixed';

/** 増分に乗るヒットの数の候補（昇順）。許しは 1 ヒットあたり 1.5 と 1（表示の丸め） */
export function hitCountCandidates(increment: number, grid: HitGrid, maxHits: number, mode: DistanceMode): number[] {
  const out: number[] = [];
  for (let k = 1; k <= maxHits; k++) {
    const tol = 1.5 * k + 1;
    const ds = mode === 'all' ? [k] : mode === 'none' ? [0] : Array.from({ length: k + 1 }, (_, i) => i);
    let ok = false;
    for (const d of ds) {
      for (let c = 0; c <= k && !ok; c++) {
        const rest = increment / grid.body - k - grid.distance * d - grid.core * c;
        const r = Math.round(rest / grid.crit);
        if (r < 0 || r > k) continue;
        if (Math.abs(increment - grid.body * (k + grid.distance * d + grid.crit * r + grid.core * c)) <= tol) ok = true;
      }
      if (ok) break;
    }
    if (ok) out.push(k);
  }
  return out;
}

/** 1 ヒットの増分か。距離ボーナスが付いていれば 1、付いていなければ 0、1 ヒットでなければ undefined */
export function singleHitDistance(increment: number, grid: HitGrid): 0 | 1 | undefined {
  for (const d of [0, 1] as const) {
    for (const c of [0, 1]) {
      for (const r of [0, 1]) {
        if (Math.abs(increment - grid.body * (1 + grid.distance * d + grid.crit * r + grid.core * c)) <= 2) return d;
      }
    }
  }
  return undefined;
}

export type AmmoRow = { frame: number; value: number };

/** reticle-ammo.ts --mode series の出力（frame・value・score・x・y） */
export function parseAmmoSeries(text: string): AmmoRow[] {
  const rows: AmmoRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const [f, v] = line.split('\t');
    const frame = Number(f);
    const value = Number(v);
    if (line === '' || !Number.isInteger(frame) || !Number.isFinite(value)) continue;
    rows.push({ frame, value });
  }
  return rows.sort((a, b) => a.frame - b.frame);
}

/**
 * (from, to] に撃った発の数の上限。from 以前で読めた最後の残弾と、to 以後で読めた最初の残弾の差（間にリロードの増えがあれば
 * 使えないので undefined）。読めた所が from・to から離れるほど上限はゆるくなる
 */
export function shotsUpperBound(ammo: readonly AmmoRow[], from: number, to: number, slack = 6): number | undefined {
  let lo = -1;
  let hi = ammo.length;
  let a = 0;
  let b = ammo.length - 1;
  while (a <= b) {
    const m = (a + b) >> 1;
    if (ammo[m]!.frame <= from) {
      lo = m;
      a = m + 1;
    } else b = m - 1;
  }
  a = 0;
  b = ammo.length - 1;
  while (a <= b) {
    const m = (a + b) >> 1;
    if (ammo[m]!.frame >= to) {
      hi = m;
      b = m - 1;
    } else a = m + 1;
  }
  if (lo < 0 || hi >= ammo.length) return undefined;
  if (from - ammo[lo]!.frame > slack || ammo[hi]!.frame - to > slack) return undefined;
  for (let i = lo + 1; i <= hi; i++) if (ammo[i]!.value > ammo[i - 1]!.value) return undefined;
  return ammo[lo]!.value - ammo[hi]!.value;
}

export type HudIncrement = { frame: number; increment: number; readGap: number };

export type SplitIncrement = {
  frame: number;
  increment: number;
  hits: number;
  candidates: number[];
  /** その増分の間に撃った発の数の上限（readGap 1 なら 1。残弾で出せなければ刻みからの見積もり） */
  bound: number;
  boundFrom: 'frame' | 'ammo' | 'interval';
  /** 上限以下の候補が 2 つ以上あった */
  ambiguous: boolean;
};

/**
 * バーストの効果の窓（V-0201）。バースト中は攻撃力▲・クリティカルダメージ▲で 1 ヒットの値が変わり、胴体の格子に乗らない。
 * start・end は窓の中の、胴体の格子に乗らない増分の最初と最後のフレーム。grid はその窓の増分から測った格子
 */
export type BuffWindow = { start: number; end: number; grid: HitGrid; fit: number; total: number };

/**
 * 窓の格子を、窓の中の前のフレームも読めた増分から測る。胴体は一番多い値（距離ボーナスの付き方で割る）、会心の倍率は
 * 窓の中の値から出る候補のうち、1 ヒットとして格子に乗る増分が一番多くなるもの（並んだら base に近いもの）。距離ボーナスとコアの倍率は base のまま。
 * increments は窓の中の、前のフレームも読めた、胴体の格子に乗らない増分
 */
export function estimateWindowGrid(
  increments: readonly number[],
  base: HitGrid,
  mode: DistanceMode,
): { grid: HitGrid; fit: number } {
  const freq = new Map<number, number>();
  for (const v of increments) freq.set(v, (freq.get(v) ?? 0) + 1);
  const top = [...freq].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (top === undefined) return { grid: base, fit: 0 };
  const ds = mode === 'all' ? [1] : mode === 'none' ? [0] : [0, 1];
  let best = { grid: base, fit: -1 };
  for (const d of ds) {
    const body = top / (1 + base.distance * d);
    const crits = new Set<number>([base.crit]);
    for (const u of freq.keys()) {
      for (const d2 of ds) {
        for (const c of [0, 1]) {
          const x = u / body - 1 - base.distance * d2 - base.core * c;
          if (x >= 0.3 && x <= 0.95) crits.add(x);
        }
      }
    }
    for (const crit of crits) {
      const grid = { ...base, body, crit };
      const fit = increments.filter((v) => hitCountCandidates(v, grid, 1, mode).length > 0).length;
      // 並んだら base の会心の倍率に近いほう（中遠 A では「会心▲ + 距離ボーナス」と「会心▲」が同じだけ乗る）
      const closer = Math.abs(crit - base.crit) < Math.abs(best.grid.crit - base.crit);
      if (fit > best.fit || (fit === best.fit && closer)) best = { grid, fit };
    }
  }
  return best;
}

/**
 * バーストの効果の窓を探す。前のフレームも読めた増分のうち、胴体の格子に 2 ヒットまでで乗らないものを、空きが gap（f）以下で
 * まとめ、minCount 個以上のまとまりを窓にする（読み違いの単発は窓にしない）。gap はリロードの空き（約 110f）を跨ぐ長さにする
 * （窓の中でリロードしても 1 つの窓にする）。窓の端に読み違いの単発が付いても、splitHits で胴体の格子に戻せる
 */
export function detectBuffWindows(
  rows: readonly HudIncrement[],
  grid: HitGrid,
  modeAt: (frame: number) => DistanceMode,
  gap = 150,
  minCount = 20,
): BuffWindow[] {
  const off = rows.filter(
    (r) => r.readGap === 1 && hitCountCandidates(r.increment, grid, 2, modeAt(r.frame)).length === 0,
  );
  const clusters: HudIncrement[][] = [];
  for (const r of off) {
    const last = clusters.at(-1)?.at(-1);
    if (last === undefined || r.frame - last.frame > gap) clusters.push([]);
    clusters.at(-1)!.push(r);
  }
  return clusters
    .filter((c) => c.length >= minCount)
    .map((c) => {
      // 格子は、胴体の格子に乗らない増分だけで測る（窓の中にも胴体の格子の増分が混ざりうる）
      const inside = c.map((r) => r.increment);
      const { grid: g, fit } = estimateWindowGrid(inside, grid, modeAt(c[0]!.frame));
      return { start: c[0]!.frame, end: c.at(-1)!.frame, grid: g, fit, total: inside.length };
    });
}

/**
 * [start, end] の間に撃った発の数を、照準の横の残弾の読みから数える（V-0201。バーストの効果の窓にかかるマガジン用）。
 * 完全なマガジンは撃ち切ってからリロードするので、撃った数 = 最初の残弾 − 撃たずに消えた弾。撃たずに消えた弾は、隣の読みどうしの
 * 減りが刻みから撃てる数（⌈Δf / interval⌉ + 1）を超え、その後 10f の間に戻らない所（最大装弾数▲が切れたときなど。capped に数える）の、
 * 減りから「その間に撃った数」（間のフレーム数を刻みで割った数（四捨五入）と、間にヒットのあったフレーム hitFrames の数の大きいほう）を
 * 引いたもの。減って戻る所は読み違いとして使わない。1 点の跳ねは、前後 3 点の中央値でならす
 */
export function shotsFromAmmo(
  ammo: readonly AmmoRow[],
  start: number,
  end: number,
  interval: number,
  hitFrames: readonly number[] = [],
  margin = 15,
): { shots: number; first: number; last: number; capped: number } | undefined {
  const raw = ammo.filter((a) => a.frame >= start - margin && a.frame <= end + margin);
  if (raw.length < 2) return undefined;
  const rows = raw.map((a, i) => {
    if (i === 0 || i === raw.length - 1) return a;
    const vs = [raw[i - 1]!.value, a.value, raw[i + 1]!.value].sort((x, y) => x - y);
    return { frame: a.frame, value: vs[1]! };
  });
  let removed = 0;
  let capped = 0;
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1]!;
    const b = rows[i]!;
    const drop = a.value - b.value;
    const cap = Math.ceil((b.frame - a.frame) / interval) + 1;
    if (drop <= cap) continue;
    if (rows.some((r) => r.frame > b.frame && r.frame <= b.frame + 10 && r.value > b.value + cap)) continue;
    capped++;
    const fired = Math.max(
      Math.round((b.frame - a.frame) / interval),
      hitFrames.filter((h) => h > a.frame && h <= b.frame).length,
    );
    removed += drop - fired;
  }
  const first = rows[0]!.value;
  return { shots: first - removed, first, last: rows.at(-1)!.value, capped };
}

/**
 * 増分の列をヒットの数に分ける。格子に乗らない増分は次の増分と足す（3 つまで。足しても乗らなければ捨てて unfit に数える）。
 * interval は発の刻み（f）。残弾で上限を出せないときの見積もりに使う。grid はフレームごとに替えてもよい（バーストの効果の窓）。
 * 格子を並びで返したときは、候補が出る最初の格子を使う
 */
export function splitHits(
  rows: readonly HudIncrement[],
  grid: HitGrid | ((frame: number) => HitGrid | readonly HitGrid[]),
  modeAt: (frame: number) => DistanceMode,
  ammo: readonly AmmoRow[],
  interval: number,
): { increments: SplitIncrement[]; unfit: number[] } {
  const gridsAt = (frame: number): readonly HitGrid[] => {
    const g = typeof grid === 'function' ? grid(frame) : grid;
    return Array.isArray(g) ? g : [g as HitGrid];
  };
  const out: SplitIncrement[] = [];
  const unfit: number[] = [];
  let pending: { increment: number; readGap: number; count: number } | undefined;
  for (const row of rows) {
    const increment = row.increment + (pending?.increment ?? 0);
    const readGap = row.readGap + (pending?.readGap ?? 0);
    const maxHits = Math.max(2, Math.floor(readGap / 2) + 2);
    let candidates: number[] = [];
    for (const g of gridsAt(row.frame)) {
      candidates = hitCountCandidates(increment, g, maxHits, modeAt(row.frame));
      if (candidates.length > 0) break;
    }
    if (candidates.length === 0) {
      if (pending !== undefined && pending.count >= 3) {
        unfit.push(row.frame);
        pending = undefined;
      } else pending = { increment, readGap, count: (pending?.count ?? 0) + 1 };
      continue;
    }
    pending = undefined;
    let bound: number;
    let boundFrom: SplitIncrement['boundFrom'];
    if (readGap === 1) {
      bound = 1;
      boundFrom = 'frame';
    } else {
      const fromAmmo = shotsUpperBound(ammo, row.frame - readGap, row.frame);
      if (fromAmmo !== undefined) {
        bound = Math.max(1, fromAmmo);
        boundFrom = 'ammo';
      } else {
        bound = Math.max(1, Math.round(readGap / interval));
        boundFrom = 'interval';
      }
    }
    const below = candidates.filter((k) => k <= bound);
    const hits = below.length > 0 ? below.at(-1)! : candidates[0]!;
    out.push({ frame: row.frame, increment, hits, candidates, bound, boundFrom, ambiguous: below.length > 1 });
  }
  return { increments: out, unfit };
}

/** ヒットのある増分を、空きが gap（f）を超える所でまとまり（マガジン）に分ける */
export function groupMagazines<T extends { frame: number }>(items: readonly T[], gap = 40): T[][] {
  const groups: T[][] = [];
  for (const it of items) {
    const last = groups.at(-1)?.at(-1);
    if (last === undefined || it.frame - last.frame > gap) groups.push([]);
    groups.at(-1)!.push(it);
  }
  return groups;
}

/** 区間の番号（0 始まり）。cuts はジャンプの前の最後の増分のフレーム（昇順） */
export function segmentOf(frame: number, cuts: readonly number[]): number {
  let i = 0;
  while (i < cuts.length && frame > cuts[i]!) i++;
  return i;
}

/**
 * 射撃場 3 分モードの区間の切れ目（ジャンプの前の最後の増分のフレーム）を、ヒットのまとまり（マガジン）から決める
 * （V-0198・V-0199 の切れ目と同じになる。区間の並びは 中近 → 近 → 遠 → 中遠 → 近 → 遠）。
 * - ジャンプで切れたマガジンは、満タンの長さ（(装弾数 − 1) × 刻み）の 93% に届かない（切れたまとまり）。
 * - 1 回目は最初の切れたまとまりの終わり。
 * - 近に出入りする切れ目（2・4・5 回目）は、まとまりの距離ボーナス（1 ヒットの増分の多いほう）が替わる所。4 回目は中遠が
 *   距離ボーナスの付かない着地点（B・C）のときだけで、付く着地点（A）なら 3 回目と同じ決め方。
 * - 3 回目（遠 → 中遠）は、前の切れ目から間隔（offsets）の 0.6〜1.15 倍の所に切れたまとまりがあればそれ、無ければ
 *   前の切れ目 + 間隔に一番近いまとまりの終わり。
 * offsets はジャンプの間隔の代表値（f。録画 138 の 2,037・2,432・2,032・2,061）
 */
export function detectCuts(
  rows: readonly HudIncrement[],
  grid: HitGrid,
  mag: number,
  interval: number,
  offsets: readonly number[] = [2037, 2432, 2032, 2061],
): number[] {
  // 最後のまとまりは切れ目にならないが、距離ボーナスの替わり目を見るのに使う
  const groups = groupMagazines(rows);
  const info = groups.map((g, i) => {
    let d1 = 0;
    let d0 = 0;
    for (const r of g) {
      if (r.readGap !== 1) continue;
      const d = singleHitDistance(r.increment, grid);
      if (d === 1) d1++;
      if (d === 0) d0++;
    }
    return {
      end: g.at(-1)!.frame,
      short: i < groups.length - 1 && g.at(-1)!.frame - g[0]!.frame < 0.93 * (mag - 1) * interval,
      last: i === groups.length - 1,
      dist: d1 > d0,
    };
  });
  const first = info.find((g) => g.short);
  if (first === undefined) return [];
  const cuts = [first.end];
  const byInterval = (prev: number, off: number): number | undefined =>
    info.find((g) => g.short && g.end > prev + 0.6 * off && g.end < prev + 1.15 * off)?.end ??
    info
      .filter((g) => g.end > prev && !g.last)
      .sort((a, b) => Math.abs(a.end - prev - off) - Math.abs(b.end - prev - off))[0]?.end;
  /** prev の後で、距離ボーナスが from から替わる直前のまとまりの終わり */
  const bySwitch = (prev: number, from: boolean): number | undefined => {
    const after = info.filter((g) => g.end > prev);
    const k = after.findIndex((g) => g.dist !== from);
    return k > 0 ? after[k - 1]!.end : undefined;
  };
  const steps: ((prev: number) => number | undefined)[] = [
    (prev) => bySwitch(prev, true),
    (prev) => byInterval(prev, offsets[1]!),
    (prev) => {
      const midFar = info.filter((g) => g.end > prev).slice(0, 2);
      return midFar.length > 0 && midFar.every((g) => !g.dist) ? bySwitch(prev, false) : byInterval(prev, offsets[2]!);
    },
    (prev) => bySwitch(prev, true),
  ];
  for (const step of steps) {
    const next = step(cuts.at(-1)!);
    if (next === undefined) break;
    cuts.push(next);
  }
  return cuts;
}
