import type { CharacterIndexEntry } from '@nikke/core';
import { useMemo } from 'react';

type Props = {
  index: readonly CharacterIndexEntry[];
  /** 他の枠で選択中のニケ。選択肢から除外する */
  excludeIds: ReadonlySet<number>;
  /** すべてのスロットに未実装が無いキャラ。ほかのキャラの名前に「（未）」を付ける。読み込み前は null（印を付けない） */
  fullySupported: ReadonlySet<number> | null;
  value: number | null;
  onSelect: (resourceId: number) => void;
  /** 「なし」を選んだとき（スロットを空にする） */
  onClear: () => void;
};

export function characterLabel(entry: CharacterIndexEntry, isUnsupported: boolean): string {
  return `${entry.name.ja}${isUnsupported ? '（未）' : ''}`;
}

export function CharacterPicker({ index, excludeIds, fullySupported, value, onSelect, onClear }: Props) {
  const options = useMemo(() => {
    return index
      .filter((e) => e.resourceId === value || !excludeIds.has(e.resourceId))
      .sort((a, b) => a.name.ja.localeCompare(b.name.ja, 'ja'));
  }, [index, excludeIds, value]);

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
            {characterLabel(entry, fullySupported !== null && !fullySupported.has(entry.resourceId))}
          </option>
        ))}
      </select>
    </div>
  );
}
