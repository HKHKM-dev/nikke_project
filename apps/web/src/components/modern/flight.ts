// スロットとニケ一覧の間を立ち絵が動くアニメーション（置く・外す・入れ替える）。動くのは立ち絵の枠の写しで、本物の上に重ねて動かし、
// 着いたら消す。どれも同じ長さ・動き方（離したときの DragOverlay の動きとそろえる。ModernView の DROP_ANIMATION）

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
 * 立ち絵の枠（明るい背景と枠線）だけが白い枠のように見える。隠しを外すのは、これが済んでから
 */
export function decodeImages(node: Element): Promise<void> {
  return Promise.all([...node.querySelectorAll('img')].map((img) => img.decode().catch(() => undefined))).then(
    () => undefined,
  );
}

/** base の位置・大きさに置いた要素を、rect の位置・大きさ（幅で縮め、中心をそろえる）に見せる transform */
function transformTo(rect: DOMRect, base: DOMRect): string {
  const dx = rect.left + rect.width / 2 - (base.left + base.width / 2);
  const dy = rect.top + rect.height / 2 - (base.top + base.height / 2);
  return `translate(${dx}px, ${dy}px) scale(${rect.width / base.width})`;
}

/** node の写しを、いまの node の位置・大きさで画面に重ねる */
function ghostOf(node: Element, base: DOMRect): HTMLElement {
  const ghost = cloneForAnimation(node);
  Object.assign(ghost.style, {
    position: 'fixed',
    left: `${base.left}px`,
    top: `${base.top}px`,
    width: `${base.width}px`,
    height: `${base.height}px`,
    margin: '0',
    transformOrigin: 'center',
    zIndex: '9999',
    pointerEvents: 'none',
  });
  document.body.appendChild(ghost);
  return ghost;
}

/**
 * スロット（card）に入ったニケの立ち絵の枠を、from の位置・大きさから、スロットの中へ動かす（一覧から置いた・持ち上げて落とした・
 * 入れ替えた）。着くまでスロットの立ち絵の枠は隠し、着いたら、スロットの画像が描ける（ready）まで写しをその場に残してから本物に切り替える。
 * 返す関数は、着くのを待たずに切り替える
 */
export function flyIntoSlot(from: DOMRect, card: Element, ready: Promise<void> = decodeImages(card)): () => void {
  const content = card.querySelector('.modern-slot-char-area');
  if (!content) return () => undefined;
  const base = content.getBoundingClientRect();
  const ghost = ghostOf(content, base);
  card.classList.add('modern-slot-arriving');
  let finished = false;
  const done = () => {
    if (finished) return;
    finished = true;
    void ready.then(() => {
      ghost.remove();
      card.classList.remove('modern-slot-arriving');
    });
  };
  ghost.animate([{ transform: transformTo(from, base) }, { transform: 'none' }], FLIGHT).finished.then(done, done);
  return done;
}

/**
 * 外したニケの立ち絵の枠（content。外す前のスロットか持ち上げた絵）を、from（無ければ content の位置）から一覧のそのニケの絵（to）へ動かし、
 * 着く前に薄くして消す（一覧の絵は四角のこともあり、形が違う）。一覧に出ていない（絞り込みで外れた）ときは、その場で縮めながら消す
 */
export function flyToTray(content: Element, from: DOMRect | null, to: DOMRect | null): void {
  const base = content.getBoundingClientRect();
  const start = from ?? base;
  const end =
    to ??
    new DOMRect(start.left + start.width * 0.1, start.top + start.height * 0.1, start.width * 0.8, start.height * 0.8);
  const ghost = ghostOf(content, base);
  const remove = () => ghost.remove();
  ghost
    .animate(
      [
        { transform: transformTo(start, base), opacity: 1 },
        { transform: transformTo(end, base), opacity: to ? 0.6 : 0, offset: 1 },
      ],
      FLIGHT,
    )
    .finished.then(remove, remove);
}
