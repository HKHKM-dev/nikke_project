import { describe, expect, it } from 'vitest';
import { favoriteMarksOf, parseFavorites, toggleFavorite } from './favorites.ts';

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
