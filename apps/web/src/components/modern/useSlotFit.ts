// 編成のスロット 5 枚を、画面の幅に収めて 1 段に並べる。並びの幅が足りないときは、立ち絵の高さ（--slot-portrait-h。
// 元は 256px）を縮める。カードの左右の余白（padding）とカードどうしの間（gap）は縮めない（styles.css の値を読む）。
// 立ち絵の高さ（px）と、元の大きさとの比（--slot-scale。ダメージの欄・空のスロットの文字の大きさに掛ける）をこの並び
// （.modern-slots-grid）に置く。並びの外に写す絵（ドラッグ中の重ねる絵・動くアニメーションの写し）は、この値を写して同じ大きさにする
// （slotSizeVars）
import { useLayoutEffect, type RefObject } from 'react';

/** 立ち絵の高さの上限（元の絵 256×512 の 1/2） */
const PORTRAIT_MAX_H = 256;
/** 立ち絵の枠線（左右 1px ずつ） */
const PORTRAIT_BORDER_X = 2;

/** 並びの幅 width に count 枚を 1 段で収める立ち絵の高さ（偶数の px に切り下げる。上限 PORTRAIT_MAX_H） */
export function fitPortraitHeight(width: number, count: number, gap: number, cardPaddingX: number): number {
  const cardWidth = (width - gap * (count - 1)) / count;
  const h = 2 * (cardWidth - cardPaddingX - PORTRAIT_BORDER_X);
  return Math.max(0, Math.min(PORTRAIT_MAX_H, Math.floor(h / 2) * 2));
}

export function useSlotFit(gridRef: RefObject<HTMLElement | null>, count: number): void {
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const fit = () => {
      const card = grid.firstElementChild;
      if (!card) return;
      const gap = parseFloat(getComputedStyle(grid).columnGap) || 0;
      const cardStyle = getComputedStyle(card);
      const paddingX = (parseFloat(cardStyle.paddingLeft) || 0) + (parseFloat(cardStyle.paddingRight) || 0);
      const h = fitPortraitHeight(grid.clientWidth, count, gap, paddingX);
      grid.style.setProperty('--slot-portrait-h', `${h}px`);
      grid.style.setProperty('--slot-scale', String(h / PORTRAIT_MAX_H));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [gridRef, count]);
}

/** スロットの大きさを決める変数 */
const SLOT_SIZE_VARS = ['--slot-portrait-h', '--slot-scale'] as const;

/** node（スロットの中の要素）のいまのスロットの大きさの変数（並びの外に写す絵の style に置く。値の無いものは入れない） */
export function slotSizeVars(node: Element): Record<string, string> {
  const style = getComputedStyle(node);
  const vars: Record<string, string> = {};
  for (const name of SLOT_SIZE_VARS) {
    const value = style.getPropertyValue(name).trim();
    if (value) vars[name] = value;
  }
  return vars;
}
