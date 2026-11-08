// 設定のメニューの「一覧の並び」の欄: 名前順・戦闘力順（plan/design-combat-power-sort.md 6 節）
import { LIST_ORDERS, LIST_ORDER_LABEL } from '../listOrder.ts';
import type { ListOrderControls } from '../useListOrder.ts';
import { inertControlProps } from './inertControl.ts';

/** 知らせの文が長いとメニューが横に広がるので、幅を抑える */
const NOTE = { maxWidth: '22em' } as const;

export function ListOrderSettings({
  order,
  select,
  combatPowerAvailable,
  fixedSpec,
  failedCount,
  tableError,
}: ListOrderControls) {
  return (
    <fieldset className="popover-group">
      <legend>一覧の並び</legend>
      {LIST_ORDERS.map((o) => (
        <label key={o} className="popover-option">
          <input
            type="radio"
            name="listOrder"
            value={o}
            checked={order === o}
            {...inertControlProps(o === 'combatPower' && !combatPowerAvailable)}
            onChange={() => !(o === 'combatPower' && !combatPowerAvailable) && select(o)}
          />
          <span>{LIST_ORDER_LABEL[o]}</span>
        </label>
      ))}
      {!combatPowerAvailable && (
        <p className="hint" style={NOTE}>
          戦闘力順は、育成状況を読み込むか、スペック固定にすると選べる
        </p>
      )}
      {fixedSpec && order === 'combatPower' && (
        <p className="hint" style={NOTE}>
          スペック固定の値で計算した戦闘力で並べる（実機とは照合していない）
        </p>
      )}
      {tableError !== null && (
        <p className="hint" style={NOTE}>
          戦闘力の表を読めない: {tableError}
        </p>
      )}
      {failedCount > 0 && (
        <p className="hint" style={NOTE}>
          戦闘力を出せない {failedCount} 体は、育成状況にいないキャラと同じ所（後ろ）に名前順で並べる
        </p>
      )}
    </fieldset>
  );
}
