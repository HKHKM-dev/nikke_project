// Stage 11 モダニア: 効果のあるスタック（「{N}スタック」「{Y}秒間維持」）の件（plan/design-stage11-modernia.md 2.2・3.2 節）。
// スタックの段ごとの件にほどく: 段 k の件 = スタック数が k 以上の区間。区間では段ごとの件を 1 つずつ足すので、
// k スタックのときの合計は k × 1 スタックの値になり、区間分割（skills/timeline.ts）と射手の実効値（frame/firstPass.ts）はそのまま使える。
// 1 パス目のループ（持ち主ごとの一覧。skills/holders.ts）が使う。発火のフレームより後の件は、それより前の発火だけで決まる
// （後の発火は、それが始まるフレームより前の件を変えない）ので、ループの途中の発火で作り直しても件は食い違わない。

/**
 * スタックの維持時間の数え方（仮。録画 0044 の 2 で確かめる）。
 * 'all' = 発火のたびに 1 スタック足し（上限で止める）、全スタックの維持時間を発火の時点から数え直す。切れたら全スタックが一度に消える。
 * 'each' = スタックごとに独立の維持時間（段 k = 直近の維持時間の中に k 回以上発火している区間。上限で止める）
 */
export const STACK_REFRESH: 'all' | 'each' = 'all';

/** 段 stack（1 始まり）の件 [start, end) */
export type StackItem = { stack: number; start: number; end: number };

/**
 * 2 段目の段 3（plan/design-skill-stage3.md 1.5 節）: スタック量の減少。フレーム frame に効いている段の上から amount 段を、
 * 次のフレーム（frame + 1）で切る。最後の 1 段は残す（付いている段より多く減らしても 1 段になる。V-0437 の録画 0463・0471）。
 * 2 段目の段 14 の PR 3（plan/design-skill-stage14.md 2.7 節）: closes なら最後の 1 段も切る（0 になったら件を閉じる。使用回数を使い切った時）。
 * 後の始まりは段 1 から数え直す
 */
export type StackDecrease = { frame: number; amount: number; closes?: true };

/**
 * 2 段目の段 14 の PR 3（同 2.7 節。論点 5）: スタックの上限。数か、始まりのフレームごとの上限（最大スタック数▲の中身の状態が付いている間だけ
 * 上がる。skills/holders.ts）。上限は始まり（発火）ごとに、そのフレームの値で見る。上限が下がっても付いている段は切らない
 */
export type MaxStacksAt = number | ((frame: number) => number);

/**
 * 発火（件が始まるフレーム）の列から、段ごとの件を作る。durationFrames ≤ 0 なら空。frames が上限。
 * 並びは段 1 から順に始まった順（'all' はチェーンの中で段が上がる順、'each' は区間の順）。
 * 2 段目の段 3: decreases（スタック量の減少）は 'all' だけ。同じフレームの始まりは減少の前に数える
 */
export function stackItems(
  starts: readonly number[],
  durationFrames: number,
  frames: number,
  maxStacks: MaxStacksAt,
  mode: 'all' | 'each' = STACK_REFRESH,
  decreases: readonly StackDecrease[] = [],
): StackItem[] {
  if (durationFrames <= 0 || (typeof maxStacks === 'number' && maxStacks < 1)) return [];
  const sorted = starts.filter((s) => s < frames).sort((a, b) => a - b);
  if (mode === 'each' && decreases.length > 0) throw new RangeError('a stack decrease needs STACK_REFRESH "all"');
  if (mode === 'all') return refreshAll(sorted, durationFrames, frames, maxStacks, decreases);
  if (typeof maxStacks !== 'number')
    throw new RangeError('a max stacks that changes by frame needs STACK_REFRESH "all"');
  return eachOwn(sorted, durationFrames, frames, maxStacks);
}

function refreshAll(
  sorted: readonly number[],
  durationFrames: number,
  frames: number,
  maxStacks: MaxStacksAt,
  decreases: readonly StackDecrease[],
): StackItem[] {
  const capAt = typeof maxStacks === 'number' ? () => maxStacks : maxStacks;
  const out: StackItem[] = [];
  /** いまのチェーンの段の件（段 1 から） */
  let chain: StackItem[] = [];
  let chainEnd = -1;
  const cuts = decreases.filter((d) => d.frame < frames).sort((a, b) => a.frame - b.frame);
  let next = 0;
  /**
   * フレーム limit より前の減少を当てる: 効いている段の上から切り（最後の 1 段は残す。段 14 の PR 3: closes なら最後の 1 段も切って
   * チェーンを閉じる）、後の始まりは減った段から数える
   */
  const cutBefore = (limit: number): void => {
    while (next < cuts.length && cuts[next]!.frame < limit) {
      const { frame, amount, closes } = cuts[next++]!;
      if (chain.length === 0 || frame >= chainEnd) continue;
      for (const w of chain.splice(Math.max(closes === true ? 0 : 1, chain.length - amount))) w.end = frame + 1;
      if (chain.length === 0) chainEnd = -1;
    }
  };
  for (const s of sorted) {
    cutBefore(s);
    const end = Math.min(s + durationFrames, frames);
    // 和集合（unionItems）と同じく、ちょうど切れたフレームの発火も続きとみなす
    if (chain.length > 0 && s <= chainEnd) {
      if (chain.length < capAt(s)) {
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
  cutBefore(Infinity);
  return out;
}

function eachOwn(sorted: readonly number[], durationFrames: number, frames: number, maxStacks: number): StackItem[] {
  const own = sorted.map((s) => [s, Math.min(s + durationFrames, frames)] as const);
  const bounds = [...new Set(own.flatMap(([s, e]) => [s, e]))].sort((a, b) => a - b);
  const out: StackItem[] = [];
  /** 段ごとに開いている件 */
  const open: (StackItem | null)[] = Array.from({ length: maxStacks }, () => null);
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
