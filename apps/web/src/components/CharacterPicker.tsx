import type { CharacterIndexEntry } from '@nikke/core';
import { useContext, useMemo } from 'react';
import { combatPowerNote } from '../listOrder.ts';
import { ListOrderContext } from '../useListOrder.ts';

type Props = {
  index: readonly CharacterIndexEntry[];
  /** 他の枠で選択中のニケ。選択肢から除外する */
  excludeIds: ReadonlySet<number>;
  /** すべてのスロットに未実装が無いキャラ。ほかのキャラの名前に「（未）」を付ける。読み込み前は null（印を付けない） */
  fullySupported: ReadonlySet<number> | null;
  /** ほかの編成で選んでいるニケ。名前に「（ほかの編成で使用中）」を付ける（選べる） */
  otherPartyIds: ReadonlySet<number>;
  value: number | null;
  onSelect: (resourceId: number) => void;
  /** 「なし」を選んだとき（スロットを空にする） */
  onClear: () => void;
};

/** power: 戦闘力順のときに添える戦闘力（listOrder.ts の combatPowerNote） */
export function characterLabel(
  entry: CharacterIndexEntry,
  isUnsupported: boolean,
  inOtherParty = false,
  power = '',
): string {
  return `${entry.name.ja}${power}${isUnsupported ? '（未）' : ''}${inOtherParty ? '（ほかの編成で使用中）' : ''}`;
}

export function CharacterPicker({ index, excludeIds, fullySupported, otherPartyIds, value, onSelect, onClear }: Props) {
  // 並びは受け取った一覧の順（App が名前順か戦闘力順に並べる。listOrder.ts）
  const options = useMemo(
    () => index.filter((e) => e.resourceId === value || !excludeIds.has(e.resourceId)),
    [index, excludeIds, value],
  );
  const { order, powers } = useContext(ListOrderContext);

  return (
    <div className="picker">
      <select
        value={value ?? ''}
        aria-label="ニケを選択"
        onChange={(e) => {
          if (e.target.value === '') {
            onClear();
          } else {
            onSelect(Number(e.target.value));
          }
        }}
      >
        <option value="">なし</option>
        {options.map((entry) => (
          <option key={entry.resourceId} value={entry.resourceId}>
            {characterLabel(
              entry,
              fullySupported !== null && !fullySupported.has(entry.resourceId),
              otherPartyIds.has(entry.resourceId),
              combatPowerNote(order, powers, entry.resourceId),
            )}
          </option>
        ))}
      </select>
    </div>
  );
}
