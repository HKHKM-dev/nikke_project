import { useDroppable } from '@dnd-kit/core';
import type { BuildSnapshot, CharacterIndexEntry } from '@nikke/core';
import { memo, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import {
  matchesBadgeFilters,
  trayCollectionBadge,
  type BadgeFilters as BadgeFilterValues,
  TREASURE_FILTER_BADGE,
} from './badges.ts';
import { BadgeFilters } from './BadgeFilter.tsx';
import { BadgeIcon } from './BadgeIcon.tsx';
import { CharacterTrayItem } from './CharacterTrayItem.tsx';
import { activeDragData, type OverDragData } from './dropIntent.ts';
import { trayGrowthMarks } from './GrowthMarks.tsx';
import {
  LIST_DIRECTION_LABEL,
  LIST_DIRECTION_MARK,
  LIST_ORDERS,
  LIST_ORDER_LABEL,
  listOrderLabel,
  OVERLOAD_WITHOUT_ROSTER_HINT,
} from '../../listOrder.ts';
import type { ListOrderControls } from '../../useListOrder.ts';
import { TRAY_SHAPE_LABEL, type TrayShape } from '../../trayShape.ts';
import type { OtherParties } from '../../parties.ts';
import { NO_PARTIES } from './PartyNumberBadges.tsx';
import { Popover } from '../Popover.tsx';
import returnIcon from '../../assets/badges/ui_return.svg';
import { maskIconStyle } from '../maskIcon.ts';

type Props = {
  index: readonly CharacterIndexEntry[];
  takenIds: ReadonlySet<number>;
  otherPartyIds: OtherParties;
  /** いまの編成の番号（1 から。いまの編成にいるニケに P○ のバッジを出す） */
  activeParty: number;
  /** 未対応の印の知らせ（useSkillDefinitions の unsupportedNoteOf。完全対応なら null） */
  unsupportedNote: (resourceId: number) => string | null;
  /** 置くスロットのクリックを待っているニケ */
  pendingId: number | null;
  /** 読み込んだ育成状況（各ニケの限界突破・コア強化を出す。無ければ出さない） */
  roster: BuildSnapshot | null;
  /** スペック固定（各ニケの限界突破・コア強化は、計算に使う固定の値を出す） */
  fixedSpec: boolean;
  /** 一覧の並び（名前順・戦闘力順。クラシックのスロットの上の「並べ替え」と同じもの） */
  listOrder: ListOrderControls;
  /** 立ち絵の形（四角・縦長）と、切り替え */
  shape: TrayShape;
  onToggleShape: () => void;
  onSelectCharacter: (resourceId: number) => void;
};

export function CharacterTray({
  index,
  takenIds,
  otherPartyIds,
  activeParty,
  unsupportedNote,
  pendingId,
  roster,
  fixedSpec,
  listOrder,
  shape,
  onToggleShape,
  onSelectCharacter,
}: Props) {
  const [filters, setFilters] = useState<BadgeFilterValues>({});
  /** 宝物のあるニケだけにする（バッジの絞り込みと AND） */
  const [treasureOnly, setTreasureOnly] = useState(false);

  // スロットのキャラをトレイへ戻すと、そのスロットを空にする（ModernView の handleDragEnd）
  const { isOver, active, setNodeRef } = useDroppable({
    id: 'tray-drop',
    data: { type: 'tray' } satisfies OverDragData,
  });
  const returning = isOver && activeDragData(active?.data.current)?.type === 'slot-character';

  // 並びは受け取った一覧の順（App が名前順か戦闘力順に並べる。listOrder.ts）
  const filteredCharacters = useMemo(
    () => index.filter((char) => (!treasureOnly || char.hasTreasure) && matchesBadgeFilters(char, filters)),
    [index, filters, treasureOnly],
  );

  return (
    <section
      ref={setNodeRef}
      className={`char-tray-panel ${returning ? 'char-tray-returning' : ''}`}
      aria-label="ニケ一覧パレット"
    >
      <div className="char-tray-header">
        <div className="char-tray-filters">
          <TrayFilters
            filters={filters}
            onFiltersChange={setFilters}
            treasureOnly={treasureOnly}
            onTreasureOnlyChange={setTreasureOnly}
          />
        </div>
        {/* 並べ替え（ボタンで開くポップアップで並びを選ぶ）と、絞り込み・立ち絵の縦長と四角の切り替えのボタン（絞り込みは未実装の置き場所で、押しても
            何も起きない。disabled にすると、アーティファクトのコメントでボタンを選べない（マウスの操作を受けない）ので aria-disabled にする） */}
        <div className="char-tray-actions">
          <TraySortMenu listOrder={listOrder} />
          <button type="button" className="char-tray-action-button" aria-disabled="true">
            絞り込み<span className="char-tray-unimplemented">未実装</span>
          </button>
          <TrayShapeToggle shape={shape} onToggle={onToggleShape} />
        </div>
      </div>

      <TrayList
        characters={filteredCharacters}
        takenIds={takenIds}
        otherPartyIds={otherPartyIds}
        activeParty={activeParty}
        unsupportedNote={unsupportedNote}
        pendingId={pendingId}
        roster={roster}
        fixedSpec={fixedSpec}
        shape={shape}
        onSelectCharacter={onSelectCharacter}
      />
    </section>
  );
}

type TrayListProps = Pick<
  Props,
  | 'takenIds'
  | 'otherPartyIds'
  | 'activeParty'
  | 'unsupportedNote'
  | 'pendingId'
  | 'roster'
  | 'fixedSpec'
  | 'shape'
  | 'onSelectCharacter'
> & { characters: readonly CharacterIndexEntry[] };

/**
 * 一覧の項目の並び。持ち上げている間は、ドラッグの状態（useDroppable）が動くたびに CharacterTray が描き直されるので、
 * memo で項目の並びまで描き直さないようにする
 */
const TrayList = memo(function TrayList({
  characters,
  takenIds,
  otherPartyIds,
  activeParty,
  unsupportedNote,
  pendingId,
  roster,
  fixedSpec,
  shape,
  onSelectCharacter,
}: TrayListProps) {
  // いまの編成にいるニケの P○ のバッジ（項目の memo のため、編成が変わるまで同じ配列）
  const activeParties = useMemo(() => [activeParty], [activeParty]);
  return (
    <div className={`char-tray-list ${pendingId !== null ? 'char-tray-list-pending' : ''}`}>
      {characters.length === 0 ? (
        <p className="char-tray-empty">該当するニケが見つかりませんでした。</p>
      ) : (
        characters.map((char) => {
          const isTaken = takenIds.has(char.resourceId);
          const otherParties = otherPartyIds.get(char.resourceId) ?? NO_PARTIES;
          return (
            <CharacterTrayItem
              key={char.resourceId}
              character={char}
              isTaken={isTaken}
              otherParties={otherParties}
              partyNumbers={isTaken ? activeParties : otherParties}
              unsupportedNote={unsupportedNote(char.resourceId)}
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
  );
});

/** バッジ・宝物の絞り込みと、全部を外すボタン */
function TrayFilters({
  filters,
  onFiltersChange,
  treasureOnly,
  onTreasureOnlyChange,
}: {
  filters: BadgeFilterValues;
  onFiltersChange: (filters: BadgeFilterValues) => void;
  /** 宝物のあるニケだけにする（バッジの絞り込みと AND） */
  treasureOnly: boolean;
  onTreasureOnlyChange: Dispatch<SetStateAction<boolean>>;
}) {
  const filtering = treasureOnly || Object.keys(filters).length > 0;
  return (
    <div className="char-tray-filter-group">
      <BadgeFilters filters={filters} onChange={onFiltersChange} />
      <div className="char-tray-badge-filter" role="group" aria-label="宝物で絞り込み">
        <button
          type="button"
          className="char-tray-badge-button"
          aria-pressed={treasureOnly}
          onClick={() => onTreasureOnlyChange((t) => !t)}
        >
          <BadgeIcon className="char-badge" name={TREASURE_FILTER_BADGE} label="宝物のあるニケ" />
        </button>
      </div>
      {/* 選んだ絞り込みを全部外す（何も選んでいないときは押せない）。文字の代わりにバッジの絵 ui_return.svg（.mask-icon） */}
      <button
        type="button"
        className="char-tray-action-button char-tray-filter-clear"
        aria-disabled={!filtering}
        aria-label="クリア"
        title="クリア"
        onClick={() => {
          if (!filtering) return;
          onFiltersChange({});
          onTreasureOnlyChange(false);
        }}
      >
        <span className="mask-icon char-tray-filter-clear-icon" style={maskIconStyle(returnIcon)} />
      </button>
    </div>
  );
}

/** 並べ替えのポップアップと、並びの知らせ */
function TraySortMenu({ listOrder }: { listOrder: ListOrderControls }) {
  return (
    <>
      {/* 並びの種類を 1 つずつボタンにする。押すとその並び（既定の向き）にし、いまの並びをもう一度押すと昇順・降順を入れ替える
          （続けて押せるように、押しても閉じない） */}
      <Popover
        button={
          // 全部の並びの名前を同じ所に重ね、いまの並びだけを見せる（ボタンの幅を一番長い名前に合わせ、切り替えても変えない）
          <span className="char-tray-sort-label">
            {LIST_ORDERS.map((o) => (
              <span key={o} className={o === listOrder.order ? 'char-tray-sort-current' : undefined}>
                {LIST_ORDER_LABEL[o]} {LIST_DIRECTION_MARK[listOrder.direction]}
              </span>
            ))}
          </span>
        }
        buttonClassName="char-tray-action-button"
        label={listOrderLabel(listOrder.order, listOrder.direction)}
        align="left"
      >
        <div className="char-tray-sort-options" role="group" aria-label="並べ替え">
          {LIST_ORDERS.map((o) => {
            const current = listOrder.order === o;
            return (
              <button
                key={o}
                type="button"
                className="char-tray-action-button char-tray-sort-option"
                aria-pressed={current}
                title={current ? `${LIST_DIRECTION_LABEL[listOrder.direction]}（押すと入れ替える）` : undefined}
                onClick={() => (current ? listOrder.toggleDirection() : listOrder.select(o))}
              >
                {LIST_ORDER_LABEL[o]}
                <span className="char-tray-sort-mark" aria-hidden="true">
                  {LIST_DIRECTION_MARK[listOrder.direction]}
                </span>
              </button>
            );
          })}
        </div>
      </Popover>
      {/* クラシックの「一覧の並び」の欄と同じ知らせ */}
      {listOrder.order === 'combatPower' && listOrder.tableError !== null && (
        <span className="hint">戦闘力の表を読めない: {listOrder.tableError}</span>
      )}
      {listOrder.order === 'combatPower' && listOrder.failedCount > 0 && (
        <span className="hint">戦闘力を出せない {listOrder.failedCount} 体は後ろに名前順で並べる</span>
      )}
      {listOrder.overloadWithoutRoster && <span className="hint">{OVERLOAD_WITHOUT_ROSTER_HINT}</span>}
    </>
  );
}

/** 立ち絵の縦長・四角の切り替え。いまの形を強く出す */
function TrayShapeToggle({ shape, onToggle }: { shape: TrayShape; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="char-tray-action-button char-tray-shape-button"
      aria-pressed={shape === 'tall'}
      aria-label={`立ち絵の形: ${TRAY_SHAPE_LABEL[shape]}（押すと切り替える）`}
      onClick={onToggle}
    >
      <span className={shape === 'tall' ? 'char-tray-shape-current' : ''}>{TRAY_SHAPE_LABEL.tall}</span>
      {' / '}
      <span className={shape === 'square' ? 'char-tray-shape-current' : ''}>{TRAY_SHAPE_LABEL.square}</span>
    </button>
  );
}
