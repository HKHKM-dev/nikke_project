import { useDroppable } from '@dnd-kit/core';
import type { BuildSnapshot, CharacterIndexEntry } from '@nikke/core';
import { useMemo, useState } from 'react';
import { BADGE_KINDS, matchesBadgeFilters, toggleBadgeFilter, type BadgeFilters, type BadgeKind } from './badges.ts';
import { CharacterTrayItem } from './CharacterTrayItem.tsx';
import { trayGrowthMarks } from './GrowthMarks.tsx';
import { LIST_ORDERS, LIST_ORDER_LABEL, type ListOrder } from '../../listOrder.ts';
import type { ListOrderControls } from '../../useListOrder.ts';

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
  /** 一覧の並び（名前順・戦闘力順。設定のメニューの「一覧の並び」と同じもの） */
  listOrder: ListOrderControls;
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
  listOrder,
  onSelectCharacter,
}: Props) {
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
        {/* 並べ替え（名前順・戦闘力順）と、フィルター・立ち絵の縦長と四角の切り替えのボタンの置き場所（フィルターと切り替えは未実装。
            押しても何も起きない。disabled にすると、アーティファクトのコメントでボタンを選べない（マウスの操作を受けない）ので aria-disabled にする） */}
        <div className="char-tray-actions">
          <label className="char-tray-action-button char-tray-sort">
            並べ替え
            <select value={listOrder.order} onChange={(e) => listOrder.select(e.target.value as ListOrder)}>
              {LIST_ORDERS.map((o) => (
                <option key={o} value={o}>
                  {LIST_ORDER_LABEL[o]}
                </option>
              ))}
            </select>
          </label>
          {/* 設定のメニューの「一覧の並び」にあった知らせ（モダン UI ではここに出す） */}
          {listOrder.order === 'combatPower' && listOrder.tableError !== null && (
            <span className="hint">戦闘力の表を読めない: {listOrder.tableError}</span>
          )}
          {listOrder.order === 'combatPower' && listOrder.failedCount > 0 && (
            <span className="hint">戦闘力を出せない {listOrder.failedCount} 体は後ろに名前順で並べる</span>
          )}
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
                growthMarks={trayGrowthMarks(char, roster, fixedSpec)}
                onClick={() => onSelectCharacter(char.resourceId)}
              />
            );
          })
        )}
      </div>
    </section>
  );
}
