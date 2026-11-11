// 未対応の印（モダン UI の ⓘ）にマウスを載せたときの知らせ（useSkillDefinitions.ts の unsupportedNoteOf）
import { describe, expect, it } from 'vitest';
import { unsupportedNoteOf } from './useSkillDefinitions.ts';

const cache = {
  index: new Set([1, 2, 3]),
  fullySupported: new Set([1]),
  supportGaps: new Map([
    [2, { unimplemented: 3, assumed: 2 }],
    [3, { unimplemented: 1, assumed: 0 }],
  ]),
};

describe('unsupportedNoteOf', () => {
  it('shows nothing for a fully supported character and before the index loads', () => {
    expect(unsupportedNoteOf(cache, 1)).toBeNull();
    expect(unsupportedNoteOf({ ...cache, fullySupported: null }, 2)).toBeNull();
  });

  it('names an undefined character, and counts the unimplemented and the assumptions (only when any)', () => {
    expect(unsupportedNoteOf(cache, 9)).toBe('スキル未定義');
    expect(unsupportedNoteOf(cache, 2)).toBe('未対応 3 件\n仮定 2 件');
    expect(unsupportedNoteOf(cache, 3)).toBe('未対応 1 件');
  });

  it('does not count with an old index without the counts', () => {
    expect(unsupportedNoteOf({ ...cache, supportGaps: new Map() }, 2)).toBe('スキル定義に未対応あり');
  });
});
