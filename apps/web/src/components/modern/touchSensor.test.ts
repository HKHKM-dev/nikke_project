// @vitest-environment happy-dom
// タッチのドラッグのセンサー（touchSensor.ts）。持ち上げた指を identifier で追い、ほかの指の知らせでは動かない・終わらない。
// 持ち上げた指の離した知らせを取りこぼしても、ほかの指の知らせでその指がもう触れていないと分かれば取りやめる
import type { SensorProps } from '@dnd-kit/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TrackedTouchSensor, type TrackedTouchSensorOptions } from './touchSensor.ts';

type FakeTouch = { identifier: number; clientX: number; clientY: number };
const touch = (identifier: number, clientX: number, clientY: number): FakeTouch => ({ identifier, clientX, clientY });

function touchEvent(type: string, changed: FakeTouch[], touches: FakeTouch[]): Event {
  const event = new Event(type, { bubbles: true, cancelable: type !== 'touchend' && type !== 'touchcancel' });
  Object.defineProperty(event, 'changedTouches', { value: changed });
  // 本物の TouchEvent の touches はプロトタイプの getter なので、センサーが上書きできるよう configurable にする
  Object.defineProperty(event, 'touches', { value: touches, configurable: true });
  return event;
}

let target: HTMLElement;
let calls: string[];
let props: SensorProps<TrackedTouchSensorOptions>;

/** 指 0 で target に触れてセンサーを作る */
function begin() {
  const start = touchEvent('touchstart', [touch(0, 100, 100)], [touch(0, 100, 100)]);
  target.dispatchEvent(start);
  props = {
    active: 'a',
    activeNode: {} as never,
    event: start,
    context: {} as never,
    options: { delay: 250, tolerance: 8 },
    onAbort: () => calls.push('abort'),
    onPending: () => calls.push('pending'),
    onStart: (c) => calls.push(`start ${c.x},${c.y}`),
    onMove: (c) => calls.push(`move ${c.x},${c.y}`),
    onEnd: () => calls.push('end'),
    onCancel: () => calls.push('cancel'),
  };
  new TrackedTouchSensor(props);
}

beforeEach(() => {
  vi.useFakeTimers();
  target = document.createElement('div');
  document.body.appendChild(target);
  calls = [];
});
afterEach(() => {
  // 終えていないセンサーを Esc で取りやめ、次のテストの知らせを受けないようにする
  document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
  vi.runAllTimers();
  vi.useRealTimers();
  target.remove();
});

describe('TrackedTouchSensor', () => {
  it('長押しで持ち上げ、持ち上げた指の位置で動かし、その指を離したら終える', () => {
    begin();
    vi.advanceTimersByTime(250);
    expect(calls).toEqual(['pending', 'start 100,100']);
    // ほかの指（1）が先に触れていても、位置は持ち上げた指（0）から取る
    target.dispatchEvent(touchEvent('touchmove', [touch(0, 150, 160)], [touch(1, 5, 5), touch(0, 150, 160)]));
    expect(calls.at(-1)).toBe('move 150,160');
    target.dispatchEvent(touchEvent('touchend', [touch(0, 150, 160)], [touch(1, 5, 5)]));
    expect(calls.at(-1)).toBe('end');
  });

  it('ほかの指の動き・離した知らせでは、動かさず終えない', () => {
    begin();
    vi.advanceTimersByTime(250);
    window.dispatchEvent(touchEvent('touchmove', [touch(1, 300, 300)], [touch(0, 100, 100), touch(1, 300, 300)]));
    window.dispatchEvent(touchEvent('touchend', [touch(1, 300, 300)], [touch(0, 100, 100)]));
    expect(calls).toEqual(['pending', 'start 100,100']);
  });

  it('持ち上げた後のほかの指の動きは、ブラウザーに渡さず、1 本ならその分だけ画面をスクロールする（2 本はズームなので動かさない）', () => {
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
    begin();
    // 持ち上げる前のほかの指の動きは、ブラウザーに任せる
    window.dispatchEvent(touchEvent('touchstart', [touch(1, 300, 300)], [touch(0, 100, 100), touch(1, 300, 300)]));
    const early = touchEvent('touchmove', [touch(1, 300, 302)], [touch(0, 100, 100), touch(1, 300, 302)]);
    window.dispatchEvent(early);
    expect(early.defaultPrevented).toBe(false);
    vi.advanceTimersByTime(250);
    const move = touchEvent('touchmove', [touch(1, 300, 270)], [touch(0, 100, 100), touch(1, 300, 270)]);
    window.dispatchEvent(move);
    expect(move.defaultPrevented).toBe(true);
    expect(scrollBy).toHaveBeenLastCalledWith(0, 32);
    // 2 本目が触れたら（ズーム）、止めるだけで動かさない
    window.dispatchEvent(
      touchEvent('touchstart', [touch(2, 200, 300)], [touch(0, 100, 100), touch(1, 300, 270), touch(2, 200, 300)]),
    );
    const pinch = touchEvent(
      'touchmove',
      [touch(1, 320, 270), touch(2, 180, 300)],
      [touch(0, 100, 100), touch(1, 320, 270), touch(2, 180, 300)],
    );
    window.dispatchEvent(pinch);
    expect(pinch.defaultPrevented).toBe(true);
    expect(scrollBy).toHaveBeenCalledTimes(1);
    // ズームの指を離せば、残った 1 本でまたスクロールする
    window.dispatchEvent(touchEvent('touchend', [touch(2, 180, 300)], [touch(0, 100, 100), touch(1, 320, 270)]));
    window.dispatchEvent(touchEvent('touchmove', [touch(1, 320, 280)], [touch(0, 100, 100), touch(1, 320, 280)]));
    expect(scrollBy).toHaveBeenLastCalledWith(0, -10);
    expect(calls.filter((c) => c.startsWith('move'))).toEqual([]);
    scrollBy.mockRestore();
  });

  it('持ち上げる前に tolerance より動いたら取りやめる（スクロール）', () => {
    begin();
    target.dispatchEvent(touchEvent('touchmove', [touch(0, 100, 120)], [touch(0, 100, 120)]));
    vi.advanceTimersByTime(250);
    expect(calls).toEqual(['pending', 'abort', 'cancel']);
  });

  it('持ち上げた指の離した知らせを取りこぼしても、ほかの指の知らせでその指がいないと分かれば取りやめる', () => {
    begin();
    vi.advanceTimersByTime(250);
    // 指 0 の touchend が届かないまま、新しい指（2）が触れた（touches に指 0 がいない）
    window.dispatchEvent(touchEvent('touchstart', [touch(2, 50, 50)], [touch(2, 50, 50)]));
    expect(calls.at(-1)).toBe('cancel');
  });

  it('持ち上げた後は、離した直後のクリックを止める', () => {
    begin();
    vi.advanceTimersByTime(250);
    target.dispatchEvent(touchEvent('touchend', [touch(0, 100, 100)], []));
    const clicked = vi.fn();
    target.addEventListener('click', clicked);
    target.dispatchEvent(new Event('click', { bubbles: true }));
    expect(clicked).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    target.dispatchEvent(new Event('click', { bubbles: true }));
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it('始めの知らせの touches を、触れた指だけにする（dnd-kit が落とす先の判定に 1 本目の位置を使う）', () => {
    const activator = TrackedTouchSensor.activators[0]!;
    const nativeEvent = touchEvent('touchstart', [touch(3, 10, 20)], [touch(1, 5, 5), touch(3, 10, 20)]);
    expect(activator.handler({ nativeEvent }, props?.options, { active: {} as never })).toBe(true);
    expect((nativeEvent as TouchEvent).touches[0]!.identifier).toBe(3);
    const two = touchEvent('touchstart', [touch(4, 0, 0), touch(5, 0, 0)], [touch(4, 0, 0), touch(5, 0, 0)]);
    expect(activator.handler({ nativeEvent: two }, props?.options, { active: {} as never })).toBe(false);
  });
});
