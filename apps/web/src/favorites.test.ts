import { describe, expect, it } from 'vitest';
import {
  FAVORITE_MARKS,
  favoriteMarksOf,
  filterByFavorites,
  parseFavorites,
  toggleFavorite,
  toggleFavoriteMark,
  type FavoriteMark,
  type Favorites,
} from './favorites.ts';

describe('favorites', () => {
  it('押すと付き、もう一度押すと外れる。どれも無くなったニケは消える', () => {
    const a = toggleFavorite({}, 10, 'heart');
    expect(a).toEqual({ '10': ['heart'] });
    const b = toggleFavorite(a, 10, 'star');
    expect(favoriteMarksOf(b, 10)).toEqual(['star', 'heart']);
    expect(toggleFavorite(toggleFavorite(b, 10, 'star'), 10, 'heart')).toEqual({});
  });

  it('読めない値・知らないバッジは捨てる', () => {
    expect(parseFavorites(null)).toEqual({});
    expect(parseFavorites('{')).toEqual({});
    expect(parseFavorites('[1]')).toEqual({});
    expect(parseFavorites('{"1":["club","x","star"],"2":"heart","3":[]}')).toEqual({ '1': ['star', 'club'] });
  });
});

describe('toggleFavoriteMark', () => {
  it('押した順によらず、並びは FAVORITE_MARKS の順に保つ', () => {
    let marks: readonly FavoriteMark[] = [];
    for (const mark of [...FAVORITE_MARKS].reverse()) marks = toggleFavoriteMark(marks, mark);
    expect(marks).toEqual(FAVORITE_MARKS);
    expect(toggleFavoriteMark(['club'], 'spade')).toEqual(['spade', 'club']);
    expect(toggleFavoriteMark(['star', 'diamond'], 'heart')).toEqual(['star', 'heart', 'diamond']);
  });

  it('押してあるバッジは外し、残りの並びはそのまま', () => {
    expect(toggleFavoriteMark(['star', 'heart', 'club'], 'heart')).toEqual(['star', 'club']);
    expect(toggleFavoriteMark(['heart'], 'heart')).toEqual([]);
  });
});

describe('filterByFavorites（ニケ一覧のお気に入りの絞り込み）', () => {
  const list = [1, 2, 3, 4].map((resourceId) => ({ resourceId }));
  const favorites: Favorites = { '1': ['star'], '2': ['heart', 'club'], '3': ['spade'] };

  it('押したバッジが空なら全部（並びも同じ）', () => {
    expect(filterByFavorites(list, favorites, [])).toBe(list);
  });

  it('押したバッジのどれかが付いたニケだけ（OR）。並びは元の一覧の順', () => {
    expect(filterByFavorites(list, favorites, ['star']).map((c) => c.resourceId)).toEqual([1]);
    expect(filterByFavorites(list, favorites, ['star', 'club']).map((c) => c.resourceId)).toEqual([1, 2]);
    expect(filterByFavorites(list, favorites, ['heart', 'spade']).map((c) => c.resourceId)).toEqual([2, 3]);
  });

  it('どのニケにも付いていないバッジだけなら空', () => {
    expect(filterByFavorites(list, favorites, ['diamond'])).toEqual([]);
  });
});
