import { DndContext, pointerWithin } from '@dnd-kit/core';
import { useMemo, useRef, useState } from 'react';
import { DamageTotalPanel } from '../components/DamageTotalPanel.tsx';
import { ErrorBoundary } from '../components/ErrorBoundary.tsx';
import { NotesSummary } from '../components/NotesSummary.tsx';
import { PartyTabs } from '../components/PartyTabs.tsx';
import { TeamSettingsForm } from '../components/TeamSettingsForm.tsx';
import type { ViewProps } from './ViewProps.ts';
import { CharacterTray } from '../components/modern/CharacterTray.tsx';
import { useSlotFit } from '../components/modern/useSlotFit.ts';
import { ModernSlotCard } from '../components/modern/ModernSlotCard.tsx';
import { SlotBuildModal } from '../components/modern/SlotBuildModal.tsx';
import { SlotDragOverlay } from '../components/modern/SlotDragOverlay.tsx';
import { slotCollectionBadge, slotGrowthMarks } from '../components/modern/slotBadges.ts';
import { useSlotDrag } from '../components/modern/useSlotDrag.ts';
import { useSlotPlacement } from '../components/modern/useSlotPlacement.ts';
import { commonGrowthOf, rosterGrowthOf } from '../roster.ts';
import { useTrayShape } from '../trayShape.ts';

export function ModernView({
  team,
  dispatch,
  index,
  characterCache,
  unsupportedNote,
  masters,
  mastersError,
  calc,
  shown,
  slotResults,
  parties,
  otherPartyIds,
  selectParty,
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

  // 枠が埋まっているときに一覧でクリックしたニケ。次にクリックしたスロットに置く（null なら待っていない）
  const [pendingId, setPendingId] = useState<number | null>(null);

  // 育成モーダルを開いているスロット（null なら閉じた状態）
  const [editingSlotIndex, setEditingSlotIndex] = useState<number | null>(null);

  // スロット 5 枚を画面の幅に収める（足りなければ立ち絵を縮める）
  const slotsGridRef = useRef<HTMLElement>(null);
  useSlotFit(slotsGridRef, team.slots.length);

  // 置く・外す（絵を飛ばす）と、ドラッグ
  const placement = useSlotPlacement(team, dispatch);
  const { clearSlot, placeFromTray } = placement;
  // ドラッグを始めたら、一覧のクリックで待っているニケをやめる
  const drag = useSlotDrag({ team, dispatch, calc, roster, placement, onDragStart: () => setPendingId(null) });

  // 一覧でニケをクリックしたとき: 空き枠があれば最も左の空き枠に置く。なければ、次にクリックしたスロットに置くまで待つ
  // （同じニケをもう一度クリックすると待つのをやめる。ほかの編成で使っているニケは何もしない）
  const handleSelectCharacter = (resourceId: number) => {
    // ほかの編成で使っているニケは選べない（App の dispatch も止める）
    if (otherPartyIds.has(resourceId)) return;
    // いまの編成のスロットにいるニケをクリックしたら、そのスロットから外す
    const takenIndex = team.slots.findIndex((s) => s.resourceId === resourceId);
    if (takenIndex !== -1) {
      clearSlot(takenIndex);
      setPendingId(null);
      return;
    }
    const emptyIndex = team.slots.findIndex((s) => s.resourceId === null);
    if (emptyIndex === -1) {
      setPendingId((id) => (id === resourceId ? null : resourceId));
      return;
    }
    placeFromTray(resourceId, emptyIndex);
    setPendingId(null);
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

  const editingCalcSlot = editingSlotIndex !== null ? calc.slots[editingSlotIndex] : null;

  return (
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
        <TeamSettingsForm
          element={team.enemy.element}
          fixedSpec={team.fixedSpec}
          consoleInput={team.console}
          synchroLevel={team.synchroLevel}
          durationSeconds={team.durationSeconds}
          rangeJump={team.rangeJump}
          rosterCommon={roster && commonGrowthOf(roster)}
          dispatch={dispatch}
        />

        <DamageTotalPanel title="合計ダメージ" value={totals.total} computing={totalsPending} />
        <PartyTabs active={parties.active} onSelect={selectParty} totals={totals.parties} />

        <section ref={slotsGridRef} className="modern-slots-grid" aria-label="編成スロット一覧">
          {team.slots.map((slot, i) => {
            const { character } = calc.slots[i]!;
            const characterEntry = slot.resourceId !== null ? indexMap.get(slot.resourceId) : undefined;

            return (
              <ModernSlotCard
                key={i}
                slotIndex={i}
                character={character}
                characterEntry={characterEntry}
                unsupportedNote={slot.resourceId === null ? null : unsupportedNote(slot.resourceId)}
                error={slot.resourceId === null ? undefined : characterCache.errors.get(slot.resourceId)}
                slotResult={slotResults[i] ?? null}
                growthMarks={slotGrowthMarks(calc, team, roster, i)}
                collectionBadge={slotCollectionBadge(calc, i)}
                controlled={team.controlledSlot === i}
                onPlacePending={pendingId !== null ? () => handlePlacePending(i) : undefined}
                onOpenBuildModal={() => setEditingSlotIndex(i)}
                onClear={() => clearSlot(i)}
                partyTotalDamage={totals.parties[parties.active]?.total ?? null}
              />
            );
          })}
        </section>

        <CharacterTray
          index={index}
          takenIds={allTakenIds}
          otherPartyIds={otherPartyIds}
          unsupportedNote={unsupportedNote}
          pendingId={pendingId}
          roster={roster}
          fixedSpec={team.fixedSpec}
          listOrder={listOrder}
          shape={trayShape}
          onToggleShape={toggleTrayShape}
          onSelectCharacter={handleSelectCharacter}
        />

        {editingSlotIndex !== null && editingCalcSlot && (
          <SlotBuildModal
            slotIndex={editingSlotIndex}
            slot={team.slots[editingSlotIndex]!}
            character={editingCalcSlot.character}
            fixedSpec={team.fixedSpec}
            shown={editingCalcSlot}
            masters={masters}
            mastersError={mastersError}
            usesHpRatio={editingCalcSlot.usesHpRatio}
            rosterGrowth={rosterGrowthOf(roster, team.slots[editingSlotIndex]!.resourceId)}
            dispatch={dispatch}
            onClose={() => setEditingSlotIndex(null)}
          />
        )}

        <ErrorBoundary
          resetKeys={[shown]}
          fallback={(e) => <p className="error">計算の結果を表示できませんでした: {e.message}</p>}
        >
          {shown?.computed.ok === false && <p className="error">{shown.computed.error}</p>}
          <NotesSummary slots={summarySlots} enemyNotes={shown?.computed.ok ? shown.computed.result.enemyNotes : []} />
        </ErrorBoundary>

        <SlotDragOverlay overlay={drag.overlay} trayShape={trayShape} />
      </div>
    </DndContext>
  );
}
