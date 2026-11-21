// モダン UI のスロットと一覧の間のドラッグで、離したときのアニメーション（DragOverlay の dropAnimation）と、その材料
import { defaultDropAnimationSideEffects, type DropAnimation } from '@dnd-kit/core';
import { FLIGHT, LIFT_SHADOW_SOURCES, fadeArrivalFace } from './flight.ts';

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
    : (document.querySelectorAll<HTMLElement>('.modern-slots-grid:not(.modern-party-preview) > .modern-slot-card')[
        index
      ] ?? null);

/** 編成 party（0 から。選んでいる編成も）の行の、スロット index のカード（無ければ null）。行は編成の番号の順に並ぶ（ModernView） */
export const partyCardAt = (party: number, index: number) =>
  document.querySelectorAll('.modern-party-row')[party]?.querySelectorAll<HTMLElement>('.modern-slot-card')[index] ??
  null;

/** 離したときのアニメーション。行き先が決まらなかったときだけ、持ち上げた絵をドラッグ元へ戻す */
export const DROP_ANIMATION: DropAnimation = {
  // 長さは flight.ts の動きと同じ（空のスロットの枠を透明にする fadeArrivalFace も、この長さで動く）
  duration: FLIGHT.duration,
  // 行き先が決まったとき（dropPlaced）は動かさない（始めと終わりが同じなら、dnd-kit はアニメーションをしない）
  keyframes: ({ transform: { initial, final } }) => {
    const at = (t: typeof initial) => ({
      transform: `translate3d(${t.x}px, ${t.y}px, 0) scaleX(${t.scaleX}) scaleY(${t.scaleY})`,
    });
    return [at(initial), at(dropPlaced ? initial : final)];
  },
  // 元のスロットへ戻るときは、着くときと同じく、元の場所に出している空のスロットの枠を動きの後半で少しずつ透明にする。
  // 持ち上げた影は、戻るにつれて少しずつ薄くする。影を薄くしたアニメーションは終わりに取り消さない（取り消すと、持ち上げた絵が
  // 消えるまでの 1 描画だけ影が元の濃さで出る。持ち上げた絵は戻った後に消えるので、そのままでよい）
  sideEffects: (params) => {
    const cleanup = returnSideEffects(params);
    const fade = dropPlaced ? null : fadeArrivalFace(params.active.node);
    const shadow = params.dragOverlay.node.querySelector(LIFT_SHADOW_SOURCES);
    if (!dropPlaced)
      shadow?.animate([{ boxShadow: getComputedStyle(shadow).boxShadow }, { boxShadow: 'none' }], {
        duration: FLIGHT.duration,
        easing: FLIGHT.easing,
        fill: 'forwards',
      });
    return () => {
      cleanup?.();
      fade?.cancel();
    };
  },
};
