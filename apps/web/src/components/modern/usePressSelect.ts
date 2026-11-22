// 編成の番号・選んでいない編成の行を、マウスやペンでは押した瞬間に選ぶ。切り替えのアニメーション中は、行と番号が動いている。
// 押してから離すまでに押した物が動くと click が起きず、続けて切り替えようとすると効かないことがあるため、click を待たない
import { useRef, type MouseEvent, type PointerEvent } from 'react';

export function usePressSelect(onSelect: () => void): {
  onPointerDown: (event: PointerEvent) => void;
  onClick: (event: MouseEvent) => void;
} {
  /** 押した瞬間に選び終えたか。続いて起きる click では、もう一度選ばない */
  const handled = useRef(false);
  return {
    onPointerDown: (event) => {
      handled.current = event.button === 0 && (event.pointerType === 'mouse' || event.pointerType === 'pen');
      if (handled.current) onSelect();
    },
    onClick: (event) => {
      // キーボードの操作（detail が 0）と、タッチは、click で選ぶ
      if (event.detail !== 0 && handled.current) {
        handled.current = false;
        return;
      }
      onSelect();
    },
  };
}
