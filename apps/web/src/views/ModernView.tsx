import {
  DndContext,
  DragOverlay,
  MouseSensor,
  pointerWithin,
  defaultDropAnimationSideEffects,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type DropAnimation,
  type MouseSensorOptions,
} from '@dnd-kit/core';
import type { CharacterIndexEntry } from '@nikke/core';
import { useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { DamageTotalPanel } from '../components/DamageTotalPanel.tsx';
import { ErrorBoundary } from '../components/ErrorBoundary.tsx';
import { NotesSummary } from '../components/NotesSummary.tsx';
import { PartyTabs } from '../components/PartyTabs.tsx';
import { TeamSettingsForm } from '../components/TeamSettingsForm.tsx';
import type { ViewProps } from './ViewProps.ts';
import { CharacterTray } from '../components/modern/CharacterTray.tsx';
import { collectionBadge } from '../components/modern/badges.ts';
import { CharacterVisual } from '../components/modern/CharacterVisual.tsx';
import { growthMarksOf } from '../components/modern/GrowthMarks.tsx';
import { EmptySlotFace, ModernSlotCard } from '../components/modern/ModernSlotCard.tsx';
import { SlotBuildModal } from '../components/modern/SlotBuildModal.tsx';
import { placeCharacterAction } from '../team.ts';

/**
 * 離したときのアニメーション。dnd-kit の既定は、戻る間ドラッグ元（スロットのカード・一覧の項目）を透明にして消すので、
 * 代わりに印（drag-source-returning）を付け、ドラッグ中と同じ薄さで残す（styles.css）
 */
const returnSideEffects = defaultDropAnimationSideEffects({ className: { active: 'drag-source-returning' } });

/** 離したドロップでスロットを入れ替えたか（handleDragEnd が決め、DROP_ANIMATION が読む） */
const dropState = { swapped: false };

/**
 * 入れ替えたときは、ドラッグ元へ戻っていく絵を、ドラッグ元に新しく入ったもの（空のスロット・入れ替わったニケ）の絵に差し替える
 * （持ち上げたニケの絵のままだと、そのニケがドラッグ元へ戻るように見える）。着くまでドラッグ元の絵は隠す（modern-slot-arriving）
 */
const DROP_ANIMATION: DropAnimation = {
  sideEffects: (args) => {
    const holder = args.dragOverlay.node.querySelector('.slot-drag-overlay-portrait');
    const incoming = args.active.node.querySelector('.char-visual-portrait, .modern-slot-empty-area');
    if (!dropState.swapped || !holder || !incoming) return returnSideEffects(args);
    const saved = [...holder.childNodes];
    holder.replaceChildren(incoming.cloneNode(true));
    args.active.node.classList.add('modern-slot-arriving');
    return () => {
      holder.replaceChildren(...saved);
      args.active.node.classList.remove('modern-slot-arriving');
    };
  },
};

/**
 * 左ボタンだけでドラッグを始めるマウスのセンサー。dnd-kit の MouseSensor は右ボタン以外（中ボタンも）で始めるので、
 * ホイールを押して画面を流そうとすると立ち絵が動いてしまう
 */
class LeftButtonMouseSensor extends MouseSensor {
  static activators = [
    {
      eventName: 'onMouseDown' as const,
      handler: ({ nativeEvent }: ReactMouseEvent, { onActivation }: MouseSensorOptions) => {
        if (nativeEvent.button !== 0) return false;
        onActivation?.({ event: nativeEvent });
        return true;
      },
    },
  ];
}

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

  // 枠が埋まっているときに一覧でクリックしたニケ。次にクリックしたスロットに置く（null なら待っていない）
  const [pendingId, setPendingId] = useState<number | null>(null);

  // 育成モーダルを開いているスロット（null なら閉じた状態）
  const [editingSlotIndex, setEditingSlotIndex] = useState<number | null>(null);

  // ドラッグ中のキャラクター情報（DragOverlay 用）。スロットから持ち上げたときは、カードの大きさと、立ち絵の大きさ・カードの左上からの位置も持つ
  const [draggedCharacter, setDraggedCharacter] = useState<CharacterIndexEntry | null>(null);
  // 持ち上げた空のスロットの番号（空のスロットを持ち上げていなければ null）
  const [draggedEmptyIndex, setDraggedEmptyIndex] = useState<number | null>(null);
  const [draggedPortrait, setDraggedPortrait] = useState<{
    cardWidth: number;
    cardHeight: number;
    width: number;
    height: number;
    left: number;
    top: number;
  } | null>(null);

  // マウスは 8px 動かして初めてドラッグと判定（通常のクリック操作との共存）。タッチは 250ms の長押しで持ち上げ、
  // それまでに 8px より動いたらスクロールにする（すぐ持ち上げると、トレイの上でページをスクロールできない）
  const sensors = useSensors(
    useSensor(LeftButtonMouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );

  // 離したときのアニメーション（DragOverlay）は、ドラッグ元が画面の外にあると、ドラッグ元の要素に scrollIntoView して画面を動かす（dnd-kit の既定）。
  // アニメーションは残し、画面を動かすのだけ止めるため、持ち上げたドラッグ元の scrollIntoView を何もしない関数で隠す
  const noScrollNodeRef = useRef<Element | null>(null);

  const handleDragStart = (event: DragStartEvent) => {
    setPendingId(null);
    dropState.swapped = false;
    if (noScrollNodeRef.current) Reflect.deleteProperty(noScrollNodeRef.current, 'scrollIntoView');
    const source = (event.activatorEvent.target as Element | null)?.closest('.modern-slot-card, .char-tray-item');
    if (source) Object.assign(source, { scrollIntoView: () => undefined });
    noScrollNodeRef.current = source ?? null;
    const data = event.active.data.current;
    if (data?.character) {
      setDraggedCharacter(data.character as CharacterIndexEntry);
    }
    setDraggedEmptyIndex(data?.type === 'slot-character' && !data.character ? (data.slotIndex as number) : null);
    // スロットのカードから持ち上げたら、立ち絵を今の大きさのまま持ち上げる
    const card =
      event.active.data.current?.type === 'slot-character'
        ? (event.activatorEvent.target as Element | null)?.closest('.modern-slot-card')
        : null;
    const portrait = card?.querySelector('.char-visual-portrait, .modern-slot-empty-area');
    if (card && portrait) {
      const c = card.getBoundingClientRect();
      const p = portrait.getBoundingClientRect();
      setDraggedPortrait({
        cardWidth: c.width,
        cardHeight: c.height,
        width: p.width,
        height: p.height,
        left: p.left - c.left,
        top: p.top - c.top,
      });
    } else {
      setDraggedPortrait(null);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDraggedCharacter(null);
    setDraggedEmptyIndex(null);
    setDraggedPortrait(null);
    const { active, over } = event;
    if (!over) return;

    const overData = over.data.current;
    const activeData = active.data.current;
    if (!activeData) return;

    // スロットのキャラをトレイへ戻したら、そのスロットを空にする
    if (overData?.type === 'tray') {
      if (activeData.type === 'slot-character' && activeData.character) {
        dispatch({ type: 'clearSlot', index: activeData.slotIndex as number });
      }
      return;
    }
    if (overData?.slotIndex === undefined) return;
    const targetSlotIndex = overData.slotIndex as number;

    if (activeData.type === 'tray-character') {
      // どこかのスロットにいるキャラは置かない（placeCharacterAction。トレイでも持ち上げられない）
      const char = activeData.character as CharacterIndexEntry;
      const action = placeCharacterAction(team, char.resourceId, targetSlotIndex);
      if (!action) return;
      dispatch(action);
    } else if (activeData.type === 'slot-character') {
      const fromSlotIndex = activeData.slotIndex as number;
      if (fromSlotIndex !== targetSlotIndex) {
        dropState.swapped = true;
        dispatch({ type: 'swapSlots', fromIndex: fromSlotIndex, toIndex: targetSlotIndex });
      }
    }
  };

  const handleDragCancel = () => {
    setDraggedCharacter(null);
    setDraggedEmptyIndex(null);
    setDraggedPortrait(null);
  };

  // 一覧でニケをクリックしたとき: 空き枠があれば最も左の空き枠に置く。なければ、次にクリックしたスロットに置くまで待つ
  // （同じニケをもう一度クリックすると待つのをやめる）
  const handleSelectCharacter = (resourceId: number) => {
    const emptyIndex = team.slots.findIndex((s) => s.resourceId === null);
    if (emptyIndex === -1) {
      setPendingId((id) => (id === resourceId ? null : resourceId));
      return;
    }
    const action = placeCharacterAction(team, resourceId, emptyIndex);
    if (action) dispatch(action);
    setPendingId(null);
  };

  // 待っているニケを、クリックしたスロットに置く（いたニケは外れて一覧に戻る）
  const handlePlacePending = (index: number) => {
    if (pendingId === null) return;
    const action = placeCharacterAction(team, pendingId, index);
    if (action) dispatch(action);
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
      sensors={sensors}
      // 落とす先は、カーソル（指）の下の受け口で決める（既定は持ち上げた絵の外枠＝カード 1 枚分との重なりで、隣に少し掛かっただけで入れ替わる）
      collisionDetection={pointerWithin}
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
            const { character, build, treasurePhase, growth } = calc.slots[i]!;
            const characterEntry = slot.resourceId !== null ? indexMap.get(slot.resourceId) : undefined;
            const isUnsupported =
              slot.resourceId !== null && fullySupported !== null && !fullySupported.has(slot.resourceId);

            return (
              <ModernSlotCard
                key={i}
                slotIndex={i}
                character={character}
                characterEntry={characterEntry}
                isUnsupported={isUnsupported}
                error={slot.resourceId === null ? undefined : characterCache.errors.get(slot.resourceId)}
                slotResult={slotResults[i] ?? null}
                // 限界突破・コア強化は、育成状況を読み込んでいるとき（一覧と同じ。消すとスロットの育成も既定に戻る）と、
                // スペック固定のとき（計算に使う固定の値。限界突破・コアとも上限）に出す
                growthMarks={character && (roster || team.fixedSpec) ? growthMarksOf(character.rarity, growth) : null}
                collectionBadge={collectionBadge(
                  build.collection,
                  treasurePhase,
                  (character?.treasure ?? null) !== null,
                )}
                inOtherParty={slot.resourceId !== null && otherPartyIds.has(slot.resourceId)}
                onPlacePending={pendingId !== null ? () => handlePlacePending(i) : undefined}
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
          otherPartyIds={otherPartyIds}
          fullySupported={fullySupported}
          pendingId={pendingId}
          roster={roster}
          fixedSpec={team.fixedSpec}
          listOrder={listOrder}
          onSelectCharacter={handleSelectCharacter}
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
            usesHpRatio={editingCalcSlot.usesHpRatio}
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

        <DragOverlay dropAnimation={DROP_ANIMATION}>
          {(draggedCharacter || draggedEmptyIndex !== null) && draggedPortrait ? (
            // 離したときのアニメーションは、この外側の箱をドラッグ元（カード）の位置へ戻す。外側をカードと同じ大きさにし、
            // 立ち絵をカードの中と同じ位置に置くと、立ち絵が元あった場所へ戻る
            <div
              className="slot-drag-overlay"
              style={{ width: draggedPortrait.cardWidth, height: draggedPortrait.cardHeight }}
            >
              <div
                className="slot-drag-overlay-portrait"
                style={{
                  width: draggedPortrait.width,
                  height: draggedPortrait.height,
                  left: draggedPortrait.left,
                  top: draggedPortrait.top,
                }}
              >
                {draggedCharacter ? (
                  <CharacterVisual character={draggedCharacter} size="portrait" />
                ) : (
                  <EmptySlotFace slotIndex={draggedEmptyIndex!} />
                )}
              </div>
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
