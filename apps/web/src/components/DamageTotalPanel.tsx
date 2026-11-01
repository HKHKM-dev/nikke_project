// ダメージの合計の枠（編成ダメージ・合計ダメージ）。見出しと、名前と値の帯。計算中は値を薄くして印を出す
import type { ReactNode } from 'react';
import { formatNumber } from '../format.ts';

type Props = {
  title: string;
  /** 帯の左の名前 */
  label: string;
  /** null は値なし（—） */
  value: number | null;
  computing: boolean;
  children?: ReactNode;
};

export function DamageTotalPanel({ title, label, value, computing, children }: Props) {
  return (
    <fieldset className="panel damage-total">
      <legend>{title}</legend>
      <div className="team-total-bar" data-computing={computing}>
        <span className="team-total-label">
          {label}
          {computing && (
            <span className="team-total-computing" role="status">
              計算中…
            </span>
          )}
        </span>
        <span className="team-total-val">{value === null ? '—' : formatNumber(value)}</span>
      </div>
      {children}
    </fieldset>
  );
}
