// キャラの一覧の並び（listOrder.ts。plan/design-combat-power-sort.md 6 節）
import type { CharacterIndexEntry } from '@nikke/core';
import { describe, expect, it } from 'vitest';
import { effectiveListOrder, orderCharacters, parseListOrder } from './listOrder.ts';

const entry = (resourceId: number, ja: string) => ({ resourceId, name: { ja, en: ja } }) as CharacterIndexEntry;
const INDEX = [entry(1, 'ウ'), entry(2, 'ア'), entry(3, 'エ'), entry(4, 'イ'), entry(5, 'オ')];
const ids = (list: readonly CharacterIndexEntry[]) => list.map((c) => c.resourceId);

describe('並びの選び方', () => {
  it('保存した値を読む。知らない値は null', () => {
    expect(parseListOrder('combatPower')).toBe('combatPower');
    expect(parseListOrder('name')).toBe('name');
    expect(parseListOrder('x')).toBeNull();
    expect(parseListOrder(null)).toBeNull();
  });

  it('選んだ並びに従う。選んでいなければ、育成状況があれば戦闘力順、無ければ名前順', () => {
    expect(effectiveListOrder(null, true)).toBe('combatPower');
    expect(effectiveListOrder('name', true)).toBe('name');
    expect(effectiveListOrder(null, false)).toBe('name');
    expect(effectiveListOrder('combatPower', false)).toBe('combatPower');
  });
});

describe('orderCharacters', () => {
  it('名前順', () => {
    expect(ids(orderCharacters(INDEX, 'name', new Map([[1, 9]])))).toEqual([2, 4, 1, 3, 5]);
  });

  it('戦闘力順: 戦闘力のあるキャラを降順（同じ値は名前順）で先に、ほかを名前順で後に', () => {
    const powers = new Map([
      [5, 100],
      [1, 300],
      [3, 100],
    ]);
    expect(ids(orderCharacters(INDEX, 'combatPower', powers))).toEqual([1, 3, 5, 2, 4]);
  });

  it('元の一覧は並べ替えない', () => {
    const before = ids(INDEX);
    orderCharacters(INDEX, 'name', new Map());
    expect(ids(INDEX)).toEqual(before);
  });
});
