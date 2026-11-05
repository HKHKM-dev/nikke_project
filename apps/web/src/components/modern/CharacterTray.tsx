import { useDroppable } from '@dnd-kit/core';
import type { CharacterIndexEntry } from '@nikke/core';
import { useMemo, useState } from 'react';
import { BADGE_KINDS, type BadgeKey, type BadgeKind } from './badges.ts';
import { CharacterTrayItem } from './CharacterTrayItem.tsx';

type Props = {
  index: readonly CharacterIndexEntry[];
  takenIds: ReadonlySet<number>;
  fullySupported: ReadonlySet<number> | null;
  onSelectCharacter: (resourceId: number) => void;
  activeSlotIndex: number;
};

/** 1 種類のバッジを並べた絞り込み。押すとその値で絞り、押されたものをもう一度押すと解除する */
function BadgeFilter({
  kind,
  value,
  onChange,
}: {
  kind: BadgeKind;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}) {
  return (
    <div className="char-tray-badge-filter" role="group" aria-label={`${kind.name}で絞り込み`}>
      {Object.entries(kind.badges).map(([v, { src, label }]) => {
        const pressed = value === v;
        return (
          <button
            key={v}
            type="button"
            className="char-tray-badge-button"
            aria-pressed={pressed}
            title={label}
            onClick={() => onChange(pressed ? undefined : v)}
          >
            <img className="char-badge" src={src} alt={label} draggable={false} />
          </button>
        );
      })}
    </div>
  );
}

export function CharacterTray({ index, takenIds, fullySupported, onSelectCharacter, activeSlotIndex }: Props) {
  const [query, setQuery] = useState('');
  // バッジの絞り込み（項目 → 選んだ値。無い項目は絞らない）
  const [filters, setFilters] = useState<Partial<Record<BadgeKey, string>>>({});

  // スロットのキャラをトレイへ戻すと、そのスロットを空にする（ModernView の handleDragEnd）
  const { isOver, active, setNodeRef } = useDroppable({ id: 'tray-drop', data: { type: 'tray' } });
  const returning = isOver && active?.data.current?.type === 'slot-character';
  const [onlySupported, setOnlySupported] = useState(false);

  const filteredCharacters = useMemo(() => {
    const q = query.trim().toLowerCase();
    return index
      .filter((char) => {
        if (BADGE_KINDS.some(({ key }) => filters[key] !== undefined && char[key] !== filters[key])) return false;
        if (onlySupported && fullySupported && !fullySupported.has(char.resourceId)) return false;
        if (q && !char.name.ja.toLowerCase().includes(q) && !char.name.en.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => {
        // 編成中のキャラは後ろへ
        const aTaken = takenIds.has(a.resourceId);
        const bTaken = takenIds.has(b.resourceId);
        if (aTaken !== bTaken) return aTaken ? 1 : -1;
        return a.name.ja.localeCompare(b.name.ja, 'ja');
      });
  }, [index, filters, onlySupported, fullySupported, query, takenIds]);

  return (
    <section
      ref={setNodeRef}
      className={`char-tray-panel ${returning ? 'char-tray-returning' : ''}`}
      aria-label="ニケ一覧パレット"
    >
      <div className="char-tray-header">
        <div className="char-tray-title">
          <h3>ニケ一覧</h3>
          <span className="char-tray-target-slot">
            配置先: <strong>スロット {activeSlotIndex + 1}</strong>
          </span>
          <span className="char-tray-hint">スロットのニケをここへ戻すと外す</span>
        </div>
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
                onChange={(value) => setFilters((f) => ({ ...f, [kind.key]: value }))}
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
