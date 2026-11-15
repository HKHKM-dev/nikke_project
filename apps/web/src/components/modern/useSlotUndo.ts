// モダン UI で、スロットのニケの並びを元に戻す（スロットの並びの上の中央の「元に戻す」のボタン）。
// ニケの並びを変える操作（置く・入れ替える・外す・置き換える）の前の並びを積んでおき、戻すとその並びにする。戻すのは並びだけで、
// 育成・設定はいまの値のまま（ニケと一緒に動く。useSlotPlacement の rearrange）。操作のアイコンの位置は戻さない。
// 編成を切り替えたら、積んだものは捨てる
import { useEffect, useRef, useState, type Dispatch } from 'react';
import type { TeamAction, TeamState } from '../../team.ts';
import type { SlotPlacement } from './useSlotPlacement.ts';

/** 覚えておく操作の数（古いものから捨てる） */
const UNDO_LIMIT = 50;

/** スロットごとのニケ（null は空き） */
type Arrangement = readonly (number | null)[];
const arrangementOf = (team: TeamState): Arrangement => team.slots.map((s) => s.resourceId);
const sameArrangement = (a: Arrangement, b: Arrangement) => a.length === b.length && a.every((id, i) => id === b[i]);

export function useSlotUndo(team: TeamState, dispatch: Dispatch<TeamAction>, activeParty: number) {
  const [stack, setStack] = useState<{ party: number; arrangements: readonly Arrangement[] }>({
    party: activeParty,
    arrangements: [],
  });
  // 編成を切り替えたら、積んだものを捨てる（描画の中で直す）
  if (stack.party !== activeParty) setStack({ party: activeParty, arrangements: [] });

  // 操作の前の並び。操作の後の描画で、並びが変わっていれば積む
  const recordingRef = useRef<Arrangement | null>(null);
  useEffect(() => {
    const before = recordingRef.current;
    if (before === null || sameArrangement(before, arrangementOf(team))) return;
    setStack((s) => ({ ...s, arrangements: [...s.arrangements.slice(1 - UNDO_LIMIT), before] }));
  }, [team]);
  // 覚えた前の並びは、操作の後の描画で使い切る（操作が止められて、並びが変わらなかったときも捨てる）
  useEffect(() => {
    recordingRef.current = null;
  });

  /** スロットを変える操作。ニケの並びを変える操作なら、前の並びを覚えてから行う */
  const trackedDispatch: Dispatch<TeamAction> = (action) => {
    if (
      recordingRef.current === null &&
      (action.type === 'swapSlots' || action.type === 'clearSlot' || action.type === 'selectCharacter')
    ) {
      recordingRef.current = arrangementOf(team);
    }
    dispatch(action);
  };

  const canUndo = stack.arrangements.length > 0;
  /** 1 つ前の並びに戻す（placement は trackedDispatch で作ったもの。戻す操作は積まない） */
  const undo = (placement: SlotPlacement) => {
    const target = stack.arrangements.at(-1);
    if (target === undefined) return;
    setStack((s) => ({ ...s, arrangements: s.arrangements.slice(0, -1) }));
    placement.rearrange(target);
    // rearrange が trackedDispatch で覚えた前の並びは捨てる
    recordingRef.current = null;
  };
  return { trackedDispatch, canUndo, undo };
}
