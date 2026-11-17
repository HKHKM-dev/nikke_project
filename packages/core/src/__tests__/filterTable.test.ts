// 絞り込みの表（data/characters/filter.json。plan/design-character-filter.md 3 節）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildFilterTable,
  matchesSearchTerms,
  normalizeSearchText,
  parseFilterTable,
  searchTerms,
  type FilterTable,
} from '../filterTable.ts';
import type { CharacterData, CharacterIndex } from '../types.ts';

const data = <T>(path: string): T =>
  JSON.parse(readFileSync(new URL(`../../data/${path}`, import.meta.url), 'utf8')) as T;
const index = data<CharacterIndex>('characters/index.json').characters;
const characters = index.map((c) => data<CharacterData>(`characters/${c.resourceId}.json`));
const table = data<FilterTable>('characters/filter.json');

describe('絞り込みの表', () => {
  it('置いてある表は、キャラのデータから作ったものと同じ（違えば npm run filter-table で作り直す）', () => {
    expect(table).toEqual(buildFilterTable(characters));
  });

  it('全キャラがあり、読み込みの確かめを通る', () => {
    expect(Object.keys(parseFilterTable(table).characters)).toHaveLength(characters.length);
  });

  it('説明文の値は最大 Lv の値で、書式の印は残らない（ラピのスキル 1 の攻撃力▲）', () => {
    const rapi = table.characters['10']!;
    expect(rapi.burstCooldown).toBe(40);
    expect(rapi.skillText).toContain('フォーメーションf.f');
    expect(rapi.skillText).toContain('攻撃力21.81%▲');
    expect(rapi.skillText).not.toMatch(/<color|description_value/);
  });

  it('版の違う表は読まない', () => {
    expect(() => parseFilterTable({ formatVersion: 2, characters: {} })).toThrow('formatVersion 2');
    expect(() => parseFilterTable({ formatVersion: 1, characters: { 10: { burstCooldown: 'x' } } })).toThrow('10');
  });
});

describe('検索の文字', () => {
  it('全角・半角と大文字・小文字をそろえ、ひらがなをカタカナにする', () => {
    expect(normalizeSearchText('らぴ　ＡＲ\n攻撃力')).toBe('ラピ ar 攻撃力');
  });

  it('空白で区切った語は、すべてを含むものに合う', () => {
    const text = normalizeSearchText('ラピ 攻撃力▲ クリティカル');
    expect(matchesSearchTerms(text, searchTerms('こうげき'))).toBe(false);
    expect(matchesSearchTerms(text, searchTerms('攻撃力  くりてぃかる'))).toBe(true);
    expect(matchesSearchTerms(text, searchTerms('攻撃力 回復'))).toBe(false);
    expect(searchTerms('  ')).toEqual([]);
  });
});
