import { useDroppable } from '@dnd-kit/core';
import type { CharacterIndexEntry } from '@nikke/core';
import { useMemo, useState } from 'react';
import { BADGE_KINDS, matchesBadgeFilters, toggleBadgeFilter, type BadgeFilters, type BadgeKind } from './badges.ts';
import { CharacterTrayItem } from './CharacterTrayItem.tsx';

type Props = {
  index: readonly CharacterIndexEntry[];
  takenIds: ReadonlySet<number>;
  otherPartyIds: ReadonlySet<number>;
  fullySupported: ReadonlySet<number> | null;
  onSelectCharacter: (resourceId: number) => void;
};

/** 1 種類のバッジを並べた絞り込み（押したときの切り替えは toggleBadgeFilter） */
function BadgeFilter({
  kind,
  value,
  onToggle,
}: {
  kind: BadgeKind;
  value: string | undefined;
  onToggle: (value: string) => void;
}) {
  return (
    <div className="char-tray-badge-filter" role="group" aria-label={`${kind.name}で絞り込み`}>
      {Object.entries(kind.badges).map(([v, { src, label }]) => (
        <button
          key={v}
          type="button"
          className="char-tray-badge-button"
          aria-pressed={value === v}
          title={label}
          onClick={() => onToggle(v)}
        >
          <img className="char-badge" src={src} alt={label} draggable={false} />
        </button>
      ))}
    </div>
  );
}

export function CharacterTray({ index, takenIds, otherPartyIds, fullySupported, onSelectCharacter }: Props) {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<BadgeFilters>({});

  // スロットのキャラをトレイへ戻すと、そのスロットを空にする（ModernView の handleDragEnd）
  const { isOver, active, setNodeRef } = useDroppable({ id: 'tray-drop', data: { type: 'tray' } });
  const returning = isOver && active?.data.current?.type === 'slot-character';
  const [onlySupported, setOnlySupported] = useState(false);

  const filteredCharacters = useMemo(() => {
    const q = query.trim().toLowerCase();
    return index
      .filter((char) => {
        if (!matchesBadgeFilters(char, filters)) return false;
        if (onlySupported && fullySupported && !fullySupported.has(char.resourceId)) return false;
        if (q && !char.name.ja.toLowerCase().includes(q) && !char.name.en.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => a.name.ja.localeCompare(b.name.ja, 'ja'));
  }, [index, filters, onlySupported, fullySupported, query]);

  return (
    <section
      ref={setNodeRef}
      className={`char-tray-panel ${returning ? 'char-tray-returning' : ''}`}
      aria-label="ニケ一覧パレット"
    >
      <div className="char-tray-header">
        <div className="char-tray-filters">
          <input
            type="search"
            className="char-tray-search"
            placeholder="名前で検索…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="char-tray-filter-group">
            {BADGE_KINDS.map((kind) => (
              <BadgeFilter
                key={kind.key}
                kind={kind}
                value={filters[kind.key]}
                onToggle={(value) => setFilters((f) => toggleBadgeFilter(f, kind.key, value))}
              />
            ))}
            <label className="char-tray-checkbox-label">
              <input type="checkbox" checked={onlySupported} onChange={(e) => setOnlySupported(e.target.checked)} />
              <span>完全対応のみ</span>
            </label>
          </div>
        </div>
      </div>

      <div className="char-tray-list">
        {filteredCharacters.length === 0 ? (
          <p className="char-tray-empty">該当するニケが見つかりませんでした。</p>
        ) : (
          filteredCharacters.map((char) => {
            const isTaken = takenIds.has(char.resourceId);
            const isUnsupported = fullySupported !== null && !fullySupported.has(char.resourceId);
            return (
              <CharacterTrayItem
                key={char.resourceId}
                character={char}
                isTaken={isTaken}
                inOtherParty={otherPartyIds.has(char.resourceId)}
                isUnsupported={isUnsupported}
                onClick={() => onSelectCharacter(char.resourceId)}
              />
            );
          })
        )}
      </div>
    </section>
  );
}
