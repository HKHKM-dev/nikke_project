// モダン UI で、スロットのニケの並びを元に戻す（スロットの並びの上の中央の「元に戻す」のボタン）。
// ニケの並びを変える操作（置く・入れ替える・外す・置き換える）の前の並びを積んでおき、戻すとその並びにする。戻すのは並びだけで、
// 育成・設定はいまの値のまま（ニケと一緒に動く。useSlotPlacement の rearrange）。操作のアイコンの位置は戻さない。
// 編成を切り替えたら、積んだものは捨てる
import { useState, type Dispatch } from 'react';
import { arrangementOf, teamReducer, type Arrangement, type TeamAction, type TeamState } from '../../team.ts';
import { sameKeys } from '../ErrorBoundary.tsx';
import type { SlotPlacement } from './useSlotPlacement.ts';

/** 覚えておく操作の数（古いものから捨てる） */
const UNDO_LIMIT = 50;

export function useSlotUndo(team: TeamState, dispatch: Dispatch<TeamAction>, activeParty: number) {
  const [stack, setStack] = useState<{ party: number; arrangements: readonly Arrangement[] }>({
    party: activeParty,
    arrangements: [],
  });
  // 編成を切り替えたら、積んだものを捨てる（描画の中で直す）
  if (stack.party !== activeParty) setStack({ party: activeParty, arrangements: [] });

  /** スロットを変える操作。ニケの並びが変わる操作なら、前の並びを積んでから行う */
  const trackedDispatch: Dispatch<TeamAction> = (action) => {
    const before = arrangementOf(team);
    if (!sameKeys(before, arrangementOf(teamReducer(team, action)))) {
      setStack((s) => ({ ...s, arrangements: [...s.arrangements.slice(1 - UNDO_LIMIT), before] }));
    }
    dispatch(action);
  };

  /** 1 つ前の並びに戻す（戻す操作は積まないので、trackedDispatch でない dispatch で作った placement を渡す） */
  const undo = (placement: SlotPlacement) => {
    const target = stack.arrangements.at(-1);
    if (target === undefined) return;
    setStack((s) => ({ ...s, arrangements: s.arrangements.slice(0, -1) }));
    placement.rearrange(target);
  };
  return { trackedDispatch, canUndo: stack.arrangements.length > 0, undo };
}
