// テスト用: React のフックを、DOM の無い node の環境で本物の React（react-dom/client）に回させる。部品は null を描くだけなので、
// container には、React がルートの container に読むもの（要素の名前・イベントの受け口・フォーカスを探す窓）だけを持たせる。
// React は更新の優先度に window.event を読むので、テストは window を置く（vi.stubGlobal）。テスト（*.test.ts）からだけ読む
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

function fakeContainer(): Element {
  const listeners = { addEventListener() {}, removeEventListener() {} };
  // コミットの前に、フォーカスのある要素を窓の document から探す（iframe の中は辿らない）
  const defaultView = { document: { activeElement: null, body: null }, HTMLIFrameElement: class {} };
  const ownerDocument = { nodeType: 9, defaultView, ...listeners };
  return {
    nodeType: 1,
    nodeName: 'DIV',
    tagName: 'DIV',
    textContent: '',
    ownerDocument,
    ...listeners,
  } as unknown as Element;
}

type HookHandle<T, P> = {
  /** いちばん新しい描画の戻り値 */
  readonly current: T;
  /** 引数を替えて描き直す */
  rerender: (props: P) => Promise<void>;
};

const actGlobal = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
/** 描いたルート（cleanupHooks で外す） */
const roots: Root[] = [];

/** フック hook を props で描く。状態の更新と効果（useEffect）は act の中で流す。テストの後に cleanupHooks を呼ぶ */
export async function renderHook<T, P>(hook: (props: P) => T, props: P): Promise<HookHandle<T, P>> {
  actGlobal.IS_REACT_ACT_ENVIRONMENT = true;
  let current: T | undefined;
  const Probe = (p: { props: P }) => {
    current = hook(p.props);
    return null;
  };
  const root = createRoot(fakeContainer());
  roots.push(root);
  const render = (next: P) =>
    act(async () => {
      root.render(createElement(Probe, { props: next }));
    });
  await render(props);
  return {
    get current() {
      return current as T;
    },
    rerender: render,
  };
}

/** 描いたルートを全部外し（効果の後片付けも回る）、act の環境の印を戻す */
export async function cleanupHooks(): Promise<void> {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  delete actGlobal.IS_REACT_ACT_ENVIRONMENT;
}

/** 保留中の Promise（ファイルや表の読み込みの then）と、それが起こす更新を流す */
export function flush(): Promise<void> {
  return act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** localStorage の代わり（Map） */
export function memoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (key) => void map.delete(key),
    setItem: (key, value) => void map.set(key, String(value)),
  };
}
