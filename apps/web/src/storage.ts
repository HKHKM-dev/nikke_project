// ブラウザの保存（localStorage）。プライベートモード等で使えないときは、読むと null・書くと何もしない（その画面の間だけ効かせる）
export function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** 書けたか。書けないとき（使えない・満杯）は false */
export function writeStorage(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // 消せないときは黙って諦める
  }
}

/** prefix で始まるキー。使えないときは空 */
export function storageKeys(prefix: string): string[] {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix)) keys.push(key);
    }
    return keys;
  } catch {
    return [];
  }
}

/** 保存の読み書き（テストで差し替える） */
export type SaveStore = {
  read: (key: string) => string | null;
  write: (key: string, value: string) => boolean;
  remove: (key: string) => void;
  keys: (prefix: string) => string[];
};

export const BROWSER_STORE: SaveStore = {
  read: readStorage,
  write: writeStorage,
  remove: removeStorage,
  keys: storageKeys,
};
