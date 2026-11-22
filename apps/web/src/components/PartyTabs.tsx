// ソロレイド用の編成 01〜05 の切り替えボタン（parties.ts）。スロットの並びの上に置き、各ボタンの下にその編成のダメージを小さく出す
import type { MouseEvent, PointerEvent } from 'react';
import { formatDamage } from '../format.ts';
import { PARTY_COUNT, partyLabel, partyNumber } from '../parties.ts';
import type { PartyTotal } from '../partyTotals.ts';

type Props = {
  active: number;
  onSelect: (index: number) => void;
  /** 編成ごとのダメージ（partyTotals.ts） */
  totals: readonly PartyTotal[];
};

/** 編成のダメージの欄（format.ts の formatDamage。出せない値は「—」）。エラーの文は読み上げにだけ渡す（名前を読ませるため role を付ける） */
export function PartyTabTotal({ total }: { total: PartyTotal | undefined }) {
  return (
    <span
      className="party-tab-total"
      data-computing={total?.computing ?? false}
      role={total?.error === undefined ? undefined : 'img'}
      aria-label={total?.error === undefined ? undefined : `計算できない: ${total.error}`}
    >
      {formatDamage(total?.total ?? null)}
    </span>
  );
}

export function PartyTabs({ active, onSelect, totals }: Props) {
  return (
    <div className="party-tabs" role="group" aria-label="ソロレイドの編成">
      {Array.from({ length: PARTY_COUNT }, (_, i) => {
        const total = totals[i];
        return (
          <div className="party-tab-cell" key={i}>
            <PartyTabButton partyIndex={i} active={i === active} onClick={() => onSelect(i)} />
            <PartyTabTotal total={total} />
          </div>
        );
      })}
    </div>
  );
}

/** 編成の番号のボタン 1 つ（ここの切り替えと、モダン UI の行の左の番号。PartyPreviewRow の PartyRowLabel） */
export function PartyTabButton({
  partyIndex,
  active,
  onClick,
  onPointerDown,
}: {
  partyIndex: number;
  active: boolean;
  onClick: (event: MouseEvent) => void;
  onPointerDown?: (event: PointerEvent) => void;
}) {
  return (
    <button
      type="button"
      className="toggle-button party-tab"
      aria-pressed={active}
      aria-label={partyLabel(partyIndex)}
      onClick={onClick}
      onPointerDown={onPointerDown}
    >
      {partyNumber(partyIndex)}
    </button>
  );
}
