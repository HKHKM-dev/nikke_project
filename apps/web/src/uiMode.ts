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

  useEffect(() => {
    writeStorage(UI_MODE_STORAGE_KEY, mode);
  }, [mode]);

  return [mode, setMode];
}
