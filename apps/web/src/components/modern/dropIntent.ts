// モダン UI のドラッグの data の形と、離したときに何をするか（ModernView の handleDragEnd）。持ち上げたもの（active）と離した所（over）の
// dnd-kit の data だけから決める純関数。アニメーション・DOM の読みと dispatch は ModernView が行う
import type { Data } from '@dnd-kit/core';
import type { CharacterIndexEntry } from '@nikke/core';

/** 持ち上げるものの data（useDraggable の data。作る側は satisfies か useDropAndDrag の引数の型でこの形にそろえる） */
export type ActiveDragData =
  /** 操作の印（ModernSlotCard） */
  | { type: 'controller'; slotIndex: number }
  /** スロットのニケ（ModernSlotCard）。空のスロットも持ち上げられ、character が無い */
  | { type: 'slot-character'; slotIndex: number; character: CharacterIndexEntry | undefined }
  /** 一覧のニケ（CharacterTrayItem） */
  | { type: 'tray-character'; character: CharacterIndexEntry }
  /** 選んでいない編成の行のスロット（PartyPreviewRow）。空のスロットも持ち上げられ、character が無い */
  | { type: 'party-character'; partyIndex: number; slotIndex: number; character: CharacterIndexEntry | undefined }
  /** 行の左の編成の番号（PartyRowLabel） */
  | { type: 'party-label'; partyIndex: number };

/** 離す所の data（useDroppable の data）: スロット（ModernSlotCard）・選んでいない編成のスロット（PartyPreviewRow）・ニケ一覧（CharacterTray） */
export type OverDragData =
  | { type: 'slot'; slotIndex: number }
  | { type: 'party-slot'; partyIndex: number; slotIndex: number }
  /** 行の左の編成の番号（PartyRowLabel） */
  | { type: 'party-label'; partyIndex: number }
  | { type: 'tray' };

/**
 * dnd-kit の data（Active・Over の data.current）に型を付け直す。中身は確かめない（形は作る側の satisfies か useDropAndDrag の引数の型が保つ。
 * 型に無い形の data は、dropIntentOf では何もしない）
 */
export const activeDragData = (data: Data | undefined) => data as ActiveDragData | undefined;
const overDragData = (data: Data | undefined) => data as OverDragData | undefined;

export type DropIntent =
  /** 何もしない（離した所が無い・受けない所・同じスロット） */
  | { kind: 'none' }
  /** そのスロットを操作キャラにする（印は離した所で消え、元へ戻らない） */
  | { kind: 'controller'; index: number }
  /** スロットのニケを一覧へ戻し、そのスロットを空にする */
  | { kind: 'unplace'; index: number }
  /** 一覧のニケをスロットに置く（どこかのスロットにいるニケは置かない。placeCharacterAction） */
  | { kind: 'place'; character: CharacterIndexEntry; index: number }
  /** スロットどうしを入れ替える（空のスロットも） */
  | { kind: 'swap'; from: number; to: number }
  /** 一覧のニケを、選んでいない編成 party のスロット index に置く（選んでいる編成は変えない） */
  | { kind: 'place-party'; character: CharacterIndexEntry; party: number; index: number }
  /**
   * 編成の行をまたいで、持ち上げたスロット from の中身を、落とした先のスロット to と入れ替える（いたニケは from へ。選んでいる編成は変えない）。
   * party が null のスロットは、選んでいる編成のスロット
   */
  | { kind: 'exchange'; from: SlotRef; to: SlotRef }
  /** 選んでいない編成 party のスロット index のニケを一覧へ戻し、そのスロットを空にする */
  | { kind: 'unplace-party'; party: number; index: number }
  /** 編成 a と b の中身を入れ替える（編成の番号を別の番号に落とした。選んでいる編成の番号は変えない） */
  | { kind: 'swap-parties'; a: number; b: number };

/** スロットの場所。party が null なら選んでいる編成（ドラッグの data は、選んでいる編成のスロットに編成の番号を持たない） */
export type SlotRef = { party: number | null; index: number };

const NONE: DropIntent = { kind: 'none' };

export function dropIntentOf(activeData: Data | undefined, overData: Data | undefined): DropIntent {
  const active = activeDragData(activeData);
  const over = overDragData(overData);
  if (!active || !over) return NONE;
  // 編成の番号は、別の番号に落としたときだけ入れ替える（番号にはほかのものを落とせない）
  if (active.type === 'party-label' || over.type === 'party-label') {
    return active.type === 'party-label' && over.type === 'party-label' && active.partyIndex !== over.partyIndex
      ? { kind: 'swap-parties', a: active.partyIndex, b: over.partyIndex }
      : NONE;
  }
  if (over.type === 'tray') {
    if (active.type === 'party-character')
      return active.character ? { kind: 'unplace-party', party: active.partyIndex, index: active.slotIndex } : NONE;
    return active.type === 'slot-character' && active.character ? { kind: 'unplace', index: active.slotIndex } : NONE;
  }
  // 選んでいない編成のスロットには、一覧のニケを置き、選んでいる編成・選んでいない編成のスロットと入れ替える（空のスロットも。操作の印は何もしない）
  if (over.type === 'party-slot') {
    const to = { party: over.partyIndex, index: over.slotIndex };
    if (active.type === 'tray-character')
      return { kind: 'place-party', character: active.character, party: over.partyIndex, index: over.slotIndex };
    if (active.type === 'slot-character')
      return { kind: 'exchange', from: { party: null, index: active.slotIndex }, to };
    if (active.type === 'party-character') {
      const same = active.partyIndex === to.party && active.slotIndex === to.index;
      return same ? NONE : { kind: 'exchange', from: { party: active.partyIndex, index: active.slotIndex }, to };
    }
    return NONE;
  }
  if (over.type !== 'slot') return NONE;
  const to = over.slotIndex;
  switch (active.type) {
    case 'controller':
      return { kind: 'controller', index: to };
    case 'tray-character':
      return { kind: 'place', character: active.character, index: to };
    case 'slot-character':
      return active.slotIndex === to ? NONE : { kind: 'swap', from: active.slotIndex, to };
    case 'party-character':
      return {
        kind: 'exchange',
        from: { party: active.partyIndex, index: active.slotIndex },
        to: { party: null, index: to },
      };
    default:
      return NONE;
  }
}
