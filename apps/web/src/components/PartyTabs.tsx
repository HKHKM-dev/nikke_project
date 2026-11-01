// ソロレイド用の編成 01〜05 の切り替えボタン（parties.ts）。スロットの並びの上に置き、各ボタンの下にその編成のダメージを小さく出す
import { formatNumber } from '../format.ts';
import { PARTY_COUNT, partyLabel, partyNumber } from '../parties.ts';
import type { PartyTotal } from '../partyTotals.ts';

type Props = {
  active: number;
  onSelect: (index: number) => void;
  /** 編成ごとのダメージ（partyTotals.ts） */
  totals: readonly PartyTotal[];
};

const compact = new Intl.NumberFormat('ja-JP', { notation: 'compact', maximumFractionDigits: 2 });

/** 値の欄の文言。値は短い表記（「21.01億」）で出し、全部の桁は title に出す */
function totalText(p: PartyTotal | undefined): { text: string; title: string } {
  if (p === undefined || p.kind === 'empty') return { text: '—', title: '' };
  if (p.kind === 'loading') return { text: '読込中', title: '読み込み中' };
  if (p.total === null) {
    return p.error === undefined ? { text: '計算中', title: '計算中' } : { text: 'エラー', title: p.error };
  }
  return { text: compact.format(p.total), title: formatNumber(p.total) };
}

export function PartyTabs({ active, onSelect, totals }: Props) {
  return (
    <div className="party-tabs" role="group" aria-label="ソロレイドの編成">
      {Array.from({ length: PARTY_COUNT }, (_, i) => {
        const text = totalText(totals[i]);
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
            <span className="party-tab-total" data-active={i === active} title={text.title}>
              {text.text}
            </span>
          </div>
        );
      })}
    </div>
  );
}
