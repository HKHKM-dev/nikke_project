// モダン UI で、スロットのニケの並びを元に戻す・やり直す（スロットの並びの上の中央の「元に戻す」「やり直す」のボタン）。
// ニケの並びを変える操作（置く・入れ替える・外す・置き換える）の前の並びを積んでおき、戻すとその並びにする。戻した並びは
// やり直す側に積み、やり直すとその並びに進める。新しく並びを変えたら、やり直す側は捨てる。戻す・やり直すのは並びだけで、
// 育成・設定はいまの値のまま（ニケと一緒に動く。useSlotPlacement の rearrange）。操作のアイコンの位置は戻さない。
// 編成を切り替えたら、積んだものは捨てる
import { useState, type Dispatch } from 'react';
import { arrangementOf, teamReducer, type Arrangement, type TeamAction, type TeamState } from '../../team.ts';
import { sameKeys } from '../ErrorBoundary.tsx';
import type { SlotPlacement } from './useSlotPlacement.ts';

/** 覚えておく操作の数（古いものから捨てる） */
const UNDO_LIMIT = 50;

type History = { party: number; undo: readonly Arrangement[]; redo: readonly Arrangement[] };

const push = (list: readonly Arrangement[], item: Arrangement) => [...list.slice(1 - UNDO_LIMIT), item];

export function useSlotUndo(team: TeamState, dispatch: Dispatch<TeamAction>, activeParty: number) {
  const [history, setHistory] = useState<History>({ party: activeParty, undo: [], redo: [] });
  // 編成を切り替えたら、積んだものを捨てる（描画の中で直す）
  if (history.party !== activeParty) setHistory({ party: activeParty, undo: [], redo: [] });

  /** スロットを変える操作。ニケの並びが変わる操作なら、前の並びを積み、やり直す側を捨ててから行う */
  const trackedDispatch: Dispatch<TeamAction> = (action) => {
    const before = arrangementOf(team);
    if (!sameKeys(before, arrangementOf(teamReducer(team, action)))) {
      setHistory((h) => ({ ...h, undo: push(h.undo, before), redo: [] }));
    }
    dispatch(action);
  };

  /** 1 つ前の並びに戻す。いまの並びはやり直す側に積む（戻す操作は積まないので、受け取った dispatch で送る） */
  const undo = (placement: SlotPlacement) => {
    const target = history.undo.at(-1);
    if (target === undefined) return;
    const current = arrangementOf(team);
    setHistory((h) => ({ ...h, undo: h.undo.slice(0, -1), redo: push(h.redo, current) }));
    placement.rearrange(target, dispatch);
  };

  /** 戻した並びをやり直す。いまの並びは戻す側に積む */
  const redo = (placement: SlotPlacement) => {
    const target = history.redo.at(-1);
    if (target === undefined) return;
    const current = arrangementOf(team);
    setHistory((h) => ({ ...h, redo: h.redo.slice(0, -1), undo: push(h.undo, current) }));
    placement.rearrange(target, dispatch);
  };

  return { trackedDispatch, canUndo: history.undo.length > 0, canRedo: history.redo.length > 0, undo, redo };
}
