// 右上の設定の「詳細情報表示」。ON のときだけ、総ダメージのほかのダメージの詳細（内訳・ニケごとの詳細・検証用の詳細）を出す。
// 既定は OFF。ブラウザに保存する（保存できないときはこの画面の間だけ効かせる）
import { useState } from 'react';

export const DETAILED_STORAGE_KEY = 'nikke-calc.detailed';

function readDetailed(): boolean {
  try {
    return localStorage.getItem(DETAILED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function useDetailed(): [boolean, (detailed: boolean) => void] {
  const [detailed, setDetailedState] = useState(readDetailed);
  const setDetailed = (next: boolean) => {
    setDetailedState(next);
    try {
      localStorage.setItem(DETAILED_STORAGE_KEY, String(next));
    } catch {
      // プライベートモード等で保存できないときは、この画面の間だけ効かせる
    }
  };
  return [detailed, setDetailed];
}
