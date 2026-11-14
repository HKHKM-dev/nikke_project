import type { CharacterIndexEntry } from '@nikke/core';
import { useMemo } from 'react';
import type { OtherParties } from '../parties.ts';

type Props = {
  index: readonly CharacterIndexEntry[];
  /** 他の枠で選択中のニケ。選択肢から除外する */
  excludeIds: ReadonlySet<number>;
  /** すべてのスロットに未実装が無いキャラ。ほかのキャラの名前に「（未）」を付ける。読み込み前は null（印を付けない） */
  fullySupported: ReadonlySet<number> | null;
  /** ほかの編成で選んでいるニケ。名前に「（ほかの編成で使用中）」を付け、選べなくする */
  otherPartyIds: OtherParties;
  value: number | null;
  onSelect: (resourceId: number) => void;
  /** 「なし」を選んだとき（スロットを空にする） */
  onClear: () => void;
};

export function characterLabel(entry: CharacterIndexEntry, isUnsupported: boolean, inOtherParty = false): string {
  return `${entry.name.ja}${isUnsupported ? '（未）' : ''}${inOtherParty ? '（ほかの編成で使用中）' : ''}`;
}

export function CharacterPicker({ index, excludeIds, fullySupported, otherPartyIds, value, onSelect, onClear }: Props) {
  // 並びは受け取った一覧の順（App が名前順か戦闘力順に並べる。listOrder.ts）
  const options = useMemo(
    () => index.filter((e) => e.resourceId === value || !excludeIds.has(e.resourceId)),
    [index, excludeIds, value],
  );

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
          <option key={entry.resourceId} value={entry.resourceId} disabled={otherPartyIds.has(entry.resourceId)}>
            {characterLabel(
              entry,
              fullySupported !== null && !fullySupported.has(entry.resourceId),
              otherPartyIds.has(entry.resourceId),
            )}
          </option>
        ))}
      </select>
    </div>
  );
}
