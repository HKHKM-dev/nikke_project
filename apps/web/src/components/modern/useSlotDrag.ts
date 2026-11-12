// モダン UI のドラッグ（スロットどうしの入れ替え・一覧からスロットへ・スロットから一覧へ・操作の印）。センサーと、持ち上げている間の
// 状態（DragOverlay に出す絵）と、始め・終わり・取りやめの処理を持つ
import {
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type MouseSensorOptions,
} from '@dnd-kit/core';
import type { BuildSnapshot, CharacterIndexEntry } from '@nikke/core';
import { useRef, useState, type Dispatch, type MouseEvent as ReactMouseEvent } from 'react';
import type { CalcView } from '../../calcView.ts';
import type { TeamAction, TeamState } from '../../team.ts';
import { trayCollectionBadge, type Badge } from './badges.ts';
import { setDropState } from './dropAnimation.ts';
import { activeDragData, dropIntentOf } from './dropIntent.ts';
import { trayGrowthMarks, type GrowthMarks } from './GrowthMarks.tsx';
import { slotCollectionBadge, slotGrowthMarks } from './slotBadges.ts';
import { slotSizeVars } from './useSlotFit.ts';
import type { SlotPlacement } from './useSlotPlacement.ts';

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

/** スロットから持ち上げた立ち絵の大きさと、カードの左上からの位置 */
export type DraggedPortrait = {
  cardWidth: number;
  cardHeight: number;
  width: number;
  height: number;
  left: number;
  top: number;
  /** スロットの大きさの変数（--slot-portrait-h など。並びの幅で縮む。useSlotFit） */
  sizeVars: Record<string, string>;
};

/** 持ち上げている間に DragOverlay へ出すもの（SlotDragOverlay） */
export type DragOverlayState = {
  /** 操作の印を持ち上げている */
  draggingController: boolean;
  /** 持ち上げたニケ（スロットからも一覧からも） */
  draggedCharacter: CharacterIndexEntry | null;
  /** 持ち上げた空のスロットの番号（空のスロットを持ち上げていなければ null） */
  draggedEmptyIndex: number | null;
  /** スロットから持ち上げた立ち絵（一覧から持ち上げたときは null） */
  draggedPortrait: DraggedPortrait | null;
  /** 持ち上げたものの限界突破・コア強化とコレクションのバッジ（持ち上げた絵に、名前と一緒に出す） */
  draggedMarks: GrowthMarks | null;
  draggedCollection: Badge | null;
};

type Params = {
  team: TeamState;
  dispatch: Dispatch<TeamAction>;
  calc: CalcView;
  roster: BuildSnapshot | null;
  placement: SlotPlacement;
  /** ドラッグを始めたとき */
  onDragStart: () => void;
};

export function useSlotDrag({ team, dispatch, calc, roster, placement, onDragStart }: Params) {
  const [draggedCharacter, setDraggedCharacter] = useState<CharacterIndexEntry | null>(null);
  const [draggingController, setDraggingController] = useState(false);
  const [draggedEmptyIndex, setDraggedEmptyIndex] = useState<number | null>(null);
  const [draggedPortrait, setDraggedPortrait] = useState<DraggedPortrait | null>(null);
  const [draggedExtras, setDraggedExtras] = useState<{ marks: GrowthMarks | null; collection: Badge | null }>({
    marks: null,
    collection: null,
  });

  // マウスは 8px 動かして初めてドラッグと判定（通常のクリック操作との共存）。タッチは 250ms の長押しで持ち上げ、
  // それまでに 8px より動いたらスクロールにする（すぐ持ち上げると、トレイの上でページをスクロールできない）
  const sensors = useSensors(
    useSensor(LeftButtonMouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );

  // 離したときのアニメーション（DragOverlay）は、ドラッグ元が画面の外にあると、ドラッグ元の要素に scrollIntoView して画面を動かす（dnd-kit の既定）。
  // アニメーションは残し、画面を動かすのだけ止めるため、持ち上げたドラッグ元の scrollIntoView を何もしない関数で隠す
  const noScrollNodeRef = useRef<Element | null>(null);

  /** 持ち上げている間の絵を消す（終わり・取りやめ） */
  const clearDragged = () => {
    setDraggingController(false);
    setDraggedCharacter(null);
    setDraggedEmptyIndex(null);
    setDraggedPortrait(null);
  };

  const handleDragStart = (event: DragStartEvent) => {
    onDragStart();
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
        marks: slotGrowthMarks(calc, team, roster, fromSlot.slotIndex),
        collection: slotCollectionBadge(calc, fromSlot.slotIndex),
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
    clearDragged();
    const intent = dropIntentOf(event.active.data.current, event.over?.data.current);
    switch (intent.kind) {
      case 'controller':
        setDropState({ placed: true });
        dispatch({ type: 'setControlledSlot', index: intent.index });
        break;
      case 'unplace':
        // 外したニケはスロットへ戻らないので、戻るアニメーションはしない。持ち上げた絵を一覧のそのニケの絵へ動かす
        setDropState({ placed: true });
        placement.clearSlot(intent.index, document.querySelector('.slot-drag-overlay-portrait .modern-slot-char-area'));
        break;
      case 'place': {
        // 持ち上げた絵は、離した位置からスロットへ動かす
        const from = document.querySelector('.char-drag-overlay .char-tray-item-visual')?.getBoundingClientRect();
        if (placement.placeFromTray(intent.character.resourceId, intent.index, from)) setDropState({ placed: true });
        break;
      }
      case 'swap':
        setDropState({ targetIndex: intent.to });
        dispatch({ type: 'swapSlots', fromIndex: intent.from, toIndex: intent.to });
        break;
    }
  };

  const overlay: DragOverlayState = {
    draggingController,
    draggedCharacter,
    draggedEmptyIndex,
    draggedPortrait,
    draggedMarks: draggedExtras.marks,
    draggedCollection: draggedExtras.collection,
  };
  return { sensors, overlay, handleDragStart, handleDragEnd, handleDragCancel: clearDragged };
}
