// 確率のきっかけ（「〜した時、p% の確率で」）の timed を期待値で持つ（plan/design-soldier-eg.md 3.1 節）。
// 1 発ごとに確率 q = p × その発の回数の量（normalShot は 1、normalHit はその発の弾丸命中率）で付き、付いたら上書き延長（和集合）で
// D フレーム。フレーム t の効果の強さは、付いている確率 1 − Π (1 − qᵢ)（積は sᵢ ≤ t < sᵢ + D の機会。sᵢ は発の次のフレーム）に
// 値を掛けたもの。攻撃力▲などダメージの式で 1 次の stat なら、1 発の期待値はこの強さで付けた値と同じ（四捨五入の分を除く）。
// 窓は、機会の始まりと終わりで小片に割り、小片ごとに付いている確率（scale）を持たせる。区間・鍵・2 パス目は、ほかの窓と同じに読む。
// 機会は 1 パス目のループが発ごとに貯める（skills/holders.ts。回数の量が 0 の発と、窓が戦闘の終わりより後に始まる発は除く）。

/** 1 回の機会。start は窓が始まるフレーム（発の次のフレーム）、q はその発で付く確率 */
export type ChanceOpportunity = { start: number; q: number };

/** 期待値の窓の小片。scale はその間に効果が付いている確率（0 より大きく 1 以下） */
export type ChancePiece = { start: number; end: number; scale: number };

/** 付いている確率 1 − Π (1 − q)。機会の q の列から（順に掛けるので、同じ列なら同じ値） */
function scaleOf(qs: readonly number[]): number {
  let none = 1;
  for (const q of qs) none *= 1 - q;
  return 1 - none;
}

/**
 * 期待値の窓の小片（昇順・重ならない）。境目は機会の始まり sᵢ と終わり min(sᵢ + D, frames)。付いている確率が 0 の所は出さない。
 * 隣り合う小片の確率が同じなら 1 つにまとめる
 */
export function chancePieces(
  opportunities: readonly ChanceOpportunity[],
  durationFrames: number,
  frames: number,
): ChancePiece[] {
  if (durationFrames <= 0) return [];
  const sorted = [...opportunities].filter((o) => o.start < frames).sort((a, b) => a.start - b.start);
  const bounds = new Set<number>();
  for (const o of sorted) {
    bounds.add(o.start);
    bounds.add(Math.min(o.start + durationFrames, frames));
  }
  const edges = [...bounds].sort((a, b) => a - b);
  const pieces: ChancePiece[] = [];
  // 効いている機会は、始まりの昇順で並ぶので、窓 [lo, hi) の範囲として前から追う
  let lo = 0;
  let hi = 0;
  for (let i = 0; i + 1 < edges.length; i++) {
    const start = edges[i]!;
    const end = edges[i + 1]!;
    while (hi < sorted.length && sorted[hi]!.start <= start) hi++;
    while (lo < hi && sorted[lo]!.start + durationFrames <= start) lo++;
    if (lo >= hi) continue;
    const scale = scaleOf(sorted.slice(lo, hi).map((o) => o.q));
    if (scale <= 0) continue;
    const last = pieces[pieces.length - 1];
    if (last !== undefined && last.end === start && last.scale === scale) {
      last.end = end;
      continue;
    }
    pieces.push({ start, end, scale });
  }
  return pieces;
}

/**
 * 小片の値を丸める桁（skills/timeline.ts の KEY_DIGITS と同じ。循環 import を避けて写す。テストで突き合わせる）。小片の値は
 * 発ごとに細かく違うので、丸めないと、鍵（区間の合計を 6 桁で文字列にしたもの）が同じなのに値の違う区間が 1 つのグループに
 * まとまり、グループの値（sim/teamResult.ts。先頭の区間の値）が中の区間とずれる。丸めの誤差は値の 5 × 10⁻⁷ 以下
 */
export const CHANCE_VALUE_DIGITS = 6;

/** 効果の値 value に付いている確率 scale を掛け、CHANCE_VALUE_DIGITS の桁で丸めた値（窓の値。1 パス目の順位も同じ値を使う） */
export function chanceValueOf(value: number, scale: number): number {
  const unit = 10 ** CHANCE_VALUE_DIGITS;
  return Math.round(value * scale * unit) / unit;
}

/** フレーム frame に効果が付いている確率（chancePieces の、frame を含む小片の scale。無ければ 0） */
export function chanceScaleAt(
  opportunities: readonly ChanceOpportunity[],
  durationFrames: number,
  frame: number,
): number {
  const active = opportunities.filter((o) => o.start <= frame && frame < o.start + durationFrames);
  if (active.length === 0) return 0;
  return scaleOf([...active].sort((a, b) => a.start - b.start).map((o) => o.q));
}

/** スタックの段ごとの期待値の小片。scale はその間にスタック数が stack 以上である確率 */
export type ChanceStackPiece = ChancePiece & { stack: number };

/** 生きている鎖（最後に付いた機会の窓の終わりと、スタック数ごとの確率。添字はスタック数 − 1） */
type StackChain = { end: number; w: number[] };

/**
 * chanceStackPieces の途中の状態。時刻 now までの機会を処理し、now より前の小片を出し終えた所（now からの小片はまだ出していない）。
 * 機会は 1 パス目が始まりの昇順に後ろへ足すので、足されたら now から先だけを進める
 */
type StackRun = {
  maxStacks: number;
  done: number;
  now: number;
  alive: StackChain[];
  pieces: ChanceStackPiece[];
  /** 段 − 1 → まだ伸ばせる最後の小片の pieces の添字（無ければ −1） */
  open: number[];
};

/**
 * 機会の列ごとの途中の状態（持ち主の件の列で機会の列を共有するので、作り直しも 1 回で済む）。1 つの機会の列は 1 つの付与のもので、
 * 維持・上限・戦闘の長さは変わらない
 */
const stackRuns = new WeakMap<readonly ChanceOpportunity[], StackRun>();

/** [run.now, to) の、段ごとの「スタック数が段以上の確率」の小片を足し（同じ確率で続けば伸ばす）、now を to にして切れた鎖を落とす */
function advanceStacks(run: StackRun, to: number): void {
  const from = run.now;
  if (from < to) {
    const atLeast = new Array<number>(run.maxStacks).fill(0);
    for (const c of run.alive) {
      let tail = 0;
      for (let k = run.maxStacks - 1; k >= 0; k--) {
        tail += c.w[k]!;
        atLeast[k]! += tail;
      }
    }
    for (let k = 1; k <= run.maxStacks; k++) {
      const scale = Math.min(1, atLeast[k - 1]!);
      if (scale <= 0) {
        run.open[k - 1] = -1;
        continue;
      }
      const last = run.pieces[run.open[k - 1]!];
      if (last !== undefined && last.end === from && last.scale === scale) {
        last.end = to;
        continue;
      }
      run.open[k - 1] = run.pieces.length;
      run.pieces.push({ start: from, end: to, scale, stack: k });
    }
  }
  run.now = to;
  // 鎖は付いた順（= 窓の終わりの順）に並ぶので、切れたものは前から外す
  let gone = 0;
  while (gone < run.alive.length && run.alive[gone]!.end <= to) gone++;
  if (gone > 0) run.alive.splice(0, gone);
}

/** 鎖の窓の終わりで区切りながら、時刻 until まで進める */
function advanceUntil(run: StackRun, until: number): void {
  while (run.now < until) advanceStacks(run, Math.min(until, run.alive[0]?.end ?? until));
}

/** 時刻 now に始まる機会 q を処理する（生きている鎖に 1 − q を掛け、付いた鎖を足す） */
function applyOpportunity(run: StackRun, q: number, durationFrames: number): void {
  const next = new Array<number>(run.maxStacks).fill(0);
  let held = 0;
  for (const c of run.alive) {
    for (let k = 0; k < run.maxStacks; k++) {
      const p = c.w[k]!;
      held += p;
      next[Math.min(k + 1, run.maxStacks - 1)]! += q * p;
      c.w[k] = p * (1 - q);
    }
  }
  next[0]! += q * Math.max(0, 1 - held);
  run.alive.push({ end: run.now + durationFrames, w: next });
}

/**
 * 確率のきっかけで付く、スタックする状態の件（plan/design-tove-base.md 2.2 節）。機会 i（始まり sᵢ・確率 qᵢ）で付くと
 * 1 スタック足し（上限 maxStacks で止める）、全スタックの維持を sᵢ から数え直す（STACK_REFRESH 'all'。C-0559）。最後に付いてから
 * D フレームで全スタックが消える。
 * 「最後に付いた機会が j で、スタック数が k」の確率 W_j(k) を、機会と窓の終わりの時刻の順に追う。機会 i では、生きている W_j に
 * (1 − qᵢ) を掛け、W_i(k) = qᵢ × (Σ_j W_j(k − 1)（上限は K から K も） + [k = 1] × 付いていない確率) を足す。窓の終わり sⱼ + D では W_j を
 * 落とす（同じフレームの機会より先。窓は [sⱼ, sⱼ + D)）。境目の間の、スタック数が k 以上の確率を段 k の小片の scale にする。
 * 機会が始まりの昇順（同じフレームなし）で後ろに足されていくなら、前の呼び出しの途中の状態から続ける
 */
export function chanceStackPieces(
  opportunities: readonly ChanceOpportunity[],
  durationFrames: number,
  frames: number,
  maxStacks: number,
): ChanceStackPiece[] {
  if (durationFrames <= 0 || maxStacks < 1) return [];
  let run = stackRuns.get(opportunities);
  if (run === undefined || run.done > opportunities.length) {
    run = { maxStacks, done: 0, now: 0, alive: [], pieces: [], open: new Array<number>(maxStacks).fill(-1) };
    stackRuns.set(opportunities, run);
  }
  // 確定する所: 次の機会の始まりまで進め、その機会を処理する（同じフレームの機会は、窓の終わりの後にまとめて）
  while (run.done < opportunities.length && opportunities[run.done]!.start < frames) {
    const start = opportunities[run.done]!.start;
    if (start < run.now) throw new RangeError('chance opportunities must be appended in order of their start');
    advanceUntil(run, start);
    while (run.done < opportunities.length && opportunities[run.done]!.start === start) {
      applyOpportunity(run, opportunities[run.done++]!.q, durationFrames);
    }
  }
  // 後ろ: 状態を写して戦闘の終わりまで進める（持っている小片は書き換えない。開いている段の小片だけ写す）
  const tail: StackRun = {
    ...run,
    alive: run.alive.map((c) => ({ end: c.end, w: [...c.w] })),
    pieces: [...run.pieces],
    open: [...run.open],
  };
  for (const i of tail.open) if (i >= 0) tail.pieces[i] = { ...tail.pieces[i]! };
  advanceUntil(tail, frames);
  return tail.pieces;
}

/** 段 k の小片の列から、フレーム frame でスタック数が k 以上の確率（添字 k − 1。無ければ 0） */
export function chanceStackLevelsAt(
  items: readonly { start: number; end: number; stack?: number; scale?: number }[],
  frame: number,
  maxStacks: number,
): number[] {
  const out = new Array<number>(maxStacks).fill(0);
  for (const it of items) {
    if (it.start > frame || frame >= it.end || it.stack === undefined || it.stack > maxStacks) continue;
    out[it.stack - 1] = it.scale ?? 1;
  }
  return out;
}
