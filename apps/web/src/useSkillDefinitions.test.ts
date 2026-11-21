// 未対応の印（モダン UI の ⓘ）にマウスを載せたときの知らせ（useSkillDefinitions.ts の unsupportedNoteOf）
import { describe, expect, it } from 'vitest';
import { unsupportedNoteOf } from './useSkillDefinitions.ts';

const cache = {
  index: new Set([1, 2, 3, 4]),
  fullySupported: new Set([1]),
  supportGaps: new Map([
    [2, { unimplemented: 3, assumed: 2 }],
    [3, { unimplemented: 1, assumed: 0 }],
    [4, { unimplemented: 0, assumed: 1 }],
  ]),
};

describe('unsupportedNoteOf', () => {
  it('shows nothing for a fully supported character and before the index loads', () => {
    expect(unsupportedNoteOf(cache, 1)).toBeNull();
    expect(unsupportedNoteOf({ ...cache, fullySupported: null }, 2)).toBeNull();
  });

  it('names an undefined character, and counts the unimplemented and the assumptions (only when any)', () => {
    expect(unsupportedNoteOf(cache, 9)).toEqual({ text: 'スキル未定義', level: 'undefined' });
    expect(unsupportedNoteOf(cache, 2)).toEqual({ text: '未対応 3 件\n仮定 2 件', level: 'unimplemented' });
    expect(unsupportedNoteOf(cache, 3)).toEqual({ text: '未対応 1 件', level: 'unimplemented' });
  });

  it('marks a character with only assumptions as assumed', () => {
    expect(unsupportedNoteOf(cache, 4)).toEqual({ text: '仮定 1 件', level: 'assumed' });
  });

  it('does not count with an old index without the counts', () => {
    expect(unsupportedNoteOf({ ...cache, supportGaps: new Map() }, 2)).toEqual({
      text: 'スキル定義に未対応あり',
      level: 'unimplemented',
    });
  });
});
