// 持ち主ごとの一覧編（plan/design-holder-effects.md 段 D の 6・7）: テストで、結果の履歴から枠の値の小片を読む
// （区間に足す小片。段 D の 5 までの TeamSlotResult.windows・BuffTimeline.windows と同じ並び・同じ区切り）。
import { valuePiecesOf, type HolderHistory, type ValuePiece } from '../skills/holders.ts';
import { isStateStat } from '../skills/types.ts';

export function slotPieces(result: { history: HolderHistory }, slotIndex: number): ValuePiece[] {
  return valuePiecesOf(result.history).filter((p) => p.slotIndex === slotIndex && !isStateStat(p.effect.stat));
}
