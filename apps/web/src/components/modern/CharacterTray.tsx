import { useDroppable } from '@dnd-kit/core';
import { fixedSpecGrowth, type BuildSnapshot, type CharacterIndexEntry } from '@nikke/core';
import { useMemo, useState } from 'react';
import { BADGE_KINDS, matchesBadgeFilters, toggleBadgeFilter, type BadgeFilters, type BadgeKind } from './badges.ts';
import { CharacterTrayItem } from './CharacterTrayItem.tsx';
import { growthMarksOf } from './GrowthMarks.tsx';

type Props = {
  index: readonly CharacterIndexEntry[];
  takenIds: ReadonlySet<number>;
  otherPartyIds: ReadonlySet<number>;
  fullySupported: ReadonlySet<number> | null;
  /** 置くスロットのクリックを待っているニケ */
  pendingId: number | null;
  /** 読み込んだ育成状況（各ニケの限界突破・コア強化を出す。無ければ出さない） */
  roster: BuildSnapshot | null;
  /** スペック固定（各ニケの限界突破・コア強化は、計算に使う固定の値を出す） */
  fixedSpec: boolean;
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

export function CharacterTray({
  index,
  takenIds,
  otherPartyIds,
  fullySupported,
  pendingId,
  roster,
  fixedSpec,
  onSelectCharacter,
}: Props) {
  const growthOf = (char: CharacterIndexEntry) => {
    // スペック固定のときはスロットと同じく固定の値（限界突破・コアとも上限）、ほかは育成状況の値（無ければ出さない）
    if (fixedSpec) return growthMarksOf(char.rarity, fixedSpecGrowth(char));
    const entry = roster?.characters[String(char.resourceId)];
    return entry ? growthMarksOf(char.rarity, entry.growth) : null;
  };
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<BadgeFilters>({});

  // スロットのキャラをトレイへ戻すと、そのスロットを空にする（ModernView の handleDragEnd）
  const { isOver, active, setNodeRef } = useDroppable({ id: 'tray-drop', data: { type: 'tray' } });
  const returning = isOver && active?.data.current?.type === 'slot-character';
  const [onlySupported, setOnlySupported] = useState(false);

  // 並びは受け取った一覧の順（App が名前順か戦闘力順に並べる。listOrder.ts）
  const filteredCharacters = useMemo(() => {
    const q = query.trim().toLowerCase();
    return index.filter((char) => {
      if (!matchesBadgeFilters(char, filters)) return false;
      if (onlySupported && fullySupported && !fullySupported.has(char.resourceId)) return false;
      if (q && !char.name.ja.toLowerCase().includes(q) && !char.name.en.toLowerCase().includes(q)) return false;
      return true;
    });
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
        {/* 並べ替え・フィルター・立ち絵の縦長と四角の切り替えのボタンの置き場所（未実装。押しても何も起きない）。
            disabled にすると、アーティファクトのコメントでボタンを選べない（マウスの操作を受けない）ので aria-disabled にする */}
        <div className="char-tray-actions">
          <button type="button" className="char-tray-action-button" aria-disabled="true" title="並べ替え（未実装）">
            並べ替え<span className="char-tray-unimplemented">未実装</span>
          </button>
          <button type="button" className="char-tray-action-button" aria-disabled="true" title="フィルター（未実装）">
            フィルター<span className="char-tray-unimplemented">未実装</span>
          </button>
          <button
            type="button"
            className="char-tray-action-button"
            aria-disabled="true"
            title="立ち絵の縦長・四角の切り替え（未実装）"
          >
            縦長 / 四角<span className="char-tray-unimplemented">未実装</span>
          </button>
        </div>
      </div>

      <div className={`char-tray-list ${pendingId !== null ? 'char-tray-list-pending' : ''}`}>
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
                isPending={pendingId === char.resourceId}
                growthMarks={growthOf(char)}
                onClick={() => onSelectCharacter(char.resourceId)}
              />
            );
          })
        )}
      </div>
    </section>
  );
}
