// ソロレイド用の編成 01〜05 の切り替えボタン（parties.ts）。スロットの並びの上に置く
import { PARTY_COUNT, partyLabel } from '../parties.ts';

type Props = {
  active: number;
  onSelect: (index: number) => void;
};

export function PartyTabs({ active, onSelect }: Props) {
  return (
    <div className="party-tabs" role="group" aria-label="ソロレイドの編成">
      {Array.from({ length: PARTY_COUNT }, (_, i) => (
        <button
          key={i}
          type="button"
          className="toggle-button party-tab"
          aria-pressed={i === active}
          onClick={() => onSelect(i)}
        >
          {partyLabel(i)}
        </button>
      ))}
    </div>
  );
}
