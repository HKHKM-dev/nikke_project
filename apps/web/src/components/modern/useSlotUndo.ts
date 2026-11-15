// モダン UI で、スロットの入れ替え・スロットから外す・いるニケの置き換えを元に戻す（スロットの並びの上の中央の「元に戻す」のボタン）。
// 操作の前のスロット（と操作のアイコンの位置）を積んでおき、戻すとそれに差し替える。操作の後にスロットがほかの操作
// （一覧から空きに置く・育成の変更・編成の切り替えなど）で変わったら、戻せない（ボタンを出さない）
import { useEffect, useRef, useState, type Dispatch } from 'react';
import { partyOf, type Party } from '../../parties.ts';
import type { TeamAction, TeamState } from '../../team.ts';

/** 覚えておく操作の数（古いものから捨てる） */
const UNDO_LIMIT = 50;

/** 戻せる操作の前のスロットと、操作の後のスロット（いまのスロットと操作のアイコンの位置がこれのときだけ戻せる） */
type UndoEntry = { before: Party; after: Party };

/** 元に戻せるようにする操作か（入れ替え・外す・いるニケを別のニケに置き換える） */
function isUndoable(team: TeamState, action: TeamAction): boolean {
  switch (action.type) {
    case 'swapSlots':
      return action.fromIndex !== action.toIndex;
    case 'clearSlot':
      return team.slots[action.index]?.resourceId != null;
    case 'selectCharacter':
      return team.slots[action.index]?.resourceId != null;
    default:
      return false;
  }
}

export function useSlotUndo(team: TeamState, dispatch: Dispatch<TeamAction>) {
  const [stack, setStack] = useState<readonly UndoEntry[]>([]);
  // 操作の前のスロット。操作の後の描画で、後のスロットと組にして積む
  const recordingRef = useRef<Party | null>(null);
  useEffect(() => {
    const before = recordingRef.current;
    if (before === null || before.slots === team.slots) return;
    setStack((s) => [...s.slice(1 - UNDO_LIMIT), { before, after: partyOf(team) }]);
  }, [team]);
  // 覚えた前のスロットは、操作の後の描画で使い切る（操作が止められて、スロットが変わらなかったときも捨てる）
  useEffect(() => {
    recordingRef.current = null;
  });

  /** スロットを変える操作。元に戻せる操作なら、前のスロットを覚えてから行う */
  const trackedDispatch: Dispatch<TeamAction> = (action) => {
    if (isUndoable(team, action)) recordingRef.current = partyOf(team);
    dispatch(action);
  };

  const top = stack.at(-1);
  const canUndo =
    top !== undefined && top.after.slots === team.slots && top.after.controlledSlot === team.controlledSlot;
  const undo = () => {
    if (!canUndo) return;
    setStack((s) => s.slice(0, -1));
    // 前のスロットそのもの（同じ配列）に戻すので、1 つ前の操作の「後」と一致し、続けて戻せる
    dispatch({ type: 'replace', state: { ...team, ...top.before } });
  };
  return { trackedDispatch, canUndo, undo };
}
