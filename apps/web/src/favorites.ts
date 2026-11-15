// ニケのお気に入り（育成・設定の窓の main_○○ のバッジ 5 種）。ニケ（resourceId）ごとに押したバッジを持ち、ブラウザに覚える
import { createContext, useCallback, useState } from 'react';
import { readStorage, writeStorage } from './storage.ts';

export const FAVORITE_MARKS = ['star', 'spade', 'heart', 'diamond', 'club'] as const;
export type FavoriteMark = (typeof FAVORITE_MARKS)[number];

/** バッジの名前（ボタンの読み上げと、マウスを載せたときの知らせ） */
export const FAVORITE_LABEL: Record<FavoriteMark, string> = {
  star: 'スター',
  spade: 'スペード',
  heart: 'ハート',
  diamond: 'ダイヤ',
  club: 'クラブ',
};

/** ニケ（resourceId の文字列）ごとの押したバッジ（FAVORITE_MARKS の順）。どれも押していないニケは持たない */
export type Favorites = Readonly<Record<string, readonly FavoriteMark[]>>;

export const FAVORITES_STORAGE_KEY = 'nikke-calc.favorites.v1';

/** 覚えたお気に入りを読む。読めない値・知らないバッジは捨てる */
export function parseFavorites(raw: string | null): Favorites {
  if (raw === null) return {};
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return {};
  const out: Record<string, FavoriteMark[]> = {};
  for (const [id, marks] of Object.entries(data)) {
    if (!Array.isArray(marks)) continue;
    const kept = FAVORITE_MARKS.filter((m) => marks.includes(m));
    if (kept.length > 0) out[id] = kept;
  }
  return out;
}

/** そのニケのバッジを 1 つ押す（押してあれば外す） */
export function toggleFavorite(favorites: Favorites, resourceId: number, mark: FavoriteMark): Favorites {
  const key = String(resourceId);
  const current = favorites[key] ?? [];
  const next = current.includes(mark)
    ? current.filter((m) => m !== mark)
    : FAVORITE_MARKS.filter((m) => m === mark || current.includes(m));
  const { [key]: _, ...rest } = favorites;
  return next.length > 0 ? { ...rest, [key]: next } : rest;
}

export function favoriteMarksOf(favorites: Favorites, resourceId: number): readonly FavoriteMark[] {
  return favorites[String(resourceId)] ?? [];
}

/** 立ち絵（CharacterVisual）がバッジを出すために読む。モダン UI（ModernView）だけが渡す */
export const FavoritesContext = createContext<Favorites>({});

/** いまのお気に入りと、バッジを押す関数（押した結果はブラウザに覚える） */
export function useFavorites(): [Favorites, (resourceId: number, mark: FavoriteMark) => void] {
  const [favorites, setFavorites] = useState(() => parseFavorites(readStorage(FAVORITES_STORAGE_KEY)));
  const toggle = useCallback((resourceId: number, mark: FavoriteMark) => {
    setFavorites((prev) => {
      const next = toggleFavorite(prev, resourceId, mark);
      writeStorage(FAVORITES_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);
  return [favorites, toggle];
}
