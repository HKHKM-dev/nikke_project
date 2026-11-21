// 編成のスロット 5 枚を、画面の幅に収めて 1 段に並べる。並びの幅が足りないときは、立ち絵の高さ（--slot-portrait-h。
// 元はニケ一覧の四角の絵と同じ 256/3 px。絵は正方形で、幅も同じ）を縮めてモダンの画面（.modern-view-container。無ければこの並び .modern-slots-grid）に置く。ニケ一覧の行に元の大きさの絵が
// TRAY_COLUMNS 枚入らないときは、画面に data-tray-fit を付け、一覧の絵をスロットの立ち絵と同じ幅にして 1 行に TRAY_COLUMNS 枚並べる（styles.css）。
// ダメージの欄・空のスロットの文字は、この高さから文字の大きさを決める（styles.css）。カードの左右の余白（padding）とカードどうしの間（gap）は縮めない（styles.css の値を読む）。
// 並びの外に写す絵（ドラッグ中の重ねる絵・動くアニメーションの写し）は、この値を写して同じ大きさにする（slotSizeVars）
import { useLayoutEffect, type RefObject } from 'react';

/** 絵の高さ（＝幅）の上限（顔の絵 128×128 の 2/3 で、ニケ一覧の四角の絵と同じ。styles.css の :root の --slot-portrait-h と同じ） */
export const PORTRAIT_MAX_H = 256 / 3;
/** 立ち絵の枠線（左右 1px ずつ） */
const PORTRAIT_BORDER_X = 2;
const SLOT_SIZE_VAR = '--slot-portrait-h';
/** ニケ一覧の 1 行の枚数（スロットの数とそろえる）と、元の絵の幅（枠線込み。styles.css の :root の --tray-visual-w と同じ）・項目の左右の余白 */
const TRAY_COLUMNS = 5;
const TRAY_VISUAL_W = 256 / 3 + 2;
const TRAY_ITEM_PADDING_X = 4;

/** 並びの幅 width に count 枚を 1 段で収める立ち絵の高さ（上限 PORTRAIT_MAX_H。縮めるときは偶数の px に切り下げる） */
export function fitPortraitHeight(width: number, count: number, gap: number, cardPaddingX: number): number {
  if (count <= 0) return PORTRAIT_MAX_H;
  const cardWidth = (width - gap * (count - 1)) / count;
  const h = cardWidth - cardPaddingX - PORTRAIT_BORDER_X;
  // 上限（端数のある 512/3）まで入るなら上限のまま（偶数に切り下げると、入るのに上限より小さくなる）
  if (h >= PORTRAIT_MAX_H) return PORTRAIT_MAX_H;
  return Math.max(0, Math.floor(h / 2) * 2);
}

/**
 * 並びの大きさを見張る。remountKey は並びの要素を作り直す鍵（選んでいる編成。編成を選ぶと、並びが別の行に作り直されるので見張り直す）
 */
export function useSlotFit(gridRef: RefObject<HTMLElement | null>, count: number, remountKey: unknown = null): void {
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    // 並びの高さだけが変わったとき（立ち絵を縮めた直後・ダメージの値の更新など）は、値が同じなので書き直さない
    let last = '';
    const fit = () => {
      const card = grid.firstElementChild;
      if (!card) return;
      const scope = grid.closest<HTMLElement>('.modern-view-container') ?? grid;
      // ニケ一覧の行（内容の幅）に元の大きさの絵が TRAY_COLUMNS 枚入らないときだけ、一覧をスロットの並びに合わせて縮める
      const list = scope.querySelector('.char-tray-list');
      if (list) {
        const listStyle = getComputedStyle(list);
        const inner =
          list.clientWidth - (parseFloat(listStyle.paddingLeft) || 0) - (parseFloat(listStyle.paddingRight) || 0);
        scope.toggleAttribute('data-tray-fit', inner < TRAY_COLUMNS * (TRAY_VISUAL_W + TRAY_ITEM_PADDING_X));
      }
      // 端数の幅（拡大率など）で clientWidth が切り上がると 1 段に収まらないので、実際の幅を切り下げて使う
      const width = Math.floor(grid.getBoundingClientRect().width);
      const gap = parseFloat(getComputedStyle(grid).columnGap) || 0;
      const cardStyle = getComputedStyle(card);
      const paddingX = (parseFloat(cardStyle.paddingLeft) || 0) + (parseFloat(cardStyle.paddingRight) || 0);
      const value = `${fitPortraitHeight(width, count, gap, paddingX)}px`;
      if (value === last) return;
      last = value;
      scope.style.setProperty(SLOT_SIZE_VAR, value);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(grid);
    return () => observer.disconnect();
    // remountKey は中では読まないが、変わったら見張り直す
  }, [gridRef, count, remountKey]);
}

/** node のいまのスロットの大きさの変数（並びの外に写す絵の style に置く。並びの外の node では :root の元の大きさ） */
export function slotSizeVars(node: Element): Record<string, string> {
  const value = getComputedStyle(node).getPropertyValue(SLOT_SIZE_VAR).trim();
  return value ? { [SLOT_SIZE_VAR]: value } : {};
}
