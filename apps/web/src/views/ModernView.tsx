import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import type { CharacterIndexEntry } from '@nikke/core';
import { useMemo, useState } from 'react';
import { DamageTotalPanel } from '../components/DamageTotalPanel.tsx';
import { ErrorBoundary } from '../components/ErrorBoundary.tsx';
import { NotesSummary } from '../components/NotesSummary.tsx';
import { PartyTabs } from '../components/PartyTabs.tsx';
import { TeamSettingsForm } from '../components/TeamSettingsForm.tsx';
import type { ViewProps } from './ViewProps.ts';
import { CharacterTray } from '../components/modern/CharacterTray.tsx';
import { CharacterVisual } from '../components/modern/CharacterVisual.tsx';
import { ModernSlotCard } from '../components/modern/ModernSlotCard.tsx';
import { SlotBuildModal } from '../components/modern/SlotBuildModal.tsx';
import { placeCharacterAction } from '../team.ts';

export function ModernView({
  team,
  dispatch,
  index,
  characterCache,
  fullySupported,
  masters,
  mastersError,
  calc,
  shown,
  slotResults,
  parties,
  selectParty,
  totals,
  totalsPending,
  summarySlots,
}: ViewProps) {
  // キャラクターインデックスを ID で引けるマップを作成
  const indexMap = useMemo(() => new Map(index.map((c) => [c.resourceId, c])), [index]);

  // 現在トレイからキャラを配置する対象のスロット（0〜4）
  const [activeSlotIndex, setActiveSlotIndex] = useState(0);

  // 育成モーダルを開いているスロット（null なら閉じた状態）
  const [editingSlotIndex, setEditingSlotIndex] = useState<number | null>(null);

  // ドラッグ中のキャラクター情報（DragOverlay 用）。スロットから持ち上げたときは、スロットの立ち絵の大きさと、カードの左上からの位置も持つ
  const [draggedCharacter, setDraggedCharacter] = useState<CharacterIndexEntry | null>(null);
  const [draggedPortrait, setDraggedPortrait] = useState<{
    width: number;
    height: number;
    left: number;
    top: number;
  } | null>(null);

  // マウスは 8px 動かして初めてドラッグと判定（通常のクリック操作との共存）。タッチは 250ms の長押しで持ち上げ、
  // それまでに 8px より動いたらスクロールにする（すぐ持ち上げると、トレイの上でページをスクロールできない）
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current;
    if (data?.character) {
      setDraggedCharacter(data.character as CharacterIndexEntry);
    }
    // スロットのカードから持ち上げたら、立ち絵を今の大きさのまま持ち上げる
    const card =
      event.active.data.current?.type === 'slot-character'
        ? (event.activatorEvent.target as Element | null)?.closest('.modern-slot-card')
        : null;
    const portrait = card?.querySelector('.char-visual-portrait');
    if (card && portrait) {
      const c = card.getBoundingClientRect();
      const p = portrait.getBoundingClientRect();
      setDraggedPortrait({ width: p.width, height: p.height, left: p.left - c.left, top: p.top - c.top });
    } else {
      setDraggedPortrait(null);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDraggedCharacter(null);
    setDraggedPortrait(null);
    const { active, over } = event;
    if (!over) return;

    const overData = over.data.current;
    const activeData = active.data.current;
    if (!activeData) return;

    // スロットのキャラをトレイへ戻したら、そのスロットを空にする
    if (overData?.type === 'tray') {
      if (activeData.type === 'slot-character') dispatch({ type: 'clearSlot', index: activeData.slotIndex as number });
      return;
    }
    if (overData?.slotIndex === undefined) return;
    const targetSlotIndex = overData.slotIndex as number;

    if (activeData.type === 'tray-character') {
      // ほかのスロットにいるキャラなら、そこから動かす（placeCharacterAction）
      const char = activeData.character as CharacterIndexEntry;
      const action = placeCharacterAction(team, char.resourceId, targetSlotIndex);
      if (action) dispatch(action);
      setActiveSlotIndex(targetSlotIndex);
    } else if (activeData.type === 'slot-character') {
      const fromSlotIndex = activeData.slotIndex as number;
      if (fromSlotIndex !== targetSlotIndex) {
        dispatch({ type: 'swapSlots', fromIndex: fromSlotIndex, toIndex: targetSlotIndex });
        setActiveSlotIndex(targetSlotIndex);
      }
    }
  };

  const handleDragCancel = () => {
    setDraggedCharacter(null);
    setDraggedPortrait(null);
  };

  // トレイでキャラがクリック選択されたときのハンドラ
  const handleSelectCharacter = (resourceId: number) => {
    const action = placeCharacterAction(team, resourceId, activeSlotIndex);
    if (action) dispatch(action);
    // 次の空きスロットがあれば自動的にアクティブスロットを進める
    const nextEmptyIndex = team.slots.findIndex((s, i) => i > activeSlotIndex && s.resourceId === null);
    if (nextEmptyIndex !== -1) {
      setActiveSlotIndex(nextEmptyIndex);
    }
  };

  // 全スロットで配置済みのキャラ ID セット（他スロット配置中判定用）
  const allTakenIds = useMemo(
    () => new Set(team.slots.map((s) => s.resourceId).filter((id): id is number => id !== null)),
    [team.slots],
  );

  const editingCalcSlot = editingSlotIndex !== null ? calc.slots[editingSlotIndex] : null;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      // ドラッグ中の画面端の自動スクロールは使わない（画面は、ホイールやタッチのスクロールで動かす）
      autoScroll={false}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
      // ドロップの後にドラッグ元へフォーカスを戻さない（戻すと、その要素まで一覧がスクロールされることがある）
      accessibility={{ restoreFocus: false }}
    >
      <div className="modern-view-container">
        <TeamSettingsForm
          element={team.enemy.element}
          defence={team.enemy.defence}
          fixedSpec={team.fixedSpec}
          consoleInput={team.console}
          synchroLevel={team.synchroLevel}
          durationSeconds={team.durationSeconds}
          rangeJump={team.rangeJump}
          dispatch={dispatch}
        />

        <DamageTotalPanel title="合計ダメージ" value={totals.total} computing={totalsPending} />
        <PartyTabs active={parties.active} onSelect={selectParty} totals={totals.parties} />

        <section className="modern-slots-grid" aria-label="編成スロット一覧">
          {team.slots.map((slot, i) => {
            const { character } = calc.slots[i]!;
            const characterEntry = slot.resourceId !== null ? indexMap.get(slot.resourceId) : undefined;
            const isUnsupported =
              slot.resourceId !== null && fullySupported !== null && !fullySupported.has(slot.resourceId);

            return (
              <ModernSlotCard
                key={i}
                slotIndex={i}
                slot={slot}
                character={character}
                characterEntry={characterEntry}
                isUnsupported={isUnsupported}
                error={slot.resourceId === null ? undefined : characterCache.errors.get(slot.resourceId)}
                slotResult={slotResults[i] ?? null}
                focused={team.controlledSlot === i}
                isSelected={activeSlotIndex === i}
                onSelectSlot={() => setActiveSlotIndex(i)}
                onOpenBuildModal={() => setEditingSlotIndex(i)}
                onClear={() => dispatch({ type: 'clearSlot', index: i })}
                partyTotalDamage={totals.parties[parties.active]?.total ?? null}
              />
            );
          })}
        </section>

        <CharacterTray
          index={index}
          takenIds={allTakenIds}
          fullySupported={fullySupported}
          onSelectCharacter={handleSelectCharacter}
          activeSlotIndex={activeSlotIndex}
        />

        {editingSlotIndex !== null && editingCalcSlot && (
          <SlotBuildModal
            slotIndex={editingSlotIndex}
            slot={team.slots[editingSlotIndex]!}
            character={editingCalcSlot.character}
            fixedSpec={team.fixedSpec}
            effectiveGrowth={editingCalcSlot.growth}
            effectiveSkillLevels={editingCalcSlot.skillLevels}
            effectiveBuild={editingCalcSlot.build}
            treasurePhase={editingCalcSlot.treasurePhase}
            masters={masters}
            mastersError={mastersError}
            focused={team.controlledSlot === editingSlotIndex}
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

        <DragOverlay>
          {draggedCharacter && draggedPortrait ? (
            <div
              className="slot-drag-overlay"
              style={{
                width: draggedPortrait.width,
                height: draggedPortrait.height,
                marginLeft: draggedPortrait.left,
                marginTop: draggedPortrait.top,
              }}
            >
              <CharacterVisual character={draggedCharacter} size="portrait" />
            </div>
          ) : draggedCharacter ? (
            <div className="char-drag-overlay">
              <CharacterVisual character={draggedCharacter} size="compact" />
              <span className="char-tray-item-name">{draggedCharacter.name.ja}</span>
            </div>
          ) : null}
        </DragOverlay>
      </div>
    </DndContext>
  );
}
