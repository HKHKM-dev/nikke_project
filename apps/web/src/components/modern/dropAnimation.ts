// モダン UI のスロットと一覧の間のドラッグで、離したときのアニメーション（DragOverlay の dropAnimation）と、その材料
import { defaultDropAnimationSideEffects, type DropAnimation } from '@dnd-kit/core';
import { cloneForAnimation, decodeImages, flyIntoSlot } from './flight.ts';

/**
 * 離したときのアニメーション。dnd-kit の既定は、戻る間ドラッグ元（スロットのカード・一覧の項目）を透明にして消すので、
 * 代わりに印（drag-source-returning）を付け、ドラッグ中と同じ薄さで残す（styles.css）
 */
const returnSideEffects = defaultDropAnimationSideEffects({ className: { active: 'drag-source-returning' } });

/** 離したドロップの結果（useSlotDrag がドラッグの始めに戻し、終わりに決める。DROP_ANIMATION が読む） */
const dropState: { targetIndex: number | null; placed: boolean } = {
  // スロットどうしを入れ替えた先のスロット（入れ替えていなければ null）
  targetIndex: null,
  // 持ち上げたものの行き先が決まった（一覧のニケをスロットに置いた・スロットのニケを一覧へ戻して外した）。元へ戻るアニメーションはしない
  placed: false,
};

/** 離したドロップの結果を書く（ドロップの処理から、描画の外の dropState を書き換える） */
export function setDropState(next: Partial<typeof dropState>): void {
  Object.assign(dropState, next);
}

/** スロット index のカード（無ければ null） */
export const slotCardAt = (index: number | null) =>
  index === null
    ? null
    : (document.querySelectorAll<HTMLElement>('.modern-slots-grid > .modern-slot-card')[index] ?? null);

/**
 * 入れ替えたときは、ドラッグ元へ戻っていく絵を、ドラッグ元に新しく入ったもの（空のスロット・入れ替わったニケ）の絵に差し替える
 * （持ち上げたニケの絵のままだと、そのニケがドラッグ元へ戻るように見える）。持ち上げたもの（動かした側）は、離した位置から
 * 落とした先のスロットへ滑り込ませる（flyIntoSlot）。どちらも着くまで行き先の絵は隠す（modern-slot-arriving）
 */
export const DROP_ANIMATION: DropAnimation = {
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
