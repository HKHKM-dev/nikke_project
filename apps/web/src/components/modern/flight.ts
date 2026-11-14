// スロットとニケ一覧の間を立ち絵が動くアニメーション（置く・外す・入れ替える）。動くのは立ち絵の枠の写しで、本物の上に重ねて動かし、
// 着いたら消す。どれも同じ長さ・動き方（離したときの DragOverlay の動きとそろえる。ModernView の DROP_ANIMATION）
import { slotSizeVars } from './useSlotFit.ts';

/** 動く時間（ms）と動き方 */
const FLIGHT = { duration: 250, easing: 'ease', fill: 'forwards' } as const;

/**
 * アニメーションで動かす立ち絵の枠の写し。立ち絵の画像は遅延読み込み・非同期の描画（CharacterVisual）なので、写しのままだと
 * 動き始めの数フレームは画像が空で、立ち絵の枠（明るい背景と枠線）だけが白い枠のように見える。写しの画像はすぐ読んで描く
 */
export function cloneForAnimation(node: Element): HTMLElement {
  const copy = node.cloneNode(true) as HTMLElement;
  for (const img of copy.querySelectorAll('img')) {
    img.loading = 'eager';
    img.decoding = 'sync';
  }
  return copy;
}

/**
 * 要素の中の画像を描ける状態にする（デコードを済ませる）。着くまで隠すスロット（modern-slot-arriving）の新しい画像は
 * 描かれずデコードもされない。画像は非同期の描画（decoding="async"）なので、そのまま隠しを外すと最初のフレームは画像が空で、
 * 立ち絵の枠（明るい背景と枠線）だけが白い枠のように見える。隠しを外すのは、これが済んでから。
 * 画面の外のスロットの画像は遅延読み込み（loading="lazy"）で読まれず、デコードが終わらないので、DECODE_WAIT_MS で待つのをやめる
 */
const DECODE_WAIT_MS = 500;
export function decodeImages(node: Element): Promise<void> {
  const decoded = Promise.all([...node.querySelectorAll('img')].map((img) => img.decode().catch(() => undefined)));
  return Promise.race([decoded, new Promise((resolve) => setTimeout(resolve, DECODE_WAIT_MS))]).then(() => undefined);
}

/** スロット（カード）→ そこへ動いている写しを、いま消して本物に切り替える関数 */
const arrivals = new WeakMap<Element, () => void>();

/** スロットへ動いている写しを、着くのを待たずに消す（そのスロットから外す・別のニケが入るとき） */
export function stopArrival(card: Element | null): void {
  if (card) arrivals.get(card)?.();
}

/** 切り抜きで、下のほかの 3 辺に見せる枠の外（影など）の幅（px） */
const CLIP_OUTSET = 40;
/** 位置と大きさ（DOMRect のうち frameAt が読むもの） */
type Box = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>;

/**
 * base の位置・大きさに置いた立ち絵の写しを、rect の位置・大きさに見せるキーフレーム。幅をそろえて縮め、rect が写しより横長なら
 * （ニケ一覧の四角の絵）、写しの上から rect の形の分だけを残して下を切る（顔のある上の部分を四角に切り抜く）。
 * 写しのほうが横長なら、切らずに上下の中央をそろえる。切るのは下だけで、ほかの 3 辺は枠の外（影など）も見せる（CLIP_OUTSET）。
 * 大きさの無い rect（配置されていない要素）は、base のまま動かさない
 */
export function frameAt(target: Box, base: Box): Keyframe {
  const rect = target.width > 0 && target.height > 0 ? target : base;
  const scale = rect.width / base.width;
  const shown = Math.min(base.height, rect.height / scale);
  const top = rect.top + (rect.height - shown * scale) / 2;
  return {
    transform: `translate(${rect.left - base.left}px, ${top - base.top}px) scale(${scale})`,
    clipPath:
      shown < base.height
        ? `inset(-${CLIP_OUTSET}px -${CLIP_OUTSET}px ${base.height - shown}px -${CLIP_OUTSET}px)`
        : `inset(-${CLIP_OUTSET}px)`,
  };
}

/** node の写しを、いまの node の位置・大きさで画面に重ねる */
function ghostOf(node: Element, base: DOMRect): HTMLElement {
  const ghost = cloneForAnimation(node);
  // スロットの立ち絵は並びの幅で縮む（useSlotFit）。写しを置く body の外でも同じ大きさにする
  for (const [name, value] of Object.entries(slotSizeVars(node))) ghost.style.setProperty(name, value);
  Object.assign(ghost.style, {
    position: 'fixed',
    left: `${base.left}px`,
    top: `${base.top}px`,
    width: `${base.width}px`,
    height: `${base.height}px`,
    margin: '0',
    transformOrigin: 'top left',
    zIndex: '9999',
    pointerEvents: 'none',
  });
  document.body.appendChild(ghost);
  return ghost;
}

/**
 * スロット（card）に入ったニケの立ち絵の枠を、from の位置・大きさから、スロットの中へ動かす（一覧から置いた・持ち上げて落とした・
 * 入れ替えた）。着くまでスロットの立ち絵の枠は隠し、着いたら、スロットの画像が描ける（ready）まで写しをその場に残してから本物に切り替える。
 * 返す関数は、着くのを待たずに切り替える。同じスロットへ前に動いていた写しは、先に消す（後から来たものだけが着く）
 */
export function flyIntoSlot(from: DOMRect, card: Element): () => void {
  const content = card.querySelector('.modern-slot-char-area');
  if (!content) return () => undefined;
  stopArrival(card);
  const ready = decodeImages(card);
  const base = content.getBoundingClientRect();
  const ghost = ghostOf(content, base);
  card.classList.add('modern-slot-arriving');
  // 隠しを外すのは、このスロットへ動いている写しがこれのときだけ（後から別の写しが来ていれば、それが外す）
  const remove = () => {
    ghost.remove();
    if (arrivals.get(card) !== remove) return;
    arrivals.delete(card);
    card.classList.remove('modern-slot-arriving');
  };
  arrivals.set(card, remove);
  let finished = false;
  const done = () => {
    if (finished) return;
    finished = true;
    void ready.then(remove);
  };
  ghost.animate([frameAt(from, base), frameAt(base, base)], FLIGHT).finished.then(done, done);
  return done;
}

/**
 * 外したニケの立ち絵の枠（content。外す前のスロットか持ち上げた絵）を、その位置から一覧のそのニケの絵（to）へ動かし、
 * 少し薄くして消す（一覧の絵が四角なら、四角に切り抜きながら動かす。frameAt）。一覧に出ていない（絞り込みで外れた）ときは、その場で縮めながら消す
 */
export function flyToTray(content: Element, to: DOMRect | null): void {
  const base = content.getBoundingClientRect();
  const end =
    to ?? new DOMRect(base.left + base.width * 0.1, base.top + base.height * 0.1, base.width * 0.8, base.height * 0.8);
  const ghost = ghostOf(content, base);
  const remove = () => ghost.remove();
  ghost
    .animate(
      [
        { ...frameAt(base, base), opacity: 1 },
        { ...frameAt(end, base), opacity: to ? 0.6 : 0 },
      ],
      FLIGHT,
    )
    .finished.then(remove, remove);
}

/**
 * 操作の印を、離した位置（from。持ち上げた印の箱）から、移した先のスロット（card。描き直しの後に引く）の印の場所へ滑り込ませる。
 * 印は描き直しの後に移した先へ出るので、印が出た描画で、その印を離した位置から元の場所へ動かす（出るまで CONTROLLER_WAIT_FRAMES の描画まで待つ）
 */
const CONTROLLER_WAIT_FRAMES = 5;
export function flyControllerInto(
  from: DOMRect,
  card: () => Element | null,
  framesLeft = CONTROLLER_WAIT_FRAMES,
): void {
  requestAnimationFrame(() => {
    const icon = card()?.querySelector('.modern-slot-focus-handle');
    if (!icon) {
      if (framesLeft > 1) flyControllerInto(from, card, framesLeft - 1);
      return;
    }
    const to = icon.getBoundingClientRect();
    icon.animate(
      [{ transform: `translate(${from.left - to.left}px, ${from.top - to.top}px)` }, { transform: 'none' }],
      { duration: FLIGHT.duration, easing: FLIGHT.easing },
    );
  });
}
