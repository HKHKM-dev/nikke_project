import { describe, expect, it } from 'vitest';
import {
  cdnUrl,
  djb2Int32,
  favoritePath,
  favoriteRareMapPath,
  nikkeListPath,
  obfuscatePath,
  roleDataPath,
} from './path.ts';

describe('obfuscatePath', () => {
  // 期待値は Python で独立に再現し、実際に CDN から 200 が返ることを確認済みのもの。
  it('nikke list (ja)', () => {
    expect(obfuscatePath('/character/ja/nikke_list_ja_v2.json')).toBe(
      'jl-75/xw-80/26ff66bb02287f79acf7b47a9b79161c.json',
    );
  });

  it('nikke list (en)', () => {
    expect(obfuscatePath('character/en/nikke_list_en_v2.json')).toBe(
      'yl-57/hd-03/1bf030193826e243c2e195f951a4be00.json',
    );
  });

  it('roledata (ja)', () => {
    expect(obfuscatePath(roleDataPath(90, 'ja'))).toBe('ze-80/b1e70181972316a2a591fe60c64aa3bd.json');
  });

  // Stage 9: 2026-09-23 に CDN から 200 が返ることを確認した
  it('favorite rare map and favorite item (ja)', () => {
    expect(obfuscatePath(favoriteRareMapPath())).toBe('yb-61/eaff19debcb789edef7e1e8a377e12e5.json');
    expect(obfuscatePath(favoritePath(200801, 'ja'))).toBe('lf-94/tz-90/beee880649deaaf826b0a542f0c44bab.json');
  });

  it('builds full CDN URL', () => {
    expect(cdnUrl(nikkeListPath('ja'))).toBe(
      'https://sg-tools-cdn.blablalink.com/jl-75/xw-80/26ff66bb02287f79acf7b47a9b79161c.json',
    );
  });
});

describe('djb2Int32', () => {
  it('wraps to signed int32 like the site does', () => {
    // 2654435761 * 33 は int32 を超えるため、切り詰めが効いていなければ値が変わる。
    const h = djb2Int32('a', 2654435761);
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(-2147483648);
    expect(h).toBeLessThanOrEqual(2147483647);
  });
});
