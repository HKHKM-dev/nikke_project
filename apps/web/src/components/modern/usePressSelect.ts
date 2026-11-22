// 編成の番号・選んでいない編成の行を、マウスやペンでは離した瞬間に選ぶ。切り替えのアニメーション中は、行と番号が動いている。
// 押してから離すまでに押した物が動くと click が起きず、続けて切り替えようとすると効かないことがあるため、click を待たない
// （押した物の上で離したかは問わない）。押した位置から動かして離したときは、持ち上げた（ドラッグ）ので選ばない
import { useLayoutEffect, useRef, type MouseEvent, type PointerEvent } from 'react';
import { DRAG_START_DISTANCE } from './dropIntent.ts';

export function usePressSelect(onSelect: () => void): {
  onPointerDown: (event: PointerEvent) => void;
  onClick: (event: MouseEvent) => void;
} {
  const latest = useRef(onSelect);
  useLayoutEffect(() => {
    latest.current = onSelect;
  });
  /** 押したときにマウス・ペンで、離したときの処理を任せたか。続いて起きる click では、もう一度選ばない */
  const handled = useRef(false);
  return {
    onPointerDown: (event) => {
      handled.current = event.button === 0 && (event.pointerType === 'mouse' || event.pointerType === 'pen');
      if (!handled.current) return;
      const { clientX, clientY } = event;
      const done = (up: globalThis.PointerEvent) => {
        window.removeEventListener('pointerup', done, true);
        window.removeEventListener('pointercancel', done, true);
        if (up.type === 'pointerup' && Math.hypot(up.clientX - clientX, up.clientY - clientY) < DRAG_START_DISTANCE)
          latest.current();
      };
      window.addEventListener('pointerup', done, true);
      window.addEventListener('pointercancel', done, true);
    },
    onClick: (event) => {
      // キーボードの操作（detail が 0）と、タッチは、click で選ぶ
      if (event.detail !== 0 && handled.current) {
        handled.current = false;
        return;
      }
      latest.current();
    },
  };
}
