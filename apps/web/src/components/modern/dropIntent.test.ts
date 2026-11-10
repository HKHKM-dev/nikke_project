// モダン UI のドラッグを離したときの判定（dropIntent.ts）。持ち上げたもの × 離した所の組ごとに、何をするかを確かめる
import type { CharacterIndexEntry } from '@nikke/core';
import { describe, expect, it } from 'vitest';
import { dropIntentOf, type ActiveDragData, type OverDragData } from './dropIntent.ts';

const nikke = { resourceId: 10 } as CharacterIndexEntry;
const slot = (slotIndex: number): OverDragData => ({ type: 'slot', slotIndex });
const TRAY: OverDragData = { type: 'tray' };
const controller: ActiveDragData = { type: 'controller', slotIndex: 2 };
const slotNikke = (slotIndex: number): ActiveDragData => ({ type: 'slot-character', slotIndex, character: nikke });
const emptySlot = (slotIndex: number): ActiveDragData => ({ type: 'slot-character', slotIndex, character: undefined });
const trayNikke: ActiveDragData = { type: 'tray-character', character: nikke };

describe('dropIntentOf', () => {
  it('離した所が無ければ何もしない', () => {
    expect(dropIntentOf(controller, undefined)).toEqual({ kind: 'none' });
    expect(dropIntentOf(trayNikke, undefined)).toEqual({ kind: 'none' });
    expect(dropIntentOf(undefined, slot(0))).toEqual({ kind: 'none' });
  });

  it('操作の印をスロットに離すと、そのスロットを操作キャラにする', () => {
    expect(dropIntentOf(controller, slot(0))).toEqual({ kind: 'controller', index: 0 });
    // 元のスロットに離しても同じ（reducer が同じ値なら何もしない）
    expect(dropIntentOf(controller, slot(2))).toEqual({ kind: 'controller', index: 2 });
  });

  it('操作の印を一覧に離しても何もしない', () => {
    expect(dropIntentOf(controller, TRAY)).toEqual({ kind: 'none' });
  });

  it('スロットのニケを一覧に離すと、そのスロットを空にする。空のスロットは何もしない', () => {
    expect(dropIntentOf(slotNikke(3), TRAY)).toEqual({ kind: 'unplace', index: 3 });
    expect(dropIntentOf(emptySlot(3), TRAY)).toEqual({ kind: 'none' });
  });

  it('一覧のニケをスロットに離すと置く。一覧に戻しても何もしない', () => {
    expect(dropIntentOf(trayNikke, slot(1))).toEqual({ kind: 'place', character: nikke, index: 1 });
    expect(dropIntentOf(trayNikke, TRAY)).toEqual({ kind: 'none' });
  });

  it('スロットを別のスロットに離すと入れ替える（空のスロットも）。同じスロットは何もしない', () => {
    expect(dropIntentOf(slotNikke(0), slot(4))).toEqual({ kind: 'swap', from: 0, to: 4 });
    expect(dropIntentOf(emptySlot(4), slot(0))).toEqual({ kind: 'swap', from: 4, to: 0 });
    expect(dropIntentOf(slotNikke(2), slot(2))).toEqual({ kind: 'none' });
  });
});
