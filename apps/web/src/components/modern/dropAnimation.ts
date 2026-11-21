// モダン UI のスロットと一覧の間のドラッグで、離したときのアニメーション（DragOverlay の dropAnimation）と、その材料
import { defaultDropAnimationSideEffects, type DropAnimation } from '@dnd-kit/core';
import { fadeArrivalFace } from './flight.ts';

/**
 * 離したときのアニメーション。dnd-kit の既定は、戻る間ドラッグ元（スロットのカード・一覧の項目）を透明にして消すので、
 * 代わりに印（drag-source-returning）を付け、ドラッグ中と同じく空のスロットの枠を出す（styles.css）
 */
const returnSideEffects = defaultDropAnimationSideEffects({ className: { active: 'drag-source-returning' } });

/**
 * 持ち上げたものの行き先が決まった（一覧のニケをスロットに置いた・スロットのニケを一覧へ戻して外した・スロットどうしを入れ替えた）。
 * 元へ戻るアニメーションはしない（行き先へは flight.ts で動かす）。useSlotDrag がドラッグの始めに戻し、終わりに決める。DROP_ANIMATION が読む
 */
let dropPlaced = false;

/** 行き先が決まったかを書く（ドロップの処理から、描画の外の dropPlaced を書き換える） */
export function setDropPlaced(placed: boolean): void {
  dropPlaced = placed;
}

/** スロット index のカード（無ければ null） */
export const slotCardAt = (index: number | null) =>
  index === null
    ? null
    : (document.querySelectorAll<HTMLElement>('.modern-slots-grid > .modern-slot-card')[index] ?? null);

/** 離したときのアニメーション。行き先が決まらなかったときだけ、持ち上げた絵をドラッグ元へ戻す */
export const DROP_ANIMATION: DropAnimation = {
  // 行き先が決まったとき（dropPlaced）は動かさない（始めと終わりが同じなら、dnd-kit はアニメーションをしない）
  keyframes: ({ transform: { initial, final } }) => {
    const at = (t: typeof initial) => ({
      transform: `translate3d(${t.x}px, ${t.y}px, 0) scaleX(${t.scaleX}) scaleY(${t.scaleY})`,
    });
    return [at(initial), at(dropPlaced ? initial : final)];
  },
  // 元のスロットへ戻るときは、着くときと同じく、元の場所に出している空のスロットの枠を動きの後半で少しずつ透明にする
  sideEffects: (params) => {
    const cleanup = returnSideEffects(params);
    const fade = dropPlaced ? null : fadeArrivalFace(params.active.node);
    return () => {
      cleanup?.();
      fade?.cancel();
    };
  },
};
