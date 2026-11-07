// スロットの詳細設定（クラシックのポップアップとモダンの育成のモーダルで共通）。バーストしないと、想定 HP の欄
// （HP の割合の条件を持つ効果のあるスロットにだけ出す。calcView.ts の usesHpRatio。plan/design-ui-rebuild.md 5.2 節）
import type { Dispatch } from 'react';
import type { SlotState, TeamAction } from '../team.ts';
import { IntInput } from './IntInput.tsx';

type Props = {
  slotIndex: number;
  slot: SlotState;
  usesHpRatio: boolean;
  dispatch: Dispatch<TeamAction>;
};

export function SlotOptions({ slotIndex, slot, usesHpRatio, dispatch }: Props) {
  return (
    <>
      <div className="slot-toggles">
        <button
          type="button"
          className="toggle-button"
          aria-pressed={slot.noBurst}
          onClick={() => dispatch({ type: 'setNoBurst', index: slotIndex, noBurst: !slot.noBurst })}
        >
          バーストしない
        </button>
      </div>
      {usesHpRatio && (
        <label className="field">
          <span>想定 HP（%）</span>
          <IntInput
            value={Math.round(slot.hpRatio * 100)}
            min={1}
            max={100}
            onCommit={(n) => dispatch({ type: 'setHpRatio', index: slotIndex, hpRatio: n / 100 })}
          />
        </label>
      )}
    </>
  );
}
