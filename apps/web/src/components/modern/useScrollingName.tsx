// 枠に収まらない名前を、右から左へ一定の速さで流し続ける（名前を 2 つ並べ、1 つ分と間だけ動かしてループをつなぐ）。
// スロットと一覧の縦長の絵に重ねる名前（ModernSlotCard.tsx の SlotCharName）と、一覧の四角の絵の下の名前（CharacterTrayItem.tsx）が使う。
// 見た目は styles.css の .scrolling-name
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

/** 名前が流れる速さ（px/秒）と、ループでつながる 2 つの名前の間（px。styles.css の .scrolling-name-track の margin と同じ） */
const NAME_SCROLL_SPEED = 40;
const NAME_SCROLL_GAP = 32;

/** 枠ごとの測り直し。一覧は 200 体ほどあるので、ResizeObserver は全部の枠で 1 つを使う */
const remeasure = new Map<Element, () => void>();
let sharedObserver: ResizeObserver | null = null;
function observe(box: Element, measure: () => void): () => void {
  sharedObserver ??= new ResizeObserver((entries) => {
    for (const entry of entries) remeasure.get(entry.target)?.();
  });
  remeasure.set(box, measure);
  sharedObserver.observe(box);
  return () => {
    remeasure.delete(box);
    sharedObserver?.unobserve(box);
  };
}

/** 枠（boxRef）に scrollClass と style を付け、中に track を置く */
export function useScrollingName<T extends HTMLElement>(
  name: string,
): { boxRef: React.RefObject<T | null>; scrollClass: string; style: CSSProperties; track: ReactNode } {
  const boxRef = useRef<T>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [textWidth, setTextWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const box = boxRef.current;
    const text = textRef.current;
    if (!box || !text) return;
    const measure = () => {
      const style = getComputedStyle(box);
      const room = box.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const width = text.getBoundingClientRect().width;
      setTextWidth(width > room ? width : null);
    };
    // 描く前に 1 度測る（ResizeObserver の最初の通知は描いた後に届くので、待つと流れない名前が 1 度見える）
    measure();
    return observe(box, measure);
  }, [name]);
  const shift = textWidth === null ? 0 : textWidth + NAME_SCROLL_GAP;
  return {
    boxRef,
    scrollClass: textWidth !== null ? 'scrolling-name' : '',
    style: {
      '--name-shift': `${shift}px`,
      '--name-duration': `${shift / NAME_SCROLL_SPEED}s`,
    } as CSSProperties,
    track: (
      <span className="scrolling-name-track">
        <span ref={textRef}>{name}</span>
        {textWidth !== null && <span aria-hidden="true">{name}</span>}
      </span>
    ),
  };
}
