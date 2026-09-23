// Stage 11 モダニア: 効果のあるスタック（「{N}スタック」「{Y}秒間維持」）の窓（plan/design-stage11-modernia.md 2.2・3.2 節）。
// スタックの段ごとの窓にほどく: 段 k の窓 = スタック数が k 以上の区間。区間では段ごとの窓を 1 つずつ足すので、
// k スタックのときの合計は k × 1 スタックの値になり、区間分割（skills/timeline.ts）と射手の実効値（sim/firstPass.ts）はそのまま使える。
// planBuffTimeline（バッチ）と 1 パス目のループが同じ関数を使う。発火のフレームより後の窓は、それより前の発火だけで決まる
// （後の発火は、それが始まるフレームより前の窓を変えない）ので、ループの途中の発火で作り直しても窓は食い違わない。

/**
 * スタックの維持時間の数え方（仮。録画 44 の 2 で確かめる）。
 * 'all' = 発火のたびに 1 スタック足し（上限で止める）、全スタックの維持時間を発火の時点から数え直す。切れたら全スタックが一度に消える。
 * 'each' = スタックごとに独立の維持時間（段 k = 直近の維持時間の中に k 回以上発火している区間。上限で止める）
 */
export const STACK_REFRESH: 'all' | 'each' = 'all';

/** 段 stack（1 始まり）の窓 [start, end) */
export type StackWindow = { stack: number; start: number; end: number };

/**
 * 発火（窓が始まるフレーム）の列から、段ごとの窓を作る。durationFrames ≤ 0 なら空。frames が上限。
 * 並びは段 1 から順に始まった順（'all' はチェーンの中で段が上がる順、'each' は区間の順）
 */
export function stackWindows(
  starts: readonly number[],
  durationFrames: number,
  frames: number,
  maxStacks: number,
  mode: 'all' | 'each' = STACK_REFRESH,
): StackWindow[] {
  if (durationFrames <= 0 || maxStacks < 1) return [];
  const sorted = starts.filter((s) => s < frames).sort((a, b) => a - b);
  return mode === 'all'
    ? refreshAll(sorted, durationFrames, frames, maxStacks)
    : eachOwn(sorted, durationFrames, frames, maxStacks);
}

function refreshAll(
  sorted: readonly number[],
  durationFrames: number,
  frames: number,
  maxStacks: number,
): StackWindow[] {
  const out: StackWindow[] = [];
  /** いまのチェーンの段の窓（段 1 から） */
  let chain: StackWindow[] = [];
  let chainEnd = -1;
  for (const s of sorted) {
    const end = Math.min(s + durationFrames, frames);
    // 和集合（unionWindows）と同じく、ちょうど切れたフレームの発火も続きとみなす
    if (chain.length > 0 && s <= chainEnd) {
      if (chain.length < maxStacks) {
        const w = { stack: chain.length + 1, start: s, end };
        chain.push(w);
        out.push(w);
      }
      chainEnd = Math.max(chainEnd, end);
      for (const w of chain) w.end = chainEnd;
      continue;
    }
    const w = { stack: 1, start: s, end };
    chain = [w];
    chainEnd = end;
    out.push(w);
  }
  return out;
}

function eachOwn(sorted: readonly number[], durationFrames: number, frames: number, maxStacks: number): StackWindow[] {
  const own = sorted.map((s) => [s, Math.min(s + durationFrames, frames)] as const);
  const bounds = [...new Set(own.flatMap(([s, e]) => [s, e]))].sort((a, b) => a - b);
  const out: StackWindow[] = [];
  /** 段ごとに開いている窓 */
  const open: (StackWindow | null)[] = Array.from({ length: maxStacks }, () => null);
  for (let i = 0; i + 1 < bounds.length; i++) {
    const a = bounds[i]!;
    const b = bounds[i + 1]!;
    const covered = Math.min(maxStacks, own.filter(([s, e]) => s <= a && a < e).length);
    for (let k = 0; k < maxStacks; k++) {
      const w = open[k] ?? null;
      if (k < covered) {
        if (w !== null && w.end === a) w.end = b;
        else {
          const next = { stack: k + 1, start: a, end: b };
          open[k] = next;
          out.push(next);
        }
      } else open[k] = null;
    }
  }
  return out.sort((x, y) => x.start - y.start || x.stack - y.stack);
}
