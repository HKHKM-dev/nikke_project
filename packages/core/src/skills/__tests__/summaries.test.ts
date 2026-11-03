// 枠ごとの効果のまとめ（skills/summaries.ts）の不発の数え方
import { describe, expect, it } from 'vitest';
import type { ItemEffect } from '../resolve.ts';
import { slotEffectSummaries, type SummaryPiece } from '../summaries.ts';
import type { ConditionSkip } from '../timeline.ts';

/** S1 の効果 0（どの枠のキャラでも同じスロット・番号） */
const effect = { source: { skill: 'skill1' }, effectIndex: 0, stat: 'attack' } as unknown as ItemEffect;
const piece = (sourceSlotIndex: number): SummaryPiece => ({ slotIndex: 0, sourceSlotIndex, effect });
const skip = (sourceSlotIndex: number): ConditionSkip => ({
  frame: 0,
  sourceSlotIndex,
  effect: { source: effect.source, effectIndex: 0 },
});

describe('slotEffectSummaries', () => {
  it('counts the skips only on the rows of the effects this slot gave, not on the same slot and index of another', () => {
    const rows = slotEffectSummaries([piece(0), piece(1)], [skip(0), skip(0), skip(1)], 0);
    expect(rows.map((r) => [r.sourceSlotIndex, r.skips])).toEqual([
      [0, 2],
      [1, 0],
    ]);
  });
});
