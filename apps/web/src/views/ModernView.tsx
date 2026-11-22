import { DndContext, pointerWithin } from '@dnd-kit/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DamageTotalPanel } from '../components/DamageTotalPanel.tsx';
import { ErrorBoundary } from '../components/ErrorBoundary.tsx';
import { NotesSummary } from '../components/NotesSummary.tsx';
import { TeamSettingsForm } from '../components/TeamSettingsForm.tsx';
import type { ViewProps } from './ViewProps.ts';
import { CharacterTray } from '../components/modern/CharacterTray.tsx';
import { preloadCharacterImages } from '../components/modern/CharacterVisual.tsx';
import { useSlotFit } from '../components/modern/useSlotFit.ts';
import { ModernSlotCard } from '../components/modern/ModernSlotCard.tsx';
import { PartyPreviewRow, PartyRowLabel } from '../components/modern/PartyPreviewRow.tsx';
import { SlotBuildModal } from '../components/modern/SlotBuildModal.tsx';
import { SlotDragOverlay } from '../components/modern/SlotDragOverlay.tsx';
import { slotCollectionBadge, slotGrowthEdited, slotGrowthMarks } from '../components/modern/slotBadges.ts';
import { useSlotDrag } from '../components/modern/useSlotDrag.ts';
import { useSlotPlacement } from '../components/modern/useSlotPlacement.ts';
import { commonGrowthOf, rosterGrowthOf } from '../roster.ts';
import { useTrayShape } from '../trayShape.ts';
import { favoriteMarksOf, FavoritesContext, useFavorites } from '../favorites.ts';
import { usePartySwitchAnimation } from '../components/modern/usePartySwitch.ts';

export function ModernView({
  team,
  dispatch,
  index,
  characterCache,
  masters,
  mastersError,
  calc,
  shown,
  parties,
  otherPartyIds,
  selectParty,
  placeInParty,
  clearPartySlot,
  exchangeSlots,
  swapPartyContents,
  totals,
  totalsPending,
  summarySlots,
  roster,
  listOrder,
}: ViewProps) {
  // キャラクターインデックスを ID で引けるマップを作成
  const indexMap = useMemo(() => new Map(index.map((c) => [c.resourceId, c])), [index]);

  // ニケ一覧の立ち絵の形（四角・縦長）。ブラウザに覚える
  const [trayShape, toggleTrayShape] = useTrayShape();
  const [favorites, toggleFavorite] = useFavorites();

  // 編成の番号を押して切り替えたとき、立ち絵が四角と縦長で入れ替わり、行と番号が動くアニメーションを付ける
  const switchParty = usePartySwitchAnimation(parties.active, selectParty);

  // 枠が埋まっているときに一覧でクリックしたニケ。次にクリックしたスロットに置く（null なら待っていない）
  const [pendingId, setPendingId] = useState<number | null>(null);

  // 育成モーダルを開いているスロット（null なら閉じた状態）
  const [editingSlotIndex, setEditingSlotIndex] = useState<number | null>(null);

  // 待っている間に、スロットのほか（一覧のニケ・ボタン・アイコン・プルダウンメニュー・入力欄・何もないところ）をクリックしたら、
  // 待つのをやめるだけにする（クリックした部品は反応させない。先に document で受けて止める。プルダウンメニューが開く・入力欄に
  // フォーカスが移るのは押した時（mousedown）なので、それも止める）。スロットのクリックは置く（handlePlacePending）
  useEffect(() => {
    if (pendingId === null) return;
    // 待ち始めたクリック（一覧のニケ）は、document の capture の段を過ぎてから付けるので、ここには来ない
    const blockOutsideSlots = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('.modern-slot-card')) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.type === 'click') setPendingId(null);
    };
    document.addEventListener('mousedown', blockOutsideSlots, true);
    document.addEventListener('click', blockOutsideSlots, true);
    return () => {
      document.removeEventListener('mousedown', blockOutsideSlots, true);
      document.removeEventListener('click', blockOutsideSlots, true);
    };
  }, [pendingId]);

  // スロット 5 枚を画面の幅に収める（足りなければ立ち絵を縮める）
  const slotsGridRef = useRef<HTMLElement>(null);
  useSlotFit(slotsGridRef, team.slots.length, parties.active);

  // 置く・外す（絵を飛ばす）と、ドラッグ
  const placement = useSlotPlacement(team, dispatch);
  const { clearSlot, placeFromTray } = placement;
  // ドラッグを始めたら、一覧のクリックで待っているニケをやめる
  const drag = useSlotDrag({
    team,
    parties,
    dispatch,
    calc,
    roster,
    placement,
    // 選んでいない編成の行のスロットに落としたら、一覧のニケはそこへ置き、編成の行のニケはそこへ移す（いたニケと入れ替える）。
    // 選んでいない編成の行のニケは、一覧へ戻せる。どれも選んでいる編成は変えない（オーナーの指示）。
    // 一覧で持ち上げられるのは、どの編成にもいないニケだけ（CharacterTrayItem）
    placeInParty,
    clearPartySlot,
    exchangeSlots,
    // 編成の番号を別の番号に落としたら、2 つの編成の中身を入れ替える（選んでいる編成の番号は変えない）
    swapPartyContents,
    onDragStart: () => setPendingId(null),
  });

  // 一覧でニケをクリックしたとき: 空き枠があれば最も左の空き枠に置く。なければ、次にクリックしたスロットに置くまで待つ。
  // 待っている間（ほかのニケが暗い間）は、一覧のどのニケをクリックしても待つのをやめるだけ。ほかの編成で使っているニケは何もしない
  const handleSelectCharacter = (resourceId: number) => {
    // ほかの編成で使っているニケは選べない（App の dispatch も止める）
    if (otherPartyIds.has(resourceId)) return;
    // いまの編成のスロットにいるニケをクリックしたら、そのスロットから外す
    const takenIndex = team.slots.findIndex((s) => s.resourceId === resourceId);
    if (takenIndex !== -1) {
      clearSlot(takenIndex);
      return;
    }
    const emptyIndex = team.slots.findIndex((s) => s.resourceId === null);
    if (emptyIndex === -1) {
      setPendingId(resourceId);
      return;
    }
    placeFromTray(resourceId, emptyIndex);
  };

  // 待っているニケを、クリックしたスロットに置く（いたニケは外れて一覧に戻る）
  const handlePlacePending = (index: number) => {
    if (pendingId === null) return;
    placeFromTray(pendingId, index);
    setPendingId(null);
  };

  // 全スロットで配置済みのキャラ ID セット（他スロット配置中判定用）
  const allTakenIds = useMemo(
    () => new Set(team.slots.map((s) => s.resourceId).filter((id): id is number => id !== null)),
    [team.slots],
  );

  // すべての編成のニケの縦長と四角の絵を、先に読んでおく（番号の入れ替えで行が描き直されても、絵が空にならない）
  useEffect(() => {
    preloadCharacterImages([...allTakenIds, ...otherPartyIds.keys()]);
  }, [allTakenIds, otherPartyIds]);

  const editingCalcSlot = editingSlotIndex !== null ? calc.slots[editingSlotIndex] : null;
  const editingResourceId = editingSlotIndex !== null ? team.slots[editingSlotIndex]!.resourceId : null;

  return (
    // お気に入り（育成・設定の窓で付け、ニケ一覧の絞り込みに使う。立ち絵には出さない）
    <FavoritesContext value={favorites}>
      <DndContext
        sensors={drag.sensors}
        // 落とす先は、カーソル（指）の下の受け口で決める（既定は持ち上げた絵の外枠＝カード 1 枚分との重なりで、隣に少し掛かっただけで入れ替わる）
        collisionDetection={pointerWithin}
        onDragStart={drag.handleDragStart}
        // ドラッグ中の画面端の自動スクロールは使わない（画面は、ホイールやタッチのスクロールで動かす）
        autoScroll={false}
        onDragEnd={drag.handleDragEnd}
        onDragCancel={drag.handleDragCancel}
        // ドロップの後にドラッグ元へフォーカスを戻さない（戻すと、その要素まで一覧がスクロールされることがある）
        accessibility={{ restoreFocus: false }}
      >
        <div className="modern-view-container">
          {/* 左に敵情報・共通育成・合計ダメージの枠を縦に並べ、右に編成のスロットを置く（オーナーのコメント）。狭い画面では上下に並べる（styles.css の .modern-top-row） */}
          <div className="modern-top-row">
            {/* 敵情報・共通育成・合計ダメージ（縦に 1 列。styles.css の .modern-summary-row） */}
            <div className="modern-summary-row">
              <TeamSettingsForm
                element={team.enemy.element}
                fixedSpec={team.fixedSpec}
                consoleInput={team.console}
                synchroLevel={team.synchroLevel}
                durationSeconds={team.durationSeconds}
                rangeJump={team.rangeJump}
                rosterCommon={roster && commonGrowthOf(roster)}
                revertIcon
                dispatch={dispatch}
              />

              <DamageTotalPanel title="合計ダメージ" value={totals.total} computing={totalsPending} />
            </div>
            {/* 5 つの編成のスロットを 1 行ずつ並べる（オーナーの指示）。行の左に編成の番号。選んでいる編成の行だけ操作でき、
              ほかの行は押すとその編成を選ぶ。ドラッグで、一覧のニケを置き、選んでいる編成のニケを移せる（PartyPreviewRow） */}
            <div className="modern-slots-area">
              {parties.parties.map((party, p) => (
                <div key={p} className={`modern-party-row ${p === parties.active ? 'modern-party-row-active' : ''}`}>
                  <PartyRowLabel partyIndex={p} active={p === parties.active} onSelect={() => switchParty(p)} />
                  {p === parties.active ? (
                    <section ref={slotsGridRef} className="modern-slots-grid" aria-label="編成スロット一覧">
                      {team.slots.map((slot, i) => {
                        const characterEntry = slot.resourceId !== null ? indexMap.get(slot.resourceId) : undefined;

                        return (
                          <ModernSlotCard
                            key={i}
                            slotIndex={i}
                            characterEntry={characterEntry}
                            error={slot.resourceId === null ? undefined : characterCache.errors.get(slot.resourceId)}
                            growthMarks={slotGrowthMarks(calc, team, roster, i)}
                            collectionBadge={slotCollectionBadge(calc, i)}
                            growthEdited={slotGrowthEdited(team, roster, i)}
                            controlled={team.controlledSlot === i}
                            onPlacePending={pendingId !== null ? () => handlePlacePending(i) : undefined}
                            onOpenBuildModal={() => setEditingSlotIndex(i)}
                            onClear={() => clearSlot(i)}
                          />
                        );
                      })}
                    </section>
                  ) : (
                    <PartyPreviewRow
                      partyIndex={p}
                      party={party}
                      indexMap={indexMap}
                      roster={roster}
                      fixedSpec={team.fixedSpec}
                      onSelect={() => switchParty(p)}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          <CharacterTray
            index={index}
            takenIds={allTakenIds}
            otherPartyIds={otherPartyIds}
            activeParty={parties.active + 1}
            pendingId={pendingId}
            roster={roster}
            fixedSpec={team.fixedSpec}
            listOrder={listOrder}
            shape={trayShape}
            onToggleShape={toggleTrayShape}
            onSelectCharacter={handleSelectCharacter}
          />

          {editingSlotIndex !== null && editingResourceId !== null && editingCalcSlot && (
            <SlotBuildModal
              slotIndex={editingSlotIndex}
              slot={team.slots[editingSlotIndex]!}
              character={editingCalcSlot.character}
              fixedSpec={team.fixedSpec}
              shown={editingCalcSlot}
              masters={masters}
              mastersError={mastersError}
              usesHpRatio={editingCalcSlot.usesHpRatio}
              favoriteMarks={favoriteMarksOf(favorites, editingResourceId)}
              onToggleFavorite={(mark) => toggleFavorite(editingResourceId, mark)}
              rosterGrowth={rosterGrowthOf(roster, editingResourceId)}
              dispatch={dispatch}
              onClose={() => setEditingSlotIndex(null)}
            />
          )}

          <ErrorBoundary
            resetKeys={[shown]}
            fallback={(e) => <p className="error">計算の結果を表示できませんでした: {e.message}</p>}
          >
            {shown?.computed.ok === false && <p className="error">{shown.computed.error}</p>}
            <NotesSummary
              slots={summarySlots}
              enemyNotes={shown?.computed.ok ? shown.computed.result.enemyNotes : []}
            />
          </ErrorBoundary>

          <SlotDragOverlay overlay={drag.overlay} trayShape={trayShape} />
        </div>
      </DndContext>
    </FavoritesContext>
  );
}
