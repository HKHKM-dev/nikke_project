// @vitest-environment happy-dom
// 置く先を待っている間の入力の止め方（useAwaitingPlacement.ts）: スロットのほかを押すと部品は反応せず、クリックで待つのをやめる。
// 待っている印の付いたスロットは止めない
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAwaitingPlacement } from './useAwaitingPlacement.ts';

const TYPES = ['pointerdown', 'mousedown', 'click'] as const;

/** document の下に要素を置く（className を付ける） */
function place(className = ''): HTMLElement {
  const el = document.createElement('div');
  el.className = className;
  const child = document.createElement('span');
  el.appendChild(child);
  document.body.appendChild(el);
  return child;
}

/** target に type を出し、既定の動きを止められたかと、要素の聞き手に届いたかを返す */
function fire(target: Element, type: string) {
  const reached = vi.fn();
  target.addEventListener(type, reached);
  const event = new MouseEvent(type, { bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  target.removeEventListener(type, reached);
  return { prevented: event.defaultPrevented, reached: reached.mock.calls.length > 0 };
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe('useAwaitingPlacement', () => {
  it('blocks presses outside the awaiting slots and cancels on click', () => {
    const cancel = vi.fn();
    renderHook(() => useAwaitingPlacement(true, cancel));
    const outside = place('tray-item');
    for (const type of TYPES) expect(fire(outside, type)).toEqual({ prevented: true, reached: false });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('lets presses on an awaiting slot through without cancelling', () => {
    const cancel = vi.fn();
    renderHook(() => useAwaitingPlacement(true, cancel));
    const slot = place('modern-slot-card modern-slot-awaiting');
    for (const type of TYPES) expect(fire(slot, type)).toEqual({ prevented: false, reached: true });
    expect(cancel).not.toHaveBeenCalled();
  });

  it('does nothing while not awaiting, and stops blocking when the awaiting ends', () => {
    const cancel = vi.fn();
    const { rerender } = renderHook(({ awaiting }) => useAwaitingPlacement(awaiting, cancel), {
      initialProps: { awaiting: false },
    });
    const outside = place();
    expect(fire(outside, 'click')).toEqual({ prevented: false, reached: true });
    rerender({ awaiting: true });
    expect(fire(outside, 'click')).toEqual({ prevented: true, reached: false });
    rerender({ awaiting: false });
    expect(fire(outside, 'click')).toEqual({ prevented: false, reached: true });
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
