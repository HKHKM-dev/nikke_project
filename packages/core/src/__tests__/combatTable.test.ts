// 戦闘力の表（data/characters/combat.json。plan/design-combat-power-sort.md 6 節）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { emptyBuild } from '../build.ts';
import { computeCombatPower } from '../combatPower.ts';
import { buildCombatPowerTable, combatCharacterOf, type CombatPowerTable } from '../combatTable.ts';
import { MASTER_FILES } from '../load.ts';
import type { BuildMasters, CharacterData, CharacterIndex } from '../types.ts';

const data = <T>(path: string): T =>
  JSON.parse(readFileSync(new URL(`../../data/${path}`, import.meta.url), 'utf8')) as T;
const index = data<CharacterIndex>('characters/index.json').characters;
const characters = index.map((c) => data<CharacterData>(`characters/${c.resourceId}.json`));
const masters = Object.fromEntries(
  Object.entries(MASTER_FILES).map(([k, f]) => [k, data<unknown>(`masters/${f}`)]),
) as BuildMasters;
const table = data<CombatPowerTable>('characters/combat.json');

describe('戦闘力の表', () => {
  it('置いてある表は、キャラのデータから作ったものと同じ（違えば npm run combat-table で作り直す）', () => {
    expect(table).toEqual(buildCombatPowerTable(characters));
  });

  it('表から引いた値で出す戦闘力は、キャラのデータで出すものと同じ', () => {
    const build = { ...emptyBuild(), affectionRank: 10 };
    const skillLevels = { skill1: 10, skill2: 7, burst: 4 };
    for (const c of characters) {
      const fromTable = combatCharacterOf(table, c.resourceId)!;
      const growth = { level: 400, grade: c.rarity === 'SSR' ? 3 : 0, core: 0 };
      const input = { growth, build, skillLevels, treasure: c.treasure !== null };
      expect(computeCombatPower(fromTable, input, masters).value).toBe(computeCombatPower(c, input, masters).value);
    }
  });

  it('曲線は同じものを 1 回だけ置き、表に無いキャラは undefined', () => {
    expect(new Set(table.levelCurves.map((c) => JSON.stringify(c))).size).toBe(table.levelCurves.length);
    expect(table.levelCurves.length).toBeLessThan(characters.length);
    expect(combatCharacterOf(table, -1)).toBeUndefined();
  });
});
