// ソロレイド用の編成 01〜05 の切り替えボタン（parties.ts）。スロットの並びの上に置き、各ボタンの下にその編成のダメージを小さく出す
import { formatDamage } from '../format.ts';
import { PARTY_COUNT, partyLabel, partyNumber } from '../parties.ts';
import type { PartyTotal } from '../partyTotals.ts';

type Props = {
  active: number;
  onSelect: (index: number) => void;
  /** 編成ごとのダメージ（partyTotals.ts） */
  totals: readonly PartyTotal[];
};

export function PartyTabs({ active, onSelect, totals }: Props) {
  return (
    <div className="party-tabs" role="group" aria-label="ソロレイドの編成">
      {Array.from({ length: PARTY_COUNT }, (_, i) => {
        return (
          <div className="party-tab-cell" key={i}>
            <button
              type="button"
              className="toggle-button party-tab"
              aria-pressed={i === active}
              aria-label={partyLabel(i)}
              onClick={() => onSelect(i)}
            >
              {partyNumber(i)}
            </button>
            {/* 値の欄（format.ts の formatDamage。出せない値は「—」）。エラーの文は読み上げにだけ渡す */}
            <span
              className="party-tab-total"
              data-computing={totals[i]?.computing ?? false}
              aria-label={totals[i]?.error === undefined ? undefined : `計算できない: ${totals[i]!.error}`}
            >
              {formatDamage(totals[i]?.total ?? null)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
