// ブラウザの保存（localStorage）。プライベートモード等で使えないときは、読むと null・書くと何もしない（その画面の間だけ効かせる）
export function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 保存できないときは黙って諦める
  }
}
