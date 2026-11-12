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
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { DamageTotalPanel } from '../components/DamageTotalPanel.tsx';
import { ErrorBoundary } from '../components/ErrorBoundary.tsx';
import { NotesSummary } from '../components/NotesSummary.tsx';
import { PartyTabs } from '../components/PartyTabs.tsx';
import { TeamSettingsForm } from '../components/TeamSettingsForm.tsx';
import type { ViewProps } from './ViewProps.ts';
import { CharacterTray } from '../components/modern/CharacterTray.tsx';
import { TrayItemFace } from '../components/modern/CharacterTrayItem.tsx';
import { collectionBadge, trayCollectionBadge, type Badge } from '../components/modern/badges.ts';
import { CharacterVisual } from '../components/modern/CharacterVisual.tsx';
import { growthMarksOf, trayGrowthMarks, type GrowthMarks } from '../components/modern/GrowthMarks.tsx';
import { slotSizeVars, useSlotFit } from '../components/modern/useSlotFit.ts';
import { ControllerIcon, EmptySlotFace, ModernSlotCard, SlotCharName } from '../components/modern/ModernSlotCard.tsx';
import { activeDragData, dropIntentOf } from '../components/modern/dropIntent.ts';
import { cloneForAnimation, decodeImages, flyIntoSlot, flyToTray, stopArrival } from '../components/modern/flight.ts';
import { SlotBuildModal } from '../components/modern/SlotBuildModal.tsx';
import { commonGrowthOf, rosterGrowthOf } from '../roster.ts';
import { placeCharacterAction } from '../team.ts';
import { useTrayShape } from '../trayShape.ts';
import { NO_PARTIES } from '../components/modern/OtherPartyBadges.tsx';

/**
 * 離したときのアニメーション。dnd-kit の既定は、戻る間ドラッグ元（スロットのカード・一覧の項目）を透明にして消すので、
 * 代わりに印（drag-source-returning）を付け、ドラッグ中と同じ薄さで残す（styles.css）
 */
const returnSideEffects = defaultDropAnimationSideEffects({ className: { active: 'drag-source-returning' } });

/** 離したドロップの結果（handleDragEnd が決め、DROP_ANIMATION が読む） */
const dropState: { targetIndex: number | null; placed: boolean } = {
  // スロットどうしを入れ替えた先のスロット（入れ替えていなければ null）
  targetIndex: null,
  // 持ち上げたものの行き先が決まった（一覧のニケをスロットに置いた・スロットのニケを一覧へ戻して外した）。元へ戻るアニメーションはしない
  placed: false,
};

/** 一覧のそのニケの絵（一覧に出ていなければ null） */
const trayVisualAt = (resourceId: number) =>
  document.querySelector(`.char-tray-item[data-resource-id="${resourceId}"] .char-tray-item-visual`);

/** 離したドロップの結果を書く（ドロップの処理から、描画の外の dropState を書き換える） */
function setDropState(next: Partial<typeof dropState>): void {
  Object.assign(dropState, next);
}

/** 置いたニケのスロットに絵が入るのを待つ長さ（ms） */
const ARRIVAL_WAIT_MS = 1000;
const arrivalDeadline = () => performance.now() + ARRIVAL_WAIT_MS;

const slotCardAt = (index: number | null) =>
  index === null
    ? null
    : (document.querySelectorAll<HTMLElement>('.modern-slots-grid > .modern-slot-card')[index] ?? null);

/**
 * 入れ替えたときは、ドラッグ元へ戻っていく絵を、ドラッグ元に新しく入ったもの（空のスロット・入れ替わったニケ）の絵に差し替える
 * （持ち上げたニケの絵のままだと、そのニケがドラッグ元へ戻るように見える）。持ち上げたもの（動かした側）は、離した位置から
 * 落とした先のスロットへ滑り込ませる（flyIntoSlot）。どちらも着くまで行き先の絵は隠す（modern-slot-arriving）
 */
const DROP_ANIMATION: DropAnimation = {
  // 行き先が決まったとき（dropState.placed）は動かさない（始めと終わりが同じなら、dnd-kit はアニメーションをしない）
  keyframes: ({ transform: { initial, final } }) => {
    const at = (t: typeof initial) => ({
      transform: `translate3d(${t.x}px, ${t.y}px, 0) scaleX(${t.scaleX}) scaleY(${t.scaleY})`,
    });
    return [at(initial), at(dropState.placed ? initial : final)];
  },
  sideEffects: (args) => {
    const holder = args.dragOverlay.node.querySelector<HTMLElement>('.slot-drag-overlay-portrait');
    // ドラッグ元へ戻っていく絵も、立ち絵の枠全体（名前などを含む）の写しにする
    const incoming = args.active.node.querySelector('.modern-slot-char-area');
    if (dropState.targetIndex === null || !holder || !incoming) return returnSideEffects(args);
    // 持ち上げたもの（動かした側）は、落とした先のスロットへ滑り込ませる
    const target = slotCardAt(dropState.targetIndex);
    const sourceReady = decodeImages(args.active.node);
    const finishSlide = target ? flyIntoSlot(holder.getBoundingClientRect(), target) : () => undefined;
    const saved = [...holder.childNodes];
    holder.replaceChildren(cloneForAnimation(incoming));
    // 持ち上げたときの影は付けない（収まった瞬間に影が消えて、枠のように見える。滑り込む側にも影は無い）
    holder.style.boxShadow = 'none';
    args.active.node.classList.add('modern-slot-arriving');
    return () => {
      // 持ち上げた絵は直後に消える。元の中身へ戻すと、消えるまでの一瞬だけ持ち上げたニケの絵が見えるので、先に隠す
      args.dragOverlay.node.style.visibility = 'hidden';
      holder.replaceChildren(...saved);
      holder.style.boxShadow = '';
      // ドラッグ元も、新しく入ったものの画像が描けるようになってから見せる
      void sourceReady.then(() => args.active.node.classList.remove('modern-slot-arriving'));
      finishSlide();
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

  // ドラッグ中のキャラクター情報（DragOverlay 用）。スロットから持ち上げたときは、カードの大きさと、立ち絵の大きさ・カードの左上からの位置も持つ
  const [draggedCharacter, setDraggedCharacter] = useState<CharacterIndexEntry | null>(null);
  // 操作の印を持ち上げている（DragOverlay に印を出す）
  const [draggingController, setDraggingController] = useState(false);
  // 持ち上げた空のスロットの番号（空のスロットを持ち上げていなければ null）
  const [draggedEmptyIndex, setDraggedEmptyIndex] = useState<number | null>(null);
  const [draggedPortrait, setDraggedPortrait] = useState<{
    cardWidth: number;
    cardHeight: number;
    width: number;
    height: number;
    left: number;
    top: number;
    /** スロットの大きさの変数（--slot-portrait-h など。並びの幅で縮む。useSlotFit） */
    sizeVars: Record<string, string>;
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

  // スロットの名前の上の限界突破・コア強化。育成状況にいるニケ（一覧と同じ。消すとスロットの育成も既定に戻る）と、
  // スペック固定のとき（計算に使う固定の値。限界突破・コアとも上限）に出す
  const slotGrowthMarks = (i: number): GrowthMarks | null => {
    const { character, growth } = calc.slots[i]!;
    const resourceId = team.slots[i]!.resourceId;
    const inRoster = resourceId !== null && roster?.characters[String(resourceId)] !== undefined;
    return character && (inRoster || team.fixedSpec) ? growthMarksOf(character.rarity, growth) : null;
  };
  // スロットの絵のバッジの列の最後に出すコレクション（宝物を付けていれば宝物）
  const slotCollectionBadge = (i: number): Badge | null => {
    const { character, build, treasurePhase } = calc.slots[i]!;
    return collectionBadge(build.collection, treasurePhase, (character?.treasure ?? null) !== null);
  };
  // 持ち上げたものの限界突破・コア強化とコレクションのバッジ（持ち上げた絵に、名前と一緒に出す）
  const [draggedExtras, setDraggedExtras] = useState<{ marks: GrowthMarks | null; collection: Badge | null }>({
    marks: null,
    collection: null,
  });
  const { marks: draggedMarks, collection: draggedCollection } = draggedExtras;

  // 置いたニケがスロットへ動き始める位置。置いた後の描画（スロットに絵が入った後）で動かし始める
  // スロットにまだ絵が入っていない描画（置く操作と別の描画が先に来たとき）では動かさず、次の描画を待つ（ARRIVAL_WAIT_MS まで）
  const arrivalsRef = useRef<{ index: number; from: DOMRect; until: number }[]>([]);
  useLayoutEffect(() => {
    arrivalsRef.current = arrivalsRef.current.filter(({ index, from, until }) => {
      const card = slotCardAt(index);
      if (card?.querySelector('.modern-slot-char-area .char-visual')) {
        flyIntoSlot(from, card);
        return false;
      }
      return performance.now() < until;
    });
  });

  /**
   * スロット index のニケを外す直前に、その立ち絵を一覧のそのニケの絵へ動かす。content は動かす絵（無ければスロットの立ち絵の枠。
   * 持ち上げて一覧へ落としたときは、持ち上げた絵）
   */
  const sendToTray = (index: number, content = slotCardAt(index)?.querySelector('.modern-slot-char-area') ?? null) => {
    const id = team.slots[index]?.resourceId;
    if (id === null || id === undefined || !content) return;
    flyToTray(content, trayVisualAt(id)?.getBoundingClientRect() ?? null);
  };

  /** スロット index を空にし、外したニケの立ち絵を一覧へ動かす（content は sendToTray と同じ） */
  const clearSlot = (index: number, content?: Element | null) => {
    sendToTray(index, content ?? undefined);
    stopArrival(slotCardAt(index));
    dispatch({ type: 'clearSlot', index });
  };

  /**
   * 一覧のニケをスロット index に置く。いたニケは一覧へ、置いたニケは from（無ければ一覧のそのニケの絵）からスロットへ動かす。
   * 置けない（どこかのスロットにいる）ときは何もしない。置いたかを返す
   */
  const placeFromTray = (
    resourceId: number,
    index: number,
    from = trayVisualAt(resourceId)?.getBoundingClientRect(),
  ): boolean => {
    const action = placeCharacterAction(team, resourceId, index);
    if (!action) return false;
    sendToTray(index);
    if (from) arrivalsRef.current.push({ index, from, until: arrivalDeadline() });
    dispatch(action);
    return true;
  };

  const handleDragStart = (event: DragStartEvent) => {
    setPendingId(null);
    setDropState({ targetIndex: null, placed: false });
    if (noScrollNodeRef.current) Reflect.deleteProperty(noScrollNodeRef.current, 'scrollIntoView');
    const source = (event.activatorEvent.target as Element | null)?.closest('.modern-slot-card, .char-tray-item');
    if (source) Object.assign(source, { scrollIntoView: () => undefined });
    noScrollNodeRef.current = source ?? null;
    const data = activeDragData(event.active.data.current);
    if (data?.type === 'controller') {
      setDraggingController(true);
      return;
    }
    if (data?.character) setDraggedCharacter(data.character);
    const fromSlot = data?.type === 'slot-character' ? data : null;
    setDraggedEmptyIndex(fromSlot && !fromSlot.character ? fromSlot.slotIndex : null);
    if (fromSlot) {
      setDraggedExtras({
        marks: slotGrowthMarks(fromSlot.slotIndex),
        collection: slotCollectionBadge(fromSlot.slotIndex),
      });
    } else if (data?.type === 'tray-character') {
      setDraggedExtras({
        marks: trayGrowthMarks(data.character, roster, team.fixedSpec),
        collection: trayCollectionBadge(data.character, roster, team.fixedSpec),
      });
    } else {
      setDraggedExtras({ marks: null, collection: null });
    }
    // スロットのカードから持ち上げたら、立ち絵を今の大きさのまま持ち上げる
    const card = fromSlot ? (event.activatorEvent.target as Element | null)?.closest('.modern-slot-card') : null;
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
        sizeVars: slotSizeVars(card),
      });
    } else {
      setDraggedPortrait(null);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDraggingController(false);
    setDraggedCharacter(null);
    setDraggedEmptyIndex(null);
    setDraggedPortrait(null);
    const intent = dropIntentOf(event.active.data.current, event.over?.data.current);
    switch (intent.kind) {
      case 'controller':
        setDropState({ placed: true });
        dispatch({ type: 'setControlledSlot', index: intent.index });
        break;
      case 'unplace':
        // 外したニケはスロットへ戻らないので、戻るアニメーションはしない。持ち上げた絵を一覧のそのニケの絵へ動かす
        setDropState({ placed: true });
        clearSlot(intent.index, document.querySelector('.slot-drag-overlay-portrait .modern-slot-char-area'));
        break;
      case 'place': {
        // 持ち上げた絵は、離した位置からスロットへ動かす
        const from = document.querySelector('.char-drag-overlay .char-tray-item-visual')?.getBoundingClientRect();
        if (placeFromTray(intent.character.resourceId, intent.index, from)) setDropState({ placed: true });
        break;
      }
      case 'swap':
        setDropState({ targetIndex: intent.to });
        dispatch({ type: 'swapSlots', fromIndex: intent.from, toIndex: intent.to });
        break;
    }
  };

  const handleDragCancel = () => {
    setDraggingController(false);
    setDraggedCharacter(null);
    setDraggedEmptyIndex(null);
    setDraggedPortrait(null);
  };

  // 一覧でニケをクリックしたとき: 空き枠があれば最も左の空き枠に置く。なければ、次にクリックしたスロットに置くまで待つ
  // （同じニケをもう一度クリックすると待つのをやめる）
  const handleSelectCharacter = (resourceId: number) => {
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
                growthMarks={slotGrowthMarks(i)}
                collectionBadge={slotCollectionBadge(i)}
                controlled={team.controlledSlot === i}
                otherParties={(slot.resourceId !== null && otherPartyIds.get(slot.resourceId)) || NO_PARTIES}
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

        <DragOverlay dropAnimation={DROP_ANIMATION}>
          {draggingController ? (
            <span className="controller-drag-overlay">
              <ControllerIcon />
            </span>
          ) : (draggedCharacter || draggedEmptyIndex !== null) && draggedPortrait ? (
            // 離したときのアニメーションは、この外側の箱をドラッグ元（カード）の位置へ戻す。外側をカードと同じ大きさにし、
            // 立ち絵をカードの中と同じ位置に置くと、立ち絵が元あった場所へ戻る
            <div
              className="slot-drag-overlay"
              style={
                {
                  width: draggedPortrait.cardWidth,
                  height: draggedPortrait.cardHeight,
                  ...draggedPortrait.sizeVars,
                } as CSSProperties
              }
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
                  // スロットと同じく、名前と限界突破・コア強化も一緒に持ち上げる
                  <div className="modern-slot-char-area">
                    <CharacterVisual character={draggedCharacter} size="portrait" extraBadge={draggedCollection} />
                    <SlotCharName name={draggedCharacter.name.ja} marks={draggedMarks} />
                  </div>
                ) : (
                  <EmptySlotFace slotIndex={draggedEmptyIndex!} />
                )}
              </div>
            </div>
          ) : draggedCharacter ? (
            <div className="char-drag-overlay">
              {/* 一覧の項目と同じ入れ物で包み、絵の大きさを一覧とそろえる */}
              <TrayItemFace
                character={draggedCharacter}
                unsupportedNote={null}
                growthMarks={draggedMarks}
                collectionBadge={draggedCollection}
                shape={trayShape}
              />
            </div>
          ) : null}
        </DragOverlay>
      </div>
    </DndContext>
  );
}
