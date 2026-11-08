// ニケ一覧（モダン UI のトレイ）の立ち絵の形: 四角（顔の絵）か縦長（スロットと同じ縦長の絵を一覧の幅に縮めたもの）。選んだ形はブラウザに覚える
import { useState } from 'react';
import { readStorage, writeStorage } from './storage.ts';

export type TrayShape = 'square' | 'tall';

export const TRAY_SHAPE_STORAGE_KEY = 'nikke-calc.trayShape';

export const TRAY_SHAPE_LABEL: Record<TrayShape, string> = { square: '四角', tall: '縦長' };

/** 覚えた形を読む（無い・読めないときは四角） */
export function parseTrayShape(v: string | null): TrayShape {
  return v === 'tall' ? 'tall' : 'square';
}

/** いまの形と、四角と縦長を切り替える関数（切り替えた形はブラウザに覚える） */
export function useTrayShape(): [TrayShape, () => void] {
  const [shape, setShape] = useState(() => parseTrayShape(readStorage(TRAY_SHAPE_STORAGE_KEY)));
  const toggle = () => {
    const next: TrayShape = shape === 'tall' ? 'square' : 'tall';
    setShape(next);
    writeStorage(TRAY_SHAPE_STORAGE_KEY, next);
  };
  return [shape, toggle];
}
