// 右上の設定の「詳細情報表示」。ON のときだけ、総ダメージのほかのダメージの詳細（内訳・ニケごとの詳細・検証用の詳細）を出す。
// 既定は OFF。ブラウザに保存する
import { useState } from 'react';
import { readStorage, writeStorage } from './storage.ts';

const DETAILED_STORAGE_KEY = 'nikke-calc.detailed';

export function useDetailed(): [boolean, (detailed: boolean) => void] {
  const [detailed, setDetailedState] = useState(() => readStorage(DETAILED_STORAGE_KEY) === 'true');
  const setDetailed = (next: boolean) => {
    setDetailedState(next);
    writeStorage(DETAILED_STORAGE_KEY, String(next));
  };
  return [detailed, setDetailed];
}
