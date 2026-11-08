// ダメージの合計の枠（編成ダメージ・合計ダメージ）。見出しと、名前と値の帯。計算中は値を薄くする
import { formatDamage } from '../format.ts';

type Props = {
  title: string;
  /** 帯の左の名前（なければ値を中央に出す） */
  label?: string;
  /** null は値なし（—） */
  value: number | null;
  computing: boolean;
};

export function DamageTotalPanel({ title, label, value, computing }: Props) {
  return (
    <fieldset className="panel damage-total">
      <legend>{title}</legend>
      <div className="team-total-bar" data-computing={computing} data-centered={label === undefined}>
        {label !== undefined && <span className="team-total-label">{label}</span>}
        <span className="team-total-val">{formatDamage(value)}</span>
      </div>
    </fieldset>
  );
}
