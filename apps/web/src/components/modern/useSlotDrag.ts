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
import { useLayoutEffect, useRef, useState, type Dispatch, type MouseEvent as ReactMouseEvent } from 'react';
import type { CalcView } from '../../calcView.ts';
import type { PartiesState, PartySlotRef } from '../../parties.ts';
import type { TeamAction, TeamState } from '../../team.ts';
import { trayCollectionBadge, type Badge } from './badges.ts';
import { setDropPlaced } from './dropAnimation.ts';
import { partyCardAt, partyContentAt, partyLabelAt, slotCardAt, slotsGridAt } from './partyRows.ts';
import { FLIGHT, flyControllerInto, flyLabel, flyToTray, liftedRectOf } from './flight.ts';
import { activeDragData, DRAG_START_DISTANCE, dropIntentOf, type SlotRef } from './dropIntent.ts';
import { trayGrowthMarks, type GrowthMarks } from './GrowthMarks.tsx';
import { slotCollectionBadge, slotGrowthMarks } from './slotBadges.ts';
import { slotSizeVars } from './useSlotFit.ts';
import { trayVisualAt, type SlotPlacement } from './useSlotPlacement.ts';

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
  /** 四角の絵（選んでいない編成の行から持ち上げた）か。選んでいる編成のスロットは縦長の絵 */
  square: boolean;
};

/** 持ち上げている間に DragOverlay へ出すもの（SlotDragOverlay） */
export type DragOverlayState = {
  /** 操作の印を持ち上げている */
  draggingController: boolean;
  /** 持ち上げたニケ（スロットからも一覧からも） */
  draggedCharacter: CharacterIndexEntry | null;
  /** 持ち上げた空のスロットの番号（空のスロットを持ち上げていなければ null） */
  draggedEmptyIndex: number | null;
  /** 持ち上げた編成の番号（0 から）と、それが選んでいる編成か（番号を持ち上げていなければ null） */
  draggedPartyLabel: { index: number; active: boolean } | null;
  /** スロットから持ち上げた立ち絵（一覧から持ち上げたときは null） */
  draggedPortrait: DraggedPortrait | null;
  /** 持ち上げたものの限界突破・コア強化とコレクションのバッジ（持ち上げた絵に、名前と一緒に出す） */
  draggedMarks: GrowthMarks | null;
  draggedCollection: Badge | null;
};

type Params = {
  team: TeamState;
  /** 編成の一覧（選んでいない編成の行のニケを引く）。選んでいる編成の中身は team */
  parties: PartiesState;
  dispatch: Dispatch<TeamAction>;
  calc: CalcView;
  roster: BuildSnapshot | null;
  placement: SlotPlacement;
  /** 一覧のニケを、選んでいない編成 party のスロット index に置く（選んでいる編成は変えない） */
  placeInParty: (resourceId: number, party: number, index: number) => void;
  /** 選んでいない編成 party のスロット index を空にする */
  clearPartySlot: (party: number, index: number) => void;
  /** 2 つのスロット（どの編成でも）の中身を入れ替える（選んでいる編成は変えない） */
  exchangeSlots: (a: PartySlotRef, b: PartySlotRef) => void;
  /** 編成 a と b の中身を入れ替える（選んでいる編成の番号は変えない） */
  swapPartyContents: (a: number, b: number) => void;
  /** ドラッグを始めたとき */
  onDragStart: () => void;
};

/**
 * ドラッグを離した直後のクリックを 1 回だけ止める。選んでいない編成の行は、押すとその編成を選ぶボタンで、同じ行の中で持ち上げて
 * 離すと、離した後にそのボタンのクリックが届く（押した所と離した所の共通の親）。クリックは離した直後に届くので、次のタスクで外す
 */
function suppressNextClick(): void {
  const stop = (event: MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
  };
  window.addEventListener('click', stop, { capture: true, once: true });
  setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 0);
}

export function useSlotDrag({
  team,
  parties,
  dispatch,
  calc,
  roster,
  placement,
  placeInParty,
  clearPartySlot,
  exchangeSlots,
  swapPartyContents,
  onDragStart,
}: Params) {
  const [draggedCharacter, setDraggedCharacter] = useState<CharacterIndexEntry | null>(null);
  const [draggingController, setDraggingController] = useState(false);
  const [draggedEmptyIndex, setDraggedEmptyIndex] = useState<number | null>(null);
  const [draggedPartyLabel, setDraggedPartyLabel] = useState<DragOverlayState['draggedPartyLabel']>(null);
  const [draggedPortrait, setDraggedPortrait] = useState<DraggedPortrait | null>(null);
  const [draggedExtras, setDraggedExtras] = useState<{ marks: GrowthMarks | null; collection: Badge | null }>({
    marks: null,
    collection: null,
  });

  // マウスは DRAG_START_DISTANCE 動かして初めてドラッグと判定（通常のクリック操作との共存。時間の条件は無く、動かしたらすぐ持ち上がる。オーナーの指示）。タッチは 250ms の長押しで持ち上げ、
  // それまでに 8px より動いたらスクロールにする（すぐ持ち上げると、トレイの上でページをスクロールできない）
  const sensors = useSensors(
    useSensor(LeftButtonMouseSensor, { activationConstraint: { distance: DRAG_START_DISTANCE } }),
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
    setDraggedPartyLabel(null);
  };

  // 編成を入れ替えたら、入れ替えた 2 つの行のスロットの並びを、入れ替える前の相手の行の位置から自分の行の位置へ動かす。
  // 入れ替えの後の描画（編成の一覧が変わった描画）で動かし始める
  const rowFlipRef = useRef<{ before: PartiesState; rows: { party: number; from: DOMRect }[] } | null>(null);
  useLayoutEffect(() => {
    const flip = rowFlipRef.current;
    if (!flip || flip.before === parties) return;
    rowFlipRef.current = null;
    for (const { party, from } of flip.rows) {
      const grid = slotsGridAt(party);
      if (!grid) continue;
      const to = grid.getBoundingClientRect();
      // 動く行は、動かない行より上に描く（間の行の下に潜ると、動く行が見え隠れして点滅して見えた。オーナーのコメント）
      Object.assign(grid.style, { position: 'relative', zIndex: '1' });
      const restore = () => Object.assign(grid.style, { position: '', zIndex: '' });
      grid
        .animate(
          [{ transform: `translate(${from.left - to.left}px, ${from.top - to.top}px)` }, { transform: 'none' }],
          { duration: FLIGHT.duration, easing: FLIGHT.easing },
        )
        .finished.then(restore, restore);
    }
  });

  const handleDragStart = (event: DragStartEvent) => {
    onDragStart();
    setDropPlaced(false);
    if (noScrollNodeRef.current) Reflect.deleteProperty(noScrollNodeRef.current, 'scrollIntoView');
    const source = (event.activatorEvent.target as Element | null)?.closest('.modern-slot-card, .char-tray-item');
    if (source) Object.assign(source, { scrollIntoView: () => undefined });
    noScrollNodeRef.current = source ?? null;
    const data = activeDragData(event.active.data.current);
    if (data?.type === 'controller') {
      setDraggingController(true);
      return;
    }
    if (data?.type === 'party-label') {
      setDraggedPartyLabel({ index: data.partyIndex, active: data.partyIndex === parties.active });
      return;
    }
    if (data?.character) setDraggedCharacter(data.character);
    const fromSlot = data?.type === 'slot-character' ? data : null;
    const fromParty = data?.type === 'party-character' ? data : null;
    const fromAny = fromSlot ?? fromParty;
    setDraggedEmptyIndex(fromAny && !fromAny.character ? fromAny.slotIndex : null);
    if (fromSlot) {
      setDraggedExtras({
        marks: slotGrowthMarks(calc, team, roster, fromSlot.slotIndex),
        collection: slotCollectionBadge(calc, fromSlot.slotIndex),
      });
    } else if (fromParty) {
      // 選んでいない編成の行と同じく、限界突破・コア強化は育成状況の値（コレクションは出さない。PartyPreviewRow）
      const marks = fromParty.character ? trayGrowthMarks(fromParty.character, roster, team.fixedSpec) : null;
      setDraggedExtras({ marks, collection: null });
    } else if (data?.type === 'tray-character') {
      setDraggedExtras({
        marks: trayGrowthMarks(data.character, roster, team.fixedSpec),
        collection: trayCollectionBadge(data.character, roster, team.fixedSpec),
      });
    } else {
      setDraggedExtras({ marks: null, collection: null });
    }
    // スロットのカード（選んでいない編成の行も）から持ち上げたら、立ち絵を今の大きさのまま持ち上げる
    const card =
      fromSlot || fromParty ? (event.activatorEvent.target as Element | null)?.closest('.modern-slot-card') : null;
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
        square: fromParty !== null,
      });
    } else {
      setDraggedPortrait(null);
    }
  };

  /** 場所のスロットのニケ（空なら null）。party が null なら選んでいる編成 */
  const resourceIdAt = (party: number, index: number) =>
    (party === parties.active ? team.slots[index] : parties.parties[party]?.slots[index])?.resourceId ?? null;
  /** 場所の編成の番号（null は選んでいる編成） */
  const partyOf = (ref: SlotRef) => ref.party ?? parties.active;
  /** スロットの立ち絵の枠の位置（ニケがいなければ undefined） */
  const areaRectAt = (party: number, index: number) =>
    resourceIdAt(party, index) === null ? undefined : partyContentAt(party, index)?.getBoundingClientRect();
  /** 編成 party のスロット index へ、from から絵を動かす（描き直しの後に、そのカードへ） */
  const arriveAt = (party: number, index: number, from: DOMRect | undefined) =>
    placement.queueArrivalAt(`party-${party}-${index}`, () => partyCardAt(party, index), from);

  const handleDragEnd = (event: DragEndEvent) => {
    clearDragged();
    // 選んでいない編成の行と編成の番号は、押すと編成を選ぶボタン。離した後に届くクリックで選ばないようにする
    const activeType = activeDragData(event.active.data.current)?.type;
    if (activeType === 'party-character' || activeType === 'party-label') suppressNextClick();
    const intent = dropIntentOf(event.active.data.current, event.over?.data.current);
    switch (intent.kind) {
      case 'controller': {
        // 持ち上げた印は、離した位置から移した先のスロットの印の場所へ動かす
        const from = document.querySelector('.controller-drag-overlay')?.getBoundingClientRect();
        setDropPlaced(true);
        dispatch({ type: 'setControlledSlot', index: intent.index });
        if (from) flyControllerInto(from, () => slotCardAt(intent.index));
        break;
      }
      case 'unplace':
        // 外したニケはスロットへ戻らないので、戻るアニメーションはしない。持ち上げた絵を一覧のそのニケの絵へ動かす
        setDropPlaced(true);
        placement.clearSlot(intent.index, document.querySelector('.slot-drag-overlay-portrait .modern-slot-char-area'));
        break;
      case 'place': {
        // 持ち上げた絵は、離した位置からスロットへ動かす
        const from = liftedRectOf(document.querySelector('.char-drag-overlay .char-tray-item-visual'));
        if (placement.placeFromTray(intent.character.resourceId, intent.index, from)) setDropPlaced(true);
        break;
      }
      case 'place-party': {
        // 持ち上げた絵は、離した位置から選んでいない編成の行のスロットへ、そこにいたニケは一覧へ動かす
        const from = liftedRectOf(document.querySelector('.char-drag-overlay .char-tray-item-visual'));
        const replaced = resourceIdAt(intent.party, intent.index);
        const content = partyContentAt(intent.party, intent.index);
        setDropPlaced(true);
        if (replaced !== null && content) flyToTray(content, trayVisualAt(replaced)?.getBoundingClientRect() ?? null);
        arriveAt(intent.party, intent.index, from);
        placeInParty(intent.character.resourceId, intent.party, intent.index);
        break;
      }
      case 'unplace-party': {
        // 外したニケはスロットへ戻らない。持ち上げた絵を一覧のそのニケの絵へ動かす
        const id = resourceIdAt(intent.party, intent.index);
        const content = document.querySelector('.slot-drag-overlay-portrait .modern-slot-char-area');
        setDropPlaced(true);
        if (id !== null && content) flyToTray(content, trayVisualAt(id)?.getBoundingClientRect() ?? null);
        clearPartySlot(intent.party, intent.index);
        break;
      }
      case 'swap-parties': {
        // 番号は動かず、中身（スロットの並び）が入れ替わる。持ち上げた番号は、離した位置から落とした先の番号の場所へ、落とした先の番号は、
        // 持ち上げた番号の元の場所へ動かす。どちらも動きの最初の 45% で透明にし、半分で動く先の番号の表示に切り替え、後半の 55% から不透明に戻す（オーナーの指示）。動いている間は、2 つの元の番号を隠し、動き終えたら出す。
        // 隠すのは番号のボタンの style（React は番号の枠の class を描き直すが、ボタンの style は触らない）
        const rectOf = (party: number) => slotsGridAt(party)?.getBoundingClientRect();
        const fromA = rectOf(intent.a);
        const fromB = rectOf(intent.b);
        const dragged = document.querySelector('.party-label-drag-overlay');
        const labelA = partyLabelAt(intent.a);
        const labelB = partyLabelAt(intent.b);
        setDropPlaced(true);
        if (dragged && labelA && labelB) {
          const tabs = [labelA, labelB].map((label) => label.querySelector<HTMLElement>('.party-tab'));
          const targetRect = labelB.getBoundingClientRect();
          const originRect = labelA.getBoundingClientRect();
          // 落とした先の番号の写しは、落とす先の印（枠の線）を付けずに動かす
          labelB.classList.remove('party-label-over');
          const flights = [flyLabel(dragged, targetRect, labelB), flyLabel(labelB, originRect, labelA)];
          for (const tab of tabs) if (tab) tab.style.visibility = 'hidden';
          void Promise.all(flights).then(() => {
            for (const tab of tabs) if (tab) tab.style.visibility = '';
          });
        }
        if (fromA && fromB) {
          rowFlipRef.current = {
            before: parties,
            rows: [
              { party: intent.a, from: fromB },
              { party: intent.b, from: fromA },
            ],
          };
        }
        swapPartyContents(intent.a, intent.b);
        break;
      }
      case 'exchange': {
        // 持ち上げた絵は、離した位置から落とした先へ、落とした先にいたニケは、その元の位置から持ち上げた元のスロットへ動かす
        const from = { party: partyOf(intent.from), index: intent.from.index };
        const to = { party: partyOf(intent.to), index: intent.to.index };
        const dragged = liftedRectOf(document.querySelector('.slot-drag-overlay-portrait'));
        const displaced = areaRectAt(to.party, to.index);
        setDropPlaced(true);
        // 空のスロットは動かさない（その場で入れ替わる）
        arriveAt(to.party, to.index, resourceIdAt(from.party, from.index) === null ? undefined : dragged);
        arriveAt(from.party, from.index, displaced);
        exchangeSlots(from, to);
        break;
      }
      case 'swap':
        // 持ち上げた絵は、離した位置から落とした先へ、落とした先にいたものは、その元の位置からドラッグ元へ動かす
        setDropPlaced(true);
        placement.swapSlots(
          intent.from,
          intent.to,
          liftedRectOf(document.querySelector('.slot-drag-overlay-portrait')),
        );
        break;
    }
  };

  const overlay: DragOverlayState = {
    draggingController,
    draggedCharacter,
    draggedEmptyIndex,
    draggedPartyLabel,
    draggedPortrait,
    draggedMarks: draggedExtras.marks,
    draggedCollection: draggedExtras.collection,
  };
  return { sensors, overlay, handleDragStart, handleDragEnd, handleDragCancel: clearDragged };
}
