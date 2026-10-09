// 3 分モードの残り時間の秒の変わり目（timer.ts --mode changes）から、動画のフレームをゲーム内のティック（止まりを除いた
// 1 フレーム 0.017 秒）に直す（V-0302）。止まり（フルバーストの入り C-0069・発動 C-0289・発動と関係しない C-0262）のあいだは
// 残り時間も止まるので、直した値に止まりは入らない。

/** ゲーム内の 1 秒のティック数（1 ÷ 0.017） */
export const TICKS_PER_SECOND = 1 / 0.017;

/** 秒の変わり目 1 つ: 動画のフレーム c、戦闘開始からの経過秒 k、o = c − 戦闘開始 − k × 58.8235（止まりの累計 + 0〜1 の鋸歯） */
export type TimerOffset = { c: number; k: number; o: number };

/**
 * 変わり目に経過秒を振る。フルバーストの表示が欄に重なって拾われる偽の変わり目を除くため、
 * (1) 近く（± 4 秒）のほかの変わり目と (c − 戦闘開始) mod 58.8235 が ± 1.2 で揃うものが 2 つ以上あるものだけを残し、
 * (2) 前の変わり目からの間隔が m × 58.8235 − 1.6〜+ 55 に入るものだけを採って m 秒進める（止まりは 1 区間で 55f まで）。
 * start は戦闘開始（02:59 が出たフレーム。C-0078）
 */
export function timerOffsets(changes: readonly number[], start: number): TimerOffset[] {
  const F = TICKS_PER_SECOND;
  const all = changes.filter((c) => c > start + 20);
  const phase = (c: number) => (((c - start) % F) + F) % F;
  const circular = (a: number, b: number) => {
    const d = Math.abs(a - b) % F;
    return Math.min(d, F - d);
  };
  const cs = all.filter(
    (c) => all.filter((x) => x !== c && Math.abs(x - c) <= 4 * F && circular(phase(x), phase(c)) <= 1.2).length >= 2,
  );
  const fits = (a: number, b: number): number => {
    const d = b - a;
    for (let m = 1; m <= 300; m++) if (d >= m * F - 1.6 && d <= m * F + 55) return m;
    return 0;
  };
  const out: TimerOffset[] = [];
  let prev: TimerOffset = { c: start, k: 0, o: 0 };
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i]!;
    const m = fits(prev.c, c);
    const nextOk = i === cs.length - 1 || cs.slice(i + 1, i + 6).some((x) => fits(c, x) > 0 && x - c < 4 * F);
    if (m === 0 || !nextOk) continue;
    const k = prev.k + m;
    const o = c - start - F * k;
    if (o < prev.o - 1.6) continue;
    prev = { c, k, o };
    out.push(prev);
  }
  return out;
}

/** フレーム f の止まりの累計 O: f の直後（after）と直前（before）の 3 つの変わり目の o の最小（鋸歯の下の縁） */
export function stallAt(offsets: readonly TimerOffset[], f: number): { after: number; before: number } {
  const after = offsets.filter((x) => x.c > f).slice(0, 3);
  const before = offsets.filter((x) => x.c <= f).slice(-3);
  const min = (a: readonly TimerOffset[]) => (a.length > 0 ? Math.min(...a.map((x) => x.o)) : Number.NaN);
  return { after: min(after), before: min(before) };
}

/** 戦闘開始からのゲーム内のティック（f − 戦闘開始 − 直後の O）。直前と直後の O が 0.8 以上違えば、その秒の中に止まりがある */
export function gameTicksAt(
  offsets: readonly TimerOffset[],
  start: number,
  f: number,
): { ticks: number; stallInSecond: boolean } {
  const s = stallAt(offsets, f);
  return { ticks: f - start - s.after, stallInSecond: Math.abs(s.after - s.before) >= 0.8 };
}

/**
 * 止まりの区切り 1 つ（V-0379「読み方」2）: 区切った変わり目 at と、その前の変わり目 before のあいだに止まりがある。
 * 大きさは low〜high（区切りの前後の共通部分の差の両端）、size はその真ん中。負は読み違い（下に外れた所）
 */
export type TimerStall = { before: number; at: number; size: number; low: number; high: number };

/** 共通部分を判定するときの丸めの幅 */
const OVERLAP_EPS = 1e-6;

/**
 * 止まりを区間の共通部分で区切る（V-0379「読み方」2。backlog 5-3）。止まりの累計 S が一定のあいだ、変わり目ごとに
 * S + 位相は (o − 1, o] にあるので、変わり目を順にその区間の共通部分に足し、新しい区間が共通部分と重ならなくなった所
 * （と、変わり目が 4 秒以上飛んだ所）で区切る。前後の 3 点の最小の差で見る timerSteps は、鋸歯の位相によって 1f の
 * 止まりを取りこぼす（V-0286・C-0415）。この区切り方は、単騎のオートバーストの I の発動 19 回の止まりをすべて拾った（V-0379）
 */
export function timerStalls(offsets: readonly TimerOffset[]): TimerStall[] {
  const runs: { first: number; low: number; high: number }[] = [];
  let cur: { first: number; low: number; high: number } | null = null;
  for (let i = 0; i < offsets.length; i++) {
    const { o, k } = offsets[i]!;
    const gap = i > 0 && k - offsets[i - 1]!.k > 3;
    if (cur !== null && !gap && o - 1 < cur.high + OVERLAP_EPS && o > cur.low - OVERLAP_EPS) {
      cur.low = Math.max(cur.low, o - 1);
      cur.high = Math.min(cur.high, o);
    } else {
      cur = { first: i, low: o - 1, high: o };
      runs.push(cur);
    }
  }
  return runs.slice(1).map((b, r) => {
    const a = runs[r]!;
    const low = b.low - a.high;
    const high = b.high - a.low;
    return { before: offsets[b.first - 1]!.c, at: offsets[b.first]!.c, size: (low + high) / 2, low, high };
  });
}

/**
 * フレーム f の前後に掛かる止まり: 区切りのうち、変わり目のあいだ (before, at] が [f − before, f + after] に掛かるもの
 * （V-0379 の発動ごとの止まりは、発動の 35f 前から 5f 後まで）
 */
export function stallsAround(
  stalls: readonly TimerStall[],
  f: number,
  before = 35,
  after = 5,
): { size: number; stalls: TimerStall[] } {
  const hit = stalls.filter((s) => s.at >= f - before && s.before <= f + after);
  return { size: hit.reduce((a, s) => a + s.size, 0), stalls: hit };
}

/** 止まりの段: 前の 3 点の最小と、その点からの 3 点の最小の差が + 0.8 以上の点（隣り合う 130f 以内は大きいほう。V-0168 と同じ） */
export function timerSteps(offsets: readonly TimerOffset[]): { c: number; size: number }[] {
  const raw: { c: number; size: number }[] = [];
  for (let i = 3; i < offsets.length - 2; i++) {
    const pre = Math.min(...offsets.slice(i - 3, i).map((x) => x.o));
    const post = Math.min(...offsets.slice(i, i + 3).map((x) => x.o));
    if (post - pre >= 0.8) raw.push({ c: offsets[i]!.c, size: Number((post - pre).toFixed(2)) });
  }
  const merged: { c: number; size: number }[] = [];
  for (const s of raw) {
    const last = merged.at(-1);
    if (last !== undefined && s.c - last.c < 130) {
      if (s.size > last.size) merged[merged.length - 1] = s;
    } else merged.push(s);
  }
  return merged;
}
