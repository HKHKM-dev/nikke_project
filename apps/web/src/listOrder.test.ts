// キャラの一覧の並び（listOrder.ts。plan/design-combat-power-sort.md 6 節）
import {
  combatCharacterOf,
  emptyBuild,
  snapshotCombatPower,
  type BuildMasters,
  type BuildSnapshot,
  type CharacterIndexEntry,
  type CombatPowerTable,
  type SnapshotCharacter,
} from '@nikke/core';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  combatPowerNote,
  effectiveListOrder,
  orderCharacters,
  parseListOrder,
  rosterCombatPowers,
} from './listOrder.ts';

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

  it('育成状況があれば既定は戦闘力順、無ければいつも名前順', () => {
    expect(effectiveListOrder(null, true)).toBe('combatPower');
    expect(effectiveListOrder('name', true)).toBe('name');
    expect(effectiveListOrder(null, false)).toBe('name');
    expect(effectiveListOrder('combatPower', false)).toBe('name');
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

it('combatPowerNote: 戦闘力順のときだけ、出せたキャラに添える', () => {
  const powers = new Map([[1, 123456]]);
  expect(combatPowerNote('combatPower', powers, 1)).toBe('（戦闘力 123,456）');
  expect(combatPowerNote('combatPower', powers, 2)).toBeNull();
  expect(combatPowerNote('name', powers, 1)).toBeNull();
});

describe('rosterCombatPowers', () => {
  const data = <T>(path: string): T =>
    JSON.parse(readFileSync(new URL(`../../../packages/core/data/${path}`, import.meta.url), 'utf8')) as T;
  const table = data<CombatPowerTable>('characters/combat.json');
  const masters = Object.fromEntries(
    ['gear', 'affection', 'cubes', 'collections', 'recycleRoom', 'overload'].map((k) => [k, data(`masters/${k}.json`)]),
  ) as BuildMasters;
  const [id] = Object.keys(table.characters).filter((k) => table.characters[k]!.rarity === 'SSR');
  const character = (over: Partial<SnapshotCharacter> = {}): SnapshotCharacter => ({
    ...emptyBuild(),
    growth: { level: 300, grade: 3, core: 2 },
    affectionRank: 10,
    skillLevels: { skill1: 10, skill2: 10, burst: 10 },
    treasure: null,
    ...over,
  });

  it('育成状況のキャラの戦闘力を出し、出せないキャラ（表に無い・値が合わない）を分ける', () => {
    const roster: BuildSnapshot = {
      formatVersion: 1,
      fetchedAt: '2026-10-29T00:00:00Z',
      synchroLevel: 300,
      recycleRoom: {},
      characters: {
        [id!]: character(),
        '-1': character(),
        // 存在しないキューブは計算で止まる
        [Object.keys(table.characters).find((k) => k !== id)!]: character({ cube: { id: 1, level: 1 } }),
      },
      unmapped: [],
    };
    const r = rosterCombatPowers(roster, table, masters);
    expect([...r.powers.keys()]).toEqual([Number(id)]);
    expect(r.powers.get(Number(id))).toBe(
      snapshotCombatPower(combatCharacterOf(table, Number(id))!, character(), masters).value,
    );
    expect(r.failed).toHaveLength(2);
  });
});
