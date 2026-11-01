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

/** 値の欄の文言。狭い画面では compact（「21.01億」）を出す（styles.css） */
function totalText(p: PartyTotal | undefined): { full: string; compact: string } {
  if (p === undefined || p.kind === 'empty') return { full: '—', compact: '—' };
  if (p.kind === 'loading') return { full: '読み込み中', compact: '読込中' };
  if (p.total === null) {
    const text = p.error === undefined ? '計算中' : 'エラー';
    return { full: text, compact: text };
  }
  return { full: formatNumber(p.total), compact: compact.format(p.total) };
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
            <span className="party-tab-total" data-active={i === active} title={totals[i]?.error ?? text.full}>
              <span className="party-tab-total-full">{text.full}</span>
              <span className="party-tab-total-compact">{text.compact}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
