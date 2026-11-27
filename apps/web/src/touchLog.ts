// タッチの知らせを画面の下に書き出す（実機でしか起きないタッチの不具合を調べるため）。URL に ?touchlog を付けたとき（か、VITE_TOUCHLOG=1 で作ったとき）だけ動く。
// 1 行は「経過秒 知らせ 変わった指[identifier] 触れている指[identifier] c=cancelable P=preventDefault 済み 触れた要素」。
// 続けて届いた同じ形の touchmove は 1 行にまとめて回数を付ける。ページの処理が終わった後（window の bubble）の値を書く。
// 触れた要素が消えていて window まで届かなかった知らせは「window に届かず」と書く
// 確かめ用のアーティファクト（claude.ai の中に埋め込まれ、URL の ?touchlog が届かない）には、VITE_TOUCHLOG=1 で作ると初めから出す
const enabled =
  import.meta.env.VITE_TOUCHLOG === '1' ||
  (typeof location !== 'undefined' && new URLSearchParams(location.search).has('touchlog'));

const MAX_LINES = 40;
const lines: string[] = [];
let box: HTMLElement | null = null;
let lastMoveKey: string | null = null;
let lastMoveCount = 0;
const startedAt = typeof performance !== 'undefined' ? performance.now() : 0;

function render() {
  if (!box) {
    box = document.createElement('div');
    box.setAttribute('aria-hidden', 'true');
    Object.assign(box.style, {
      position: 'fixed',
      left: '0',
      bottom: '0',
      zIndex: '2147483647',
      maxWidth: '100vw',
      maxHeight: '45vh',
      overflow: 'hidden',
      padding: '2px 4px',
      font: '10px/1.25 monospace',
      whiteSpace: 'pre',
      color: '#fff',
      background: 'rgba(0, 0, 0, 0.75)',
      pointerEvents: 'none',
    });
    document.body.appendChild(box);
  }
  box.textContent = lines.join('\n');
}

function push(line: string) {
  const seconds = ((performance.now() - startedAt) / 1000).toFixed(2);
  lines.push(`${seconds} ${line}`);
  if (lines.length > MAX_LINES) lines.shift();
  lastMoveKey = null;
  render();
}

/** ほかの処理（タッチのセンサーなど）の出来事を書く。?touchlog が無いときは何もしない */
export function touchLog(message: string) {
  if (enabled) push(`  ${message}`);
}

function ids(list: TouchList) {
  return Array.from(list, (t) => t.identifier).join(',');
}

function targetName(target: EventTarget | null) {
  if (!(target instanceof Element)) return '-';
  const cls = typeof target.className === 'string' ? target.className.split(' ')[0] : '';
  return `${target.tagName.toLowerCase()}${cls ? `.${cls}` : ''}`;
}

function describe(event: TouchEvent, note = '') {
  const name = event.type.replace('touch', '');
  const flags = `${event.cancelable ? 'c' : '-'}${event.defaultPrevented ? 'P' : '-'}`;
  const key = `${name} [${ids(event.changedTouches)}] [${ids(event.touches)}] ${flags}`;
  if (name === 'move' && !note) {
    if (key === lastMoveKey) {
      lastMoveCount++;
      lines[lines.length - 1] = lines[lines.length - 1]!.replace(/ ×\d+$/, '') + ` ×${lastMoveCount}`;
      render();
      return;
    }
    push(key);
    lastMoveKey = key;
    lastMoveCount = 1;
    return;
  }
  push(`${key}${name === 'start' ? ` ${targetName(event.target)}` : ''}${note}`);
}

/** ?touchlog が付いていれば、タッチの知らせを書き出し始める */
export function installTouchLog() {
  if (!enabled) return;
  // capture で受けた知らせが bubble で window まで届いたかを見る
  let pending: TouchEvent | null = null;
  const flush = () => {
    if (pending) describe(pending, ' window に届かず');
    pending = null;
  };
  for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel'] as const) {
    window.addEventListener(
      type,
      (event) => {
        flush();
        pending = event;
      },
      { capture: true, passive: true },
    );
    window.addEventListener(
      type,
      (event) => {
        if (pending === event) pending = null;
        describe(event);
      },
      { passive: true },
    );
  }
  window.addEventListener(
    'pointercancel',
    (event) => push(`pointercancel ${event.pointerType} ${event.pointerId}`),
    true,
  );
  window.addEventListener('contextmenu', () => push('contextmenu'), true);
  document.addEventListener('visibilitychange', () => push(`visibility ${document.visibilityState}`));
  let scale = window.visualViewport?.scale ?? 1;
  window.visualViewport?.addEventListener('resize', () => {
    const next = window.visualViewport!.scale;
    if (Math.abs(next - scale) > 0.01) push(`ズーム ${scale.toFixed(2)} → ${next.toFixed(2)}`);
    scale = next;
  });
  push(`touchlog 開始 ${navigator.userAgent.replace(/^.*?(Chrome\/[\d.]+).*$/, '$1')}`);
}
