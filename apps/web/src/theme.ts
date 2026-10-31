// 画面のテーマ（ライト・ダーク・システム）。右上の設定のメニューで切り替え、ブラウザに保存する。
// 画面の色はルート要素の data-app-theme で決まるテーマの変数（styles.css の --app-bg・--app-fg）で決め、入力欄などの部品の色は
// ルート要素の style の color-scheme（!important）で決める。アーティファクトの表示枠は閲覧側のテーマをルート要素に強く当てるので、
// スタイルシートの color-scheme だけでは負ける（ライトに切り替わらなかった）。
// システムは両方を外し、OS（表示枠では閲覧側のテーマ）に従う。data-theme は表示枠が使うので、ぶつからないように別の名前にした
import { useEffect, useState } from 'react';
import { readStorage, writeStorage } from './storage.ts';

export type Theme = 'light' | 'dark' | 'system';

const THEME_STORAGE_KEY = 'nikke-calc.theme';

export const THEME_LABEL: Record<Theme, string> = { light: 'ライト', dark: 'ダーク', system: 'システム' };

export function parseTheme(value: string | null): Theme {
  return value === 'light' || value === 'dark' ? value : 'system';
}

/** 上書きする前のルート要素の style の color-scheme（表示枠が当てたもの）。システムに戻すときに元へ戻す */
let hostColorScheme: { value: string; priority: string } | null = null;

export function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() => parseTheme(readStorage(THEME_STORAGE_KEY)));
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') {
      root.removeAttribute('data-app-theme');
      if (hostColorScheme !== null) {
        if (hostColorScheme.value === '') root.style.removeProperty('color-scheme');
        else root.style.setProperty('color-scheme', hostColorScheme.value, hostColorScheme.priority);
        hostColorScheme = null;
      }
    } else {
      if (hostColorScheme === null) {
        hostColorScheme = {
          value: root.style.getPropertyValue('color-scheme'),
          priority: root.style.getPropertyPriority('color-scheme'),
        };
      }
      root.setAttribute('data-app-theme', theme);
      root.style.setProperty('color-scheme', theme, 'important');
    }
    writeStorage(THEME_STORAGE_KEY, theme);
  }, [theme]);
  return [theme, setTheme];
}
