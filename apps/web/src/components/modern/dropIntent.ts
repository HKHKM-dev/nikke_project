// モダン UI のドラッグの data の形と、離したときに何をするか（ModernView の handleDragEnd）。持ち上げたもの（active）と離した所（over）の
// dnd-kit の data だけから決める純関数。アニメーション・DOM の読みと dispatch は ModernView が行う
import type { Data } from '@dnd-kit/core';
import type { CharacterIndexEntry } from '@nikke/core';

/** 持ち上げるものの data（useDraggable の data。作る側は satisfies でこの形にそろえる） */
export type ActiveDragData =
  /** 操作の印（ModernSlotCard） */
  | { type: 'controller'; slotIndex: number }
  /** スロットのニケ（ModernSlotCard）。空のスロットも持ち上げられ、character が無い */
  | { type: 'slot-character'; slotIndex: number; character: CharacterIndexEntry | undefined }
  /** 一覧のニケ（CharacterTrayItem） */
  | { type: 'tray-character'; character: CharacterIndexEntry };

/** 離す所の data（useDroppable の data）: スロット（ModernSlotCard）・ニケ一覧（CharacterTray） */
export type OverDragData = { type: 'slot'; slotIndex: number } | { type: 'tray' };

/** dnd-kit の data（Active・Over の data.current）を、作る側がそろえた形として読む */
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
  | { kind: 'swap'; from: number; to: number };

const NONE: DropIntent = { kind: 'none' };

export function dropIntentOf(activeData: Data | undefined, overData: Data | undefined): DropIntent {
  const active = activeDragData(activeData);
  const over = overDragData(overData);
  if (!active || !over) return NONE;
  if (over.type === 'tray') {
    return active.type === 'slot-character' && active.character ? { kind: 'unplace', index: active.slotIndex } : NONE;
  }
  const to = over.slotIndex;
  switch (active.type) {
    case 'controller':
      return { kind: 'controller', index: to };
    case 'tray-character':
      return { kind: 'place', character: active.character, index: to };
    case 'slot-character':
      return active.slotIndex === to ? NONE : { kind: 'swap', from: active.slotIndex, to };
  }
}
