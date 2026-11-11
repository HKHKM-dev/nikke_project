// クラシックのスロットの上の「並べ替え」で開く「一覧の並び」の欄（ClassicView）: 並びと向き（plan/design-combat-power-sort.md 6 節）
import {
  LIST_DIRECTION_LABEL,
  LIST_DIRECTION_MARK,
  LIST_ORDERS,
  LIST_ORDER_LABEL,
  OVERLOAD_WITHOUT_ROSTER_HINT,
} from '../listOrder.ts';
import type { ListOrderControls } from '../useListOrder.ts';

/** 知らせの文が長いとメニューが横に広がるので、幅を抑える */
const NOTE = { maxWidth: '22em' } as const;

export function ListOrderSettings({
  order,
  select,
  direction,
  toggleDirection,
  fixedSpecPowers,
  failedCount,
  tableError,
  overloadWithoutRoster,
}: ListOrderControls) {
  return (
    <fieldset className="popover-group">
      <legend>一覧の並び</legend>
      {LIST_ORDERS.map((o) => (
        <label key={o} className="popover-option">
          {/* 選んでいる並びをもう一度押すと、昇順と降順を入れ替える（モダン UI の並べ替えと同じ） */}
          <input
            type="radio"
            name="listOrder"
            value={o}
            checked={order === o}
            onChange={() => select(o)}
            onClick={() => order === o && toggleDirection()}
          />
          <span>
            {LIST_ORDER_LABEL[o]}
            {order === o && (
              <span title={`${LIST_DIRECTION_LABEL[direction]}（押すと入れ替える）`}>
                {' '}
                {LIST_DIRECTION_MARK[direction]}
              </span>
            )}
          </span>
        </label>
      ))}
      {fixedSpecPowers && order === 'combatPower' && (
        <p className="hint" style={NOTE}>
          スペック固定の値で計算した戦闘力で並べる（育成状況が無いときも。実機とは照合していない）
        </p>
      )}
      {tableError !== null && (
        <p className="hint" style={NOTE}>
          戦闘力の表を読めない: {tableError}
        </p>
      )}
      {overloadWithoutRoster && (
        <p className="hint" style={NOTE}>
          {OVERLOAD_WITHOUT_ROSTER_HINT}
        </p>
      )}
      {order === 'combatPower' && failedCount > 0 && (
        <p className="hint" style={NOTE}>
          戦闘力を出せない {failedCount} 体は、育成状況にいないキャラと同じ所（後ろ）に名前順で並べる
        </p>
      )}
    </fieldset>
  );
}
