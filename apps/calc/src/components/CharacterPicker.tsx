import { ELEMENT_LABEL, type CharacterIndexEntry } from '@nikke/core';
import { useMemo, useState } from 'react';

type Props = {
  index: readonly CharacterIndexEntry[];
  /** 他の枠で選択中のニケ。選択肢から除外する */
  excludeIds: ReadonlySet<number>;
  value: number | null;
  onSelect: (resourceId: number) => void;
  onClear: () => void;
};

export function characterLabel(entry: CharacterIndexEntry): string {
  return `${entry.name.ja} (${entry.name.en}) — ${entry.rarity} ${entry.weaponType} ${ELEMENT_LABEL[entry.element].ja}`;
}

export function CharacterPicker({ index, excludeIds, value, onSelect, onClear }: Props) {
  const [filter, setFilter] = useState('');
  const options = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const matches = (e: CharacterIndexEntry) =>
      q === '' || e.name.ja.toLowerCase().includes(q) || e.name.en.toLowerCase().includes(q);
    return index
      .filter((e) => e.resourceId === value || (!excludeIds.has(e.resourceId) && matches(e)))
      .sort((a, b) => a.name.ja.localeCompare(b.name.ja, 'ja'));
  }, [index, excludeIds, value, filter]);

  return (
    <div className="picker">
      <input
        type="search"
        value={filter}
        placeholder="名前で絞り込み（日本語 / 英語）"
        aria-label="ニケを検索"
        onChange={(e) => setFilter(e.target.value)}
      />
      <div className="picker-row">
        <select
          value={value ?? ''}
          aria-label="ニケを選択"
          onChange={(e) => {
            if (e.target.value !== '') onSelect(Number(e.target.value));
          }}
        >
          <option value="">— ニケを選ぶ —</option>
          {options.map((entry) => (
            <option key={entry.resourceId} value={entry.resourceId}>
              {characterLabel(entry)}
            </option>
          ))}
        </select>
        <button type="button" onClick={onClear} disabled={value === null}>
          外す
        </button>
      </div>
    </div>
  );
}
