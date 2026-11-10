// モダン UI のドラッグを離したときに何をするか（ModernView の handleDragEnd）。持ち上げたもの（active）と離した所（over）の
// dnd-kit の data だけから決める純関数。アニメーション・DOM の読みと dispatch は ModernView が行う
import type { CharacterIndexEntry } from '@nikke/core';

/**
 * ドラッグの data。持ち上げるもの: 操作の印（ModernSlotCard の type 'controller'）・スロットのニケ（'slot-character'。空のスロットは
 * character なし）・一覧のニケ（CharacterTrayItem の 'tray-character'）。離す所: スロット（slotIndex）・ニケ一覧（CharacterTray の 'tray'）
 */
export type DragData = Record<string, unknown> | undefined;

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

export function dropIntentOf(active: DragData, over: DragData | null): DropIntent {
  if (!active || !over) return NONE;
  const slotIndex = typeof over.slotIndex === 'number' ? over.slotIndex : null;
  if (active.type === 'controller') return slotIndex === null ? NONE : { kind: 'controller', index: slotIndex };
  if (over.type === 'tray') {
    return active.type === 'slot-character' && active.character && typeof active.slotIndex === 'number'
      ? { kind: 'unplace', index: active.slotIndex }
      : NONE;
  }
  if (slotIndex === null) return NONE;
  if (active.type === 'tray-character' && active.character) {
    return { kind: 'place', character: active.character as CharacterIndexEntry, index: slotIndex };
  }
  if (active.type === 'slot-character' && typeof active.slotIndex === 'number' && active.slotIndex !== slotIndex) {
    return { kind: 'swap', from: active.slotIndex, to: slotIndex };
  }
  return NONE;
}
