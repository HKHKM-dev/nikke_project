import type { UnsupportedNote } from '../../useSkillDefinitions.ts';
import { useDroppable } from '@dnd-kit/core';
import type { BuildSnapshot, CharacterIndexEntry } from '@nikke/core';
import { memo, useContext, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import {
  RETURN_BADGE,
  TRAY_SHAPE_ARROW_BADGE,
  TRAY_SHAPE_BADGES,
  trayCollectionBadge,
  type BadgeFilters as BadgeFilterValues,
  TREASURE_FILTER_BADGE,
} from './badges.ts';
import { BadgeFilters } from './BadgeFilter.tsx';
import { FavoriteButtons } from './FavoriteBadge.tsx';
import { filterByFavorites, FavoritesContext, toggleFavoriteMark, type FavoriteMark } from '../../favorites.ts';
import { BadgeIcon } from './BadgeIcon.tsx';
import { InertButton } from '../InertButton.tsx';
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
import { useCharacterFilter } from '../useCharacterFilter.ts';
import {
  applyTrayFilter,
  burstCooldownValues,
  effectTagsInTable,
  EMPTY_TRAY_FILTER,
  needsFilterTable,
  toggleValue,
  trayFilterActive,
  type TrayFilter,
} from '../../trayFilter.ts';
import { useFilterTable } from '../../useFilterTable.ts';
import {
  FILTER_EFFECTS,
  FILTER_SIDE_LABEL,
  sidesOf,
  SPECIAL_ATTACKS,
  TRAITS,
  type FilterEffect,
  type FilterSide,
  type FilterTable,
} from '@nikke/core';

type Props = {
  index: readonly CharacterIndexEntry[];
  takenIds: ReadonlySet<number>;
  otherPartyIds: OtherParties;
  /** いまの編成の番号（1 から。いまの編成にいるニケに P○ のバッジを出す） */
  activeParty: number;
  /** 未対応の印の知らせ（useSkillDefinitions の unsupportedNoteOf。完全対応なら null） */
  unsupportedNote: (resourceId: number) => UnsupportedNote | null;
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
  // 並びは受け取った一覧の順（App が名前順か戦闘力順に並べる。listOrder.ts）
  const { filters, setFilters, treasureOnly, setTreasureOnly, filtered: badgeFiltered } = useCharacterFilter(index);
  // お気に入りの絞り込み（押したバッジのどれかが付いたニケ。ほかの絞り込みと AND）
  const favorites = useContext(FavoritesContext);
  const [favoriteFilter, setFavoriteFilter] = useState<readonly FavoriteMark[]>([]);
  // 「絞り込み」の窓（文字の検索・バースト CT。trayFilter.ts）。表は窓を初めて開いたときに読む
  const [trayFilter, setTrayFilter] = useState<TrayFilter>(EMPTY_TRAY_FILTER);
  const [tableRequested, setTableRequested] = useState(false);
  const { table: filterTable, error: filterTableError, retry: retryFilterTable } = useFilterTable(tableRequested);
  const filteredCharacters = useMemo(() => {
    return applyTrayFilter(filterByFavorites(badgeFiltered, favorites, favoriteFilter), trayFilter, filterTable);
  }, [badgeFiltered, favoriteFilter, favorites, trayFilter, filterTable]);

  // スロットのキャラをトレイへ戻すと、そのスロットを空にする（ModernView の handleDragEnd）
  const { isOver, active, setNodeRef } = useDroppable({
    id: 'tray-drop',
    data: { type: 'tray' } satisfies OverDragData,
  });
  const returning = isOver && activeDragData(active?.data.current)?.type === 'slot-character';

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
            favoriteFilter={favoriteFilter}
            onFavoriteFilterChange={setFavoriteFilter}
            trayFilterOn={trayFilterActive(trayFilter)}
            onClearTrayFilter={() => setTrayFilter(EMPTY_TRAY_FILTER)}
          />
        </div>
        {/* 並べ替え・絞り込み（ボタンで開くポップアップ）と、立ち絵の縦長と四角の切り替えのボタン */}
        <div className="char-tray-actions">
          <TraySortMenu listOrder={listOrder} />
          <TrayFilterMenu
            filter={trayFilter}
            onChange={setTrayFilter}
            table={filterTable}
            tableError={filterTableError}
            onOpen={() => {
              setTableRequested(true);
              if (filterTableError !== null) retryFilterTable();
            }}
          />
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
              inOtherParty={otherParties.length > 0}
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
  favoriteFilter,
  onFavoriteFilterChange,
  trayFilterOn,
  onClearTrayFilter,
}: {
  filters: BadgeFilterValues;
  onFiltersChange: (filters: BadgeFilterValues) => void;
  /** 宝物のあるニケだけにする（バッジの絞り込みと AND） */
  treasureOnly: boolean;
  onTreasureOnlyChange: Dispatch<SetStateAction<boolean>>;
  /** 押したお気に入りのバッジ（どれかが付いたニケだけにする） */
  favoriteFilter: readonly FavoriteMark[];
  onFavoriteFilterChange: (marks: readonly FavoriteMark[]) => void;
  /** 「絞り込み」の窓で絞っているか（クリアで一緒に外す） */
  trayFilterOn: boolean;
  onClearTrayFilter: () => void;
}) {
  const filtering = trayFilterOn || treasureOnly || favoriteFilter.length > 0 || Object.keys(filters).length > 0;
  return (
    <div className="char-tray-filter-group">
      <BadgeFilters filters={filters} onChange={onFiltersChange} />
      <div className="char-tray-badge-filter" role="group" aria-label="宝もので絞り込み">
        <button
          type="button"
          className="char-tray-badge-button"
          aria-pressed={treasureOnly}
          onClick={() => onTreasureOnlyChange((t) => !t)}
        >
          <BadgeIcon className="char-badge" name={TREASURE_FILTER_BADGE} label="宝ものがあるニケ" />
        </button>
      </div>
      <div className="char-tray-badge-filter" role="group" aria-label="お気に入りで絞り込み">
        <FavoriteButtons
          marks={favoriteFilter}
          onToggle={(mark) => onFavoriteFilterChange(toggleFavoriteMark(favoriteFilter, mark))}
          buttonClassName="char-tray-badge-button"
          colorAll
        />
      </div>
      {/* 選んだ絞り込みを全部外す（何も選んでいないときは押せない）。文字の代わりにバッジ ui_return */}
      <button
        type="button"
        className="char-tray-action-button char-tray-filter-clear"
        aria-disabled={!filtering}
        aria-label="クリア"
        onClick={() => {
          if (!filtering) return;
          onFiltersChange({});
          onTreasureOnlyChange(false);
          onFavoriteFilterChange([]);
          onClearTrayFilter();
        }}
      >
        <BadgeIcon className="char-tray-filter-clear-icon" name={RETURN_BADGE} />
      </button>
    </div>
  );
}

/**
 * 「絞り込み」のポップアップ（plan/design-character-filter.md 4.1・5 節）: 名前・スキルの検索と、バースト CT・特殊攻撃・特性・
 * スキルの効果のボタン。絞っている間はボタンを押している色にする
 */
function TrayFilterMenu({
  filter,
  onChange,
  table,
  tableError,
  onOpen,
}: {
  filter: TrayFilter;
  onChange: Dispatch<SetStateAction<TrayFilter>>;
  table: FilterTable | null;
  tableError: string | null;
  /** ポップアップを開いた（表を読み始める） */
  onOpen: () => void;
}) {
  const active = trayFilterActive(filter);
  const cooldowns = useMemo(() => (table === null ? [] : burstCooldownValues(table)), [table]);
  // 効果の分類ごとに、表にある項目と側だけを出す
  const effectGroups = useMemo(() => (table === null ? [] : effectRows(effectTagsInTable(table))), [table]);
  const tableHint = tableError === null ? '読み込み中…' : `絞り込みの表を読めない: ${tableError}`;
  return (
    <div className="char-tray-filter-menu" onClickCapture={onOpen}>
      <Popover
        button="絞り込み"
        buttonClassName={`char-tray-action-button ${active ? 'char-tray-filter-active' : ''}`}
        label="ニケ一覧の絞り込み"
        align="center"
      >
        <div className="classic-filter-panel char-tray-filter-panel">
          <label className="classic-filter-row">
            <span className="classic-filter-row-name">名前</span>
            <input
              type="search"
              className="char-tray-filter-input"
              value={filter.name}
              placeholder="ラピ・Rapi など"
              onChange={(e) => onChange((f) => ({ ...f, name: e.target.value }))}
            />
          </label>
          <label className="classic-filter-row">
            <span className="classic-filter-row-name">スキル</span>
            <input
              type="search"
              className="char-tray-filter-input"
              value={filter.skill}
              placeholder="スキル名・説明文（空白で区切って AND）"
              onChange={(e) => onChange((f) => ({ ...f, skill: e.target.value }))}
            />
          </label>
          {table === null ? (
            <p className="hint">{tableHint}</p>
          ) : (
            <>
              <FilterButtonRow
                name="バースト CT"
                options={cooldowns.map((v) => ({ key: v, label: `${v} 秒` }))}
                selected={filter.burstCooldowns}
                onToggle={(v) => onChange((f) => ({ ...f, burstCooldowns: toggleValue(f.burstCooldowns, v) }))}
              />
              <FilterButtonRow
                name="特殊攻撃"
                options={SPECIAL_ATTACKS}
                selected={filter.special}
                onToggle={(v) => onChange((f) => ({ ...f, special: toggleValue(f.special, v) }))}
              />
              <FilterButtonRow
                name="特性"
                options={TRAITS}
                selected={filter.traits}
                onToggle={(v) => onChange((f) => ({ ...f, traits: toggleValue(f.traits, v) }))}
              />
              <div className="char-tray-filter-effects" role="group" aria-label="スキルの効果で絞り込み">
                <p className="char-tray-filter-effects-title">
                  スキルの効果<span className="hint">自＝自分・味＝味方・敵＝敵に。効果どうしは AND</span>
                </p>
                {effectGroups.map(({ group, effects }) => (
                  <div key={group} className="classic-filter-row" role="group" aria-label={group}>
                    <span className="classic-filter-row-name">{group}</span>
                    <span className="char-tray-filter-effect-list">
                      {effects.map(({ effect, sides }) => (
                        <span key={effect.key} className="char-tray-filter-effect">
                          <span className="char-tray-filter-effect-name">{effect.label}</span>
                          {sides.map((side) => {
                            const tag = `${effect.key}:${side}`;
                            return (
                              <button
                                key={side}
                                type="button"
                                className="classic-filter-button char-tray-filter-side"
                                aria-pressed={filter.effects.includes(tag)}
                                aria-label={`${effect.label}（${FILTER_SIDE_LABEL[side]}）`}
                                onClick={() => onChange((f) => ({ ...f, effects: toggleValue(f.effects, tag) }))}
                              >
                                {FILTER_SIDE_LABEL[side]}
                              </button>
                            );
                          })}
                        </span>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
          {table === null && tableError === null && needsFilterTable(filter) && (
            <p className="hint">表を読み終えるまで、名前のほかでは絞らない</p>
          )}
          <div className="char-tray-filter-footer">
            <InertButton className="classic-filter-button" enabled={active} onPress={() => onChange(EMPTY_TRAY_FILTER)}>
              すべて外す
            </InertButton>
          </div>
        </div>
      </Popover>
    </div>
  );
}

/** 効果の項目を分類ごとにまとめ、表にある側（自・味・敵）だけを付ける。表に無い項目は出さない */
function effectRows(present: ReadonlySet<string>) {
  const rows: { group: string; effects: { effect: FilterEffect; sides: FilterSide[] }[] }[] = [];
  for (const effect of FILTER_EFFECTS) {
    const sides = sidesOf(effect).filter((side) => present.has(`${effect.key}:${side}`));
    if (sides.length === 0) continue;
    let row = rows.at(-1);
    if (row?.group !== effect.group) rows.push((row = { group: effect.group, effects: [] }));
    row.effects.push({ effect, sides });
  }
  return rows;
}

/** 名前と文字のボタンの 1 行（押したもののどれか） */
function FilterButtonRow<K extends string | number>({
  name,
  options,
  selected,
  onToggle,
}: {
  name: string;
  options: readonly { key: K; label: string }[];
  selected: readonly K[];
  onToggle: (key: K) => void;
}) {
  return (
    <div className="classic-filter-row" role="group" aria-label={`${name}で絞り込み`}>
      <span className="classic-filter-row-name">{name}</span>
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          className="classic-filter-button"
          aria-pressed={selected.includes(o.key)}
          onClick={() => onToggle(o.key)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** 並べ替えのポップアップと、並びの知らせ */
function TraySortMenu({ listOrder }: { listOrder: ListOrderControls }) {
  return (
    <>
      {/* 並びの種類を 1 つずつボタンにする。押すとその並び（既定の向き）にし、いまの並びをもう一度押すと昇順・降順を入れ替える
          （続けて押せるように、押しても閉じない）。昇順・降順の三角のボタンとくっつけて 1 つの枠にし、縦線で仕切る */}
      <div className="char-tray-sort-group">
        <Popover
          button={
            // 全部の並びの名前を同じ所に重ね、いまの並びだけを見せる（ボタンの幅を一番長い名前に合わせ、切り替えても変えない）
            <span className="char-tray-sort-label">
              {LIST_ORDERS.map((o) => (
                <span key={o} className={o === listOrder.order ? 'char-tray-sort-current' : undefined}>
                  {LIST_ORDER_LABEL[o]}
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
        {/* 昇順・降順の三角は別のボタンにし、押すたびに入れ替える */}
        <button
          type="button"
          className="char-tray-action-button char-tray-sort-direction"
          aria-label={`${LIST_DIRECTION_LABEL[listOrder.direction]}（押すと入れ替える）`}
          onClick={listOrder.toggleDirection}
        >
          {LIST_DIRECTION_MARK[listOrder.direction]}
        </button>
      </div>
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

/** 立ち絵の縦長・四角の切り替え。絵はバッジ（縦長 ui_mcu・矢印 ui_arrow・四角 ui_cu）で、いまの形でないほうを薄くする */
function TrayShapeToggle({ shape, onToggle }: { shape: TrayShape; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="char-tray-action-button char-tray-shape-button"
      aria-pressed={shape === 'tall'}
      aria-label={`立ち絵の形: ${TRAY_SHAPE_LABEL[shape]}（押すと切り替える）`}
      onClick={onToggle}
    >
      <BadgeIcon
        className={`char-tray-shape-icon ${shape === 'tall' ? 'char-tray-shape-current' : ''}`}
        name={TRAY_SHAPE_BADGES.tall}
      />
      <BadgeIcon className="char-tray-shape-arrow" name={TRAY_SHAPE_ARROW_BADGE} />
      <BadgeIcon
        className={`char-tray-shape-icon ${shape === 'square' ? 'char-tray-shape-current' : ''}`}
        name={TRAY_SHAPE_BADGES.square}
      />
    </button>
  );
}
