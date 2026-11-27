// モダン UI のタッチのドラッグのセンサー。長押し（delay）で持ち上げ、それまでに tolerance より動いたらスクロールにする。
// 持ち上げた指を identifier で追う。dnd-kit の TouchSensor は、触れている指の数（touches）で持ち上げを始めるかを決め、
// 指の位置を touches の 1 本目から取り、離した知らせを触れた要素でだけ待つ。Android の Chrome では、持ち上げている間に
// 2 本目の指で画面をスクロールした後、再読み込みまで長押しで持ち上げられなくなることがあった（オーナーの報告）。
// ここでは指の数を見ず、持ち上げた指の知らせだけを使い、その指の離した知らせを取りこぼしても、ほかの指の知らせで
// その指がもう触れていないと分かった時点で取りやめる。
// 持ち上げている間のほかの指の動きは、ブラウザーに渡さず、ここで画面をスクロールする。渡すと、ブラウザーがその指で
// スクロールやズームを始め、そこからは持ち上げた指の動きも止められず（touchmove が cancelable でなくなる）、
// 持ち上げた指を動かすと画面ごと動いた（オーナーの報告。持ち上げたままズームした後）。ズームは持ち上げている間はしない。
// 実機（Android の Chrome）では touchmove を止めても、持ち上げた指とほかの指の動きがズームになった（オーナーの報告）。
// ブラウザーは、指が触れた時点の touch-action でその指にスクロール・ズームを許すかを決めるので、持ち上げている間は
// ページ全体の touch-action を none にし、新しく触れた指でブラウザーがスクロール・ズームを始めないようにする
import type { Sensor, SensorInstance, SensorProps } from '@dnd-kit/core';
import type { TouchEvent as ReactTouchEvent } from 'react';
import { touchLog } from '../../touchLog.ts';

export type TrackedTouchSensorOptions = {
  /** 長押しで持ち上げるまでの時間（ms） */
  delay: number;
  /** 持ち上げるまでに、これより動いたら（px）スクロールとみなして取りやめる */
  tolerance: number;
};

type Point = { x: number; y: number };

const TOUCH_EVENTS = ['touchstart', 'touchmove', 'touchend', 'touchcancel'] as const;

function findTouch(list: TouchList | undefined, id: number): Touch | undefined {
  if (!list) return undefined;
  for (let i = 0; i < list.length; i++) if (list[i]!.identifier === id) return list[i];
  return undefined;
}

const stopClick = (event: Event) => event.stopPropagation();
const preventDefault = (event: Event) => event.preventDefault();

class TrackedTouchSensorImpl implements SensorInstance {
  autoScrollEnabled = true;
  private readonly props: SensorProps<TrackedTouchSensorOptions>;
  private readonly touchId: number;
  private readonly initial: Point;
  /** 触れた要素（要素が消えても知らせはここに届くので、window とは別に聞く） */
  private readonly target: EventTarget | null;
  private activated = false;
  private done = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** 持ち上げる前のページの touch-action（持ち上げている間は none にし、終えたら戻す） */
  private touchActionBefore: string | null = null;
  /** ほかの指の前の位置（持ち上げている間、その指の動きの分だけ画面をスクロールする） */
  private readonly others = new Map<number, Point>();
  /** 持ち上げ前から付けるリスナー（終えたら外す） */
  private readonly listeners = new AbortController();
  /** 持ち上げた後に付ける、離した直後のクリックと文字の選択を止めるリスナー（終えて少し後に外す） */
  private readonly afterStart = new AbortController();
  /** window（capture）と触れた要素の両方で受けるので、同じ知らせを 2 度扱わない */
  private lastEvent: Event | null = null;

  constructor(props: SensorProps<TrackedTouchSensorOptions>) {
    this.props = props;
    const touch = (props.event as TouchEvent).changedTouches[0]!;
    this.touchId = touch.identifier;
    this.initial = { x: touch.clientX, y: touch.clientY };
    this.target = props.event.target;
    const { signal } = this.listeners;
    for (const name of TOUCH_EVENTS) {
      window.addEventListener(name, this.onTouch, { capture: true, passive: false, signal });
      if (name !== 'touchstart') this.target?.addEventListener(name, this.onTouch, { passive: false, signal });
    }
    window.addEventListener('resize', this.cancel, { signal });
    window.addEventListener('dragstart', preventDefault, { signal });
    window.addEventListener('visibilitychange', this.cancel, { signal });
    window.addEventListener('contextmenu', preventDefault, { signal });
    document.addEventListener('keydown', this.onKeydown, { signal });
    touchLog(`センサー 指${this.touchId}`);
    this.timer = setTimeout(this.start, props.options.delay);
    props.onPending(props.active, props.options, this.initial);
  }

  private readonly onTouch = (event: Event) => {
    if (this.done || event === this.lastEvent) return;
    this.lastEvent = event;
    const { changedTouches, touches } = event as TouchEvent;
    const own = findTouch(changedTouches, this.touchId);
    // ほかの指の知らせ。持ち上げた指がもう触れていなければ、その指の離した知らせを取りこぼしたので取りやめる
    if (!own && !findTouch(touches, this.touchId)) {
      this.finish('cancel', '指がいない');
      return;
    }
    // 持ち上げた指とほかの指が一緒に動くと、1 つの知らせに両方が入るので、ほかの指の動きも見る
    this.onOtherFingers(event as TouchEvent);
    if (own) {
      if (event.type === 'touchmove') this.move(event, own);
      else if (event.type === 'touchend') this.finish('end', '離した');
      // 離した知らせ（touchcancel）か、同じ identifier の指が新しく触れた（前の指の離した知らせを取りこぼした）
      else this.finish('cancel', event.type);
    }
  };

  /** ほかの指の知らせ。持ち上げた後は、その指の動きをブラウザーに渡さず、1 本ならその分だけ画面をスクロールする（2 本以上はズームなので動かさない） */
  private onOtherFingers(event: TouchEvent) {
    let dx = 0;
    let dy = 0;
    const { changedTouches } = event;
    for (let i = 0; i < changedTouches.length; i++) {
      const touch = changedTouches[i]!;
      if (touch.identifier === this.touchId) continue;
      const point = { x: touch.clientX, y: touch.clientY };
      const last = this.others.get(touch.identifier);
      if (event.type === 'touchend' || event.type === 'touchcancel') this.others.delete(touch.identifier);
      else this.others.set(touch.identifier, point);
      if (event.type === 'touchmove' && last) {
        dx += last.x - point.x;
        dy += last.y - point.y;
      }
    }
    // 持ち上げる前に始まったブラウザーのスクロールは止められない（cancelable でない）ので、二重に動かさない
    if (!this.activated || event.type !== 'touchmove' || !event.cancelable) return;
    event.preventDefault();
    if (this.others.size === 1 && (dx !== 0 || dy !== 0)) window.scrollBy(dx, dy);
  }

  private move(event: Event, touch: Touch) {
    const point = { x: touch.clientX, y: touch.clientY };
    const offset = { x: this.initial.x - point.x, y: this.initial.y - point.y };
    if (!this.activated) {
      if (Math.hypot(offset.x, offset.y) > this.props.options.tolerance) this.finish('cancel', '動いた');
      else this.props.onPending(this.props.active, this.props.options, this.initial, offset);
      return;
    }
    if (event.cancelable) event.preventDefault();
    this.props.onMove(point);
  }

  private readonly start = () => {
    this.timer = null;
    if (this.done) return;
    this.activated = true;
    // 持ち上げた後は、離した後に届くクリックと文字の選択を止める（dnd-kit の TouchSensor と同じ）
    const { signal } = this.afterStart;
    document.addEventListener('click', stopClick, { capture: true, signal });
    document.getSelection()?.removeAllRanges();
    document.addEventListener('selectionchange', this.removeSelection, { signal });
    const root = document.documentElement.style;
    this.touchActionBefore = root.touchAction;
    root.touchAction = 'none';
    touchLog('持ち上げ');
    this.props.onStart(this.initial);
  };

  private readonly removeSelection = () => document.getSelection()?.removeAllRanges();

  private readonly cancel = (event: Event) => this.finish('cancel', event.type);

  private readonly onKeydown = (event: KeyboardEvent) => {
    if (event.code === 'Escape') this.finish('cancel', 'Esc');
  };

  /** reason は ?touchlog の記録に書く終わった理由 */
  private finish(kind: 'end' | 'cancel', reason: string) {
    if (this.done) return;
    this.done = true;
    touchLog(`センサー終わり ${kind} ${reason}${this.activated ? '' : '（持ち上げ前）'}`);
    if (this.timer !== null) clearTimeout(this.timer);
    this.listeners.abort();
    if (this.touchActionBefore !== null) document.documentElement.style.touchAction = this.touchActionBefore;
    // 離した直後に届くクリックまで止めてから外す
    setTimeout(() => this.afterStart.abort(), 50);
    if (!this.activated) this.props.onAbort(this.props.active);
    if (kind === 'end') this.props.onEnd();
    else this.props.onCancel();
  }
}

const noop = () => {};

export const TrackedTouchSensor: Sensor<TrackedTouchSensorOptions> = Object.assign(TrackedTouchSensorImpl, {
  activators: [
    {
      eventName: 'onTouchStart' as const,
      // 新しく触れた指が 1 本のときに始める（ほかの指が触れていても始める）
      // dnd-kit は、ほかのドラッグが続いている（終わりを受けていない）か、知らせが preventDefault 済みなら、これを呼ばない。
      // ?touchlog の記録で、触れたのにこの行が無ければ、そのどちらかで持ち上げられていない
      handler: ({ nativeEvent }: ReactTouchEvent) => {
        touchLog(`始まりの判定 指${nativeEvent.changedTouches[0]?.identifier} ${nativeEvent.changedTouches.length}本`);
        if (nativeEvent.changedTouches.length !== 1) return false;
        // dnd-kit は落とす先の判定に、始めの知らせ（activatorEvent）の touches の 1 本目の位置を使う。
        // ほかの指（離したのに数え続けられている指も）が 1 本目に来ないよう、この知らせの touches をこの指だけにする
        Object.defineProperty(nativeEvent, 'touches', { value: nativeEvent.changedTouches, configurable: true });
        return true;
      },
    },
  ],
  setup() {
    // iOS の Safari で、後から付けた touchmove の preventDefault を効かせるため、passive でない touchmove を window に付けておく
    window.addEventListener('touchmove', noop, { passive: false });
    return () => window.removeEventListener('touchmove', noop);
  },
});
