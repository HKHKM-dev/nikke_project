import { useDroppable } from '@dnd-kit/core';
import type { BuildSnapshot, CharacterIndexEntry } from '@nikke/core';
import { useMemo, useState } from 'react';
import {
  BADGE_KINDS,
  filterButtonValues,
  matchesBadgeFilters,
  toggleBadgeFilter,
  trayCollectionBadge,
  type BadgeFilters,
  type BadgeKind,
} from './badges.ts';
import { BadgeIcon } from './BadgeIcon.tsx';
import { CharacterTrayItem } from './CharacterTrayItem.tsx';
import { activeDragData, type OverDragData } from './dropIntent.ts';
import { trayGrowthMarks } from './GrowthMarks.tsx';
import { LIST_ORDERS, LIST_ORDER_LABEL, type ListOrder } from '../../listOrder.ts';
import type { ListOrderControls } from '../../useListOrder.ts';
import { TRAY_SHAPE_LABEL, type TrayShape } from '../../trayShape.ts';
import type { OtherParties } from '../../parties.ts';
import { NO_PARTIES } from './OtherPartyBadges.tsx';

type Props = {
  index: readonly CharacterIndexEntry[];
  takenIds: ReadonlySet<number>;
  otherPartyIds: OtherParties;
  fullySupported: ReadonlySet<number> | null;
  /** 置くスロットのクリックを待っているニケ */
  pendingId: number | null;
  /** 読み込んだ育成状況（各ニケの限界突破・コア強化を出す。無ければ出さない） */
  roster: BuildSnapshot | null;
  /** スペック固定（各ニケの限界突破・コア強化は、計算に使う固定の値を出す） */
  fixedSpec: boolean;
  /** 一覧の並び（名前順・戦闘力順。設定のメニューの「一覧の並び」と同じもの） */
  listOrder: ListOrderControls;
  /** 立ち絵の形（四角・縦長）と、切り替え */
  shape: TrayShape;
  onToggleShape: () => void;
  onSelectCharacter: (resourceId: number) => void;
};

/** 1 種類のバッジを並べた絞り込み（同じ種類でも複数選べる。押したときの切り替えは toggleBadgeFilter） */
function BadgeFilter({
  kind,
  values,
  onToggle,
}: {
  kind: BadgeKind;
  values: readonly string[] | undefined;
  onToggle: (value: string) => void;
}) {
  return (
    <div className="char-tray-badge-filter" role="group" aria-label={`${kind.name}で絞り込み`}>
      {filterButtonValues(kind).map((v) => {
        const { name, label } = kind.badges[v]!;
        return (
          <button
            key={v}
            type="button"
            className="char-tray-badge-button"
            aria-pressed={values?.includes(v) ?? false}
            onClick={() => onToggle(v)}
          >
            <BadgeIcon className="char-badge" name={name} label={label} />
          </button>
        );
      })}
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
  shape,
  onToggleShape,
  onSelectCharacter,
}: Props) {
  const [filters, setFilters] = useState<BadgeFilters>({});

  // スロットのキャラをトレイへ戻すと、そのスロットを空にする（ModernView の handleDragEnd）
  const { isOver, active, setNodeRef } = useDroppable({
    id: 'tray-drop',
    data: { type: 'tray' } satisfies OverDragData,
  });
  const returning = isOver && activeDragData(active?.data.current)?.type === 'slot-character';

  // 並びは受け取った一覧の順（App が名前順か戦闘力順に並べる。listOrder.ts）
  const filteredCharacters = useMemo(
    () => index.filter((char) => matchesBadgeFilters(char, filters)),
    [index, filters],
  );

  return (
    <section
      ref={setNodeRef}
      className={`char-tray-panel ${returning ? 'char-tray-returning' : ''}`}
      aria-label="ニケ一覧パレット"
    >
      <div className="char-tray-header">
        <div className="char-tray-filters">
          <div className="char-tray-filter-group">
            {BADGE_KINDS.map((kind) => (
              <BadgeFilter
                key={kind.key}
                kind={kind}
                values={filters[kind.key]}
                onToggle={(value) => setFilters((f) => toggleBadgeFilter(f, kind.key, value))}
              />
            ))}
            {/* 選んだ絞り込みを全部外す（何も選んでいないときは押せない） */}
            <button
              type="button"
              className="char-tray-action-button char-tray-filter-clear"
              aria-disabled={Object.keys(filters).length === 0}
              onClick={() => setFilters((f) => (Object.keys(f).length === 0 ? f : {}))}
            >
              クリア
            </button>
          </div>
        </div>
        {/* 並べ替え（名前順・戦闘力順）と、フィルター・立ち絵の縦長と四角の切り替えのボタン（フィルターは未実装の置き場所で、押しても
            何も起きない。disabled にすると、アーティファクトのコメントでボタンを選べない（マウスの操作を受けない）ので aria-disabled にする） */}
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
          <button type="button" className="char-tray-action-button" aria-disabled="true">
            フィルター<span className="char-tray-unimplemented">未実装</span>
          </button>
          {/* 立ち絵の縦長・四角の切り替え。いまの形を強く出す */}
          <button
            type="button"
            className="char-tray-action-button char-tray-shape-button"
            aria-pressed={shape === 'tall'}
            aria-label={`立ち絵の形: ${TRAY_SHAPE_LABEL[shape]}（押すと切り替える）`}
            onClick={onToggleShape}
          >
            <span className={shape === 'tall' ? 'char-tray-shape-current' : ''}>{TRAY_SHAPE_LABEL.tall}</span>
            {' / '}
            <span className={shape === 'square' ? 'char-tray-shape-current' : ''}>{TRAY_SHAPE_LABEL.square}</span>
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
                otherParties={otherPartyIds.get(char.resourceId) ?? NO_PARTIES}
                isUnsupported={isUnsupported}
                isPending={pendingId === char.resourceId}
                growthMarks={trayGrowthMarks(char, roster, fixedSpec)}
                // コレクションのバッジは縦長の絵にだけ出す
                collectionBadge={shape === 'tall' ? trayCollectionBadge(char, roster, fixedSpec) : null}
                shape={shape}
                onClick={() => onSelectCharacter(char.resourceId)}
              />
            );
          })
        )}
      </div>
    </section>
  );
}
