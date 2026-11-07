// 書き出したバッジ（src/assets/badges）が、元の SVG（badges-src）を badges.ts で小さくしたものと同じこと
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BADGE_OUT_DIR, BADGE_SRC_DIR, optimizeBadge, svgFiles } from './badges.ts';

describe('バッジの書き出し', () => {
  it('元と書き出しのファイルが同じ顔ぶれ', () => {
    expect(svgFiles(BADGE_OUT_DIR)).toEqual(svgFiles(BADGE_SRC_DIR));
  });

  it.each(svgFiles(BADGE_SRC_DIR))('%s は元を小さくしたもの（違うなら npm run badges:build）', (file) => {
    const expected = optimizeBadge(readFileSync(`${BADGE_SRC_DIR}/${file}`, 'utf8'));
    expect(readFileSync(`${BADGE_OUT_DIR}/${file}`, 'utf8')).toBe(expected);
  });
});
