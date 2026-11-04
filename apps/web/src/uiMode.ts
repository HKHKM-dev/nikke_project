import { useEffect, useState } from 'react';
import { readStorage, writeStorage } from './storage.ts';

export type UiMode = 'classic' | 'modern';

export const UI_MODE_STORAGE_KEY = 'nikke-calc.ui-mode';

export const UI_MODE_LABEL: Record<UiMode, string> = {
  classic: 'クラシック',
  modern: 'モダン',
};

export function parseUiMode(value: string | null): UiMode {
  return value === 'modern' ? 'modern' : 'classic';
}

export function useUiMode(): [UiMode, (mode: UiMode) => void] {
  const [mode, setMode] = useState<UiMode>(() => parseUiMode(readStorage(UI_MODE_STORAGE_KEY)));

  // モダンのときはルート要素に data-app-ui="modern" を付け、modern.css（ページの背景と部品の色・形）を効かせる
  useEffect(() => {
    writeStorage(UI_MODE_STORAGE_KEY, mode);
    if (mode === 'modern') document.documentElement.setAttribute('data-app-ui', 'modern');
    else document.documentElement.removeAttribute('data-app-ui');
  }, [mode]);

  return [mode, setMode];
}
