// @vitest-environment happy-dom
// スロットの並びの元に戻す・やり直す（useSlotUndo.ts）
import { act, renderHook } from '@testing-library/react';
import { useReducer } from 'react';
import { describe, expect, it } from 'vitest';
import { arrangementOf, initialTeamState, rearrangeActions, teamReducer, type TeamAction } from '../../team.ts';
import type { SlotPlacement } from './useSlotPlacement.ts';
import { useSlotUndo } from './useSlotUndo.ts';

/** 編成の状態と useSlotUndo。並べ替え（rearrange）は、絵を動かさずに操作だけ送る */
function useHarness() {
  const [team, dispatch] = useReducer(teamReducer, undefined, initialTeamState);
  const history = useSlotUndo(team, dispatch, 0);
  const placement = {
    rearrange: (target, send = dispatch) => {
      for (const action of rearrangeActions(arrangementOf(team), target)) send(action);
    },
  } as SlotPlacement;
  return { team, history, placement };
}

const select = (index: number, resourceId: number): TeamAction => ({ type: 'selectCharacter', index, resourceId });

describe('useSlotUndo', () => {
  it('戻した並びをやり直し、新しく並びを変えたらやり直す側を捨てる', () => {
    const { result } = renderHook(useHarness);
    const ids = () => arrangementOf(result.current.team);
    act(() => result.current.history.trackedDispatch(select(0, 10)));
    act(() => result.current.history.trackedDispatch(select(1, 11)));
    const placed = ids();
    expect(result.current.history.canRedo).toBe(false);

    act(() => result.current.history.undo(result.current.placement));
    expect(ids()).toEqual([10, null, null, null, null]);
    expect(result.current.history.canRedo).toBe(true);

    act(() => result.current.history.redo(result.current.placement));
    expect(ids()).toEqual(placed);
    expect(result.current.history.canRedo).toBe(false);
    expect(result.current.history.canUndo).toBe(true);

    act(() => result.current.history.undo(result.current.placement));
    act(() => result.current.history.trackedDispatch(select(2, 12)));
    expect(result.current.history.canRedo).toBe(false);
    expect(ids()).toEqual([10, null, 12, null, null]);
  });

  it('並びの変わらない操作は積まない', () => {
    const { result } = renderHook(useHarness);
    act(() => result.current.history.trackedDispatch({ type: 'setHpRatio', index: 0, hpRatio: 0.5 }));
    expect(result.current.history.canUndo).toBe(false);
  });
});
