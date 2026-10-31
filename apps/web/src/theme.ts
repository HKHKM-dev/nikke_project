// 画面のテーマ（ライト・ダーク・システム）。右上の設定のメニューで切り替え、ブラウザに保存する。
// ルート要素の data-app-theme で color-scheme を決める（styles.css）。システムは属性を外し、OS（アーティファクトの表示枠では
// 閲覧側のテーマ）に従う。data-theme は表示枠が使うので、ぶつからないように別の名前にした
import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'nikke-calc.theme';

export const THEME_LABEL: Record<Theme, string> = { light: 'ライト', dark: 'ダーク', system: 'システム' };

export function parseTheme(value: string | null): Theme {
  return value === 'light' || value === 'dark' ? value : 'system';
}

function readTheme(): Theme {
  try {
    return parseTheme(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return 'system';
  }
}

export function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(readTheme);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-app-theme');
    else root.setAttribute('data-app-theme', theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // プライベートモード等で保存できないときは、この画面の間だけ効かせる
    }
  }, [theme]);
  return [theme, setTheme];
}
