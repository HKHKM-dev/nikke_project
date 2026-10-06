// ソルジャーE.G. 編（plan/design-soldier-eg.md 3.1 節）: 確率のきっかけ（「〜した時、p% の確率で」）の timed を期待値で持つ。
// 1 発ごとに確率 q = p × その発の回数の量（normalShot は 1、normalHit はその発の弾丸命中率）で付き、付いたら上書き延長（和集合）で
// D フレーム。フレーム t の効果の強さは、付いている確率 1 − Π (1 − qᵢ)（積は sᵢ ≤ t < sᵢ + D の機会。sᵢ は発の次のフレーム）に
// 値を掛けたもの。攻撃力▲などダメージの式で 1 次の stat なら、1 発の期待値はこの強さで付けた値と同じ（四捨五入の分を除く）。
// 窓は、機会の始まりと終わりで小片に割り、小片ごとに付いている確率（scale）を持たせる。区間・鍵・calc・sim の読み方は変えない。
import type { ResolvedShotCountTrigger } from './resolve.ts';
import { shotCountWeight, type FrameEvents } from './triggers.ts';

/** 1 回の機会。start は窓が始まるフレーム（発の次のフレーム）、q はその発で付く確率 */
export type ChanceOpportunity = { start: number; q: number };

/** 期待値の窓の小片。scale はその間に効果が付いている確率（0 より大きく 1 以下） */
export type ChancePiece = { start: number; end: number; scale: number };

/**
 * 出来事の列から、枠 slotIndex の確率のきっかけの機会を並べる（昇順）。回数の量が 0 の射撃と、窓が戦闘の終わり（frames）より後に
 * 始まる射撃は除く（回数トリガーの窓が発の次のフレームから始まる規則。skills/timeline.ts の buffStartFires と同じ）
 */
export function chanceOpportunities(
  trigger: ResolvedShotCountTrigger & { chance: number },
  slotIndex: number,
  events: readonly FrameEvents[],
  frames: number,
): ChanceOpportunity[] {
  const out: ChanceOpportunity[] = [];
  for (const ev of events) {
    const shot = ev.shots[slotIndex];
    if (!shot) continue;
    const weight = shotCountWeight(trigger.count, shot);
    if (weight <= 0 || ev.frame + 1 >= frames) continue;
    out.push({ start: ev.frame + 1, q: Math.min(1, trigger.chance * weight) });
  }
  return out;
}

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
 * まとまり、calc（グループの値で数える）と sim（区間ごとの値で数える）がずれる。丸めの誤差は値の 5 × 10⁻⁷ 以下
 */
export const CHANCE_VALUE_DIGITS = 6;

/** 効果の値 value に付いている確率 scale を掛け、CHANCE_VALUE_DIGITS の桁で丸めた値（窓の値。1 パス目の順位も同じ値を使う） */
export function chanceValueOf(value: number, scale: number): number {
  const unit = 10 ** CHANCE_VALUE_DIGITS;
  return Math.round(value * scale * unit) / unit;
}

/** フレーム frame に効果が付いている確率（chancePieces の、frame を含む小片の scale。無ければ 0） */
export function chanceScaleAt(opportunities: readonly ChanceOpportunity[], durationFrames: number, frame: number): number {
  const active = opportunities.filter((o) => o.start <= frame && frame < o.start + durationFrames);
  if (active.length === 0) return 0;
  return scaleOf([...active].sort((a, b) => a.start - b.start).map((o) => o.q));
}
