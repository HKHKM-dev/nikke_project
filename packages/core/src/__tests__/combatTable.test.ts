// 戦闘力の表（data/characters/combat.json。plan/design-combat-power-sort.md 6 節）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { emptyBuild } from '../build.ts';
import {
  BUILD_SNAPSHOT_FORMAT_VERSION,
  snapshotCombatPower,
  snapshotCombatPowers,
  type BuildSnapshot,
  type SnapshotCharacter,
} from '../buildSnapshot.ts';
import { computeCombatPower } from '../combatPower.ts';
import { fixedSpecBuild } from '../build.ts';
import {
  buildCombatPowerTable,
  combatCharacterOf,
  fixedSpecCombatPowers,
  parseCombatPowerTable,
  type CombatPowerTable,
} from '../combatTable.ts';
import { fixedSpecGrowth } from '../fixedSpec.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { loadCombatPowerTable, MASTER_FILES } from '../load.ts';
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
  it('スペック固定の戦闘力は、キャラのデータにスペック固定の育成を入れて出すものと同じ（全キャラ・失敗なし）', () => {
    const { powers, failures } = fixedSpecCombatPowers(table, masters);
    expect(failures).toEqual([]);
    expect(powers.size).toBe(characters.length);
    for (const c of characters) {
      const input = {
        growth: fixedSpecGrowth(c),
        build: fixedSpecBuild(c),
        skillLevels: MAX_SKILL_LEVELS,
        treasure: false,
      };
      expect(powers.get(c.resourceId)).toBe(computeCombatPower(c, input, masters).value);
    }
  });

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

it('snapshotCombatPowers: 表から引いて全キャラの戦闘力を出し、出せないキャラを理由つきで分ける', () => {
  const ssr = characters.find((c) => c.rarity === 'SSR')!;
  const sr = characters.find((c) => c.rarity === 'SR')!;
  const entry = (over: Partial<SnapshotCharacter> = {}): SnapshotCharacter => ({
    ...emptyBuild(),
    growth: { level: 300, grade: 3, core: 2 },
    affectionRank: 10,
    skillLevels: { skill1: 10, skill2: 10, burst: 10 },
    treasure: null,
    ...over,
  });
  const snapshot: BuildSnapshot = {
    formatVersion: BUILD_SNAPSHOT_FORMAT_VERSION,
    fetchedAt: '2026-10-29T00:00:00Z',
    synchroLevel: 300,
    recycleRoom: {},
    // SR の凸の上限は 2 なので、凸 3 は計算で止まる
    characters: { [ssr.resourceId]: entry(), [sr.resourceId]: entry(), '-1': entry() },
    unmapped: [],
  };
  const r = snapshotCombatPowers(snapshot, (id) => combatCharacterOf(table, id), masters);
  expect([...r.powers]).toEqual([[ssr.resourceId, snapshotCombatPower(ssr, entry(), masters).value]]);
  expect(r.failures.map((f) => f.id).sort()).toEqual([-1, sr.resourceId].sort());
  expect(r.failures.find((f) => f.id === -1)?.message).toBe('キャラのデータに無い');
});

describe('parseCombatPowerTable（デプロイの直後に古い JS と新しい表が混ざる場合）', () => {
  const id = Object.keys(table.characters)[0]!;
  /** 置いてある表の 1 体分を書き換えたもの */
  const withEntry = (over: Record<string, unknown>) => ({
    ...table,
    characters: { ...table.characters, [id]: { ...table.characters[id]!, ...over } },
  });

  it('置いてある表はそのまま通す', () => {
    expect(parseCombatPowerTable(table)).toBe(table);
  });

  it('知らない版・形の違う表は、場所つきの Error にする', () => {
    expect(() => parseCombatPowerTable({ ...table, formatVersion: 2 })).toThrow(
      'この版の戦闘力の表は読めない（formatVersion 2）',
    );
    expect(() => parseCombatPowerTable([])).toThrow('戦闘力の表: オブジェクトでない');
    expect(() => parseCombatPowerTable({ ...table, levelCurves: {} })).toThrow('levelCurves: 配列でない');
    expect(() => parseCombatPowerTable({ ...table, levelCurves: [{ attack: [1], hp: [1] }] })).toThrow(
      'levelCurves[0]: attack・hp・defence の数の配列だけを持つのでない',
    );
    expect(() => parseCombatPowerTable({ ...table, characters: null })).toThrow('characters: オブジェクトでない');
    expect(() => parseCombatPowerTable(withEntry({ levelCurve: table.levelCurves.length }))).toThrow(
      `characters.${id}.levelCurve: levelCurves の番号でない（${table.levelCurves.length}）`,
    );
    expect(() => parseCombatPowerTable(withEntry({ treasure: null }))).toThrow(
      `characters.${id}.treasure: 真偽値でない`,
    );
    expect(() => parseCombatPowerTable(withEntry({ statEnhance: {} }))).toThrow(`characters.${id}.statEnhance`);
    expect(() => parseCombatPowerTable(withEntry({ crit: { rate: 1 } }))).toThrow(`characters.${id}.crit`);
    const curve = table.levelCurves[0]!;
    expect(() => parseCombatPowerTable({ ...table, levelCurves: [{ ...curve, max: 200 }] })).toThrow(
      'levelCurves[0]: attack・hp・defence の数の配列だけを持つのでない',
    );
    expect(() => parseCombatPowerTable(withEntry({ rarity: 'UR' }))).toThrow(
      `characters.${id}.rarity: 知らない値（"UR"）`,
    );
    expect(() => parseCombatPowerTable(withEntry({ weaponType: 'BOW' }))).toThrow(
      `characters.${id}.weaponType: 知らない値（"BOW"）`,
    );
    expect(() => parseCombatPowerTable(withEntry({ corporationSubType: undefined }))).toThrow(
      `characters.${id}.corporationSubType: 文字列か null でない`,
    );
    expect(() => parseCombatPowerTable(withEntry({ corporation: 1 }))).toThrow(
      `characters.${id}.corporation: 文字列でない`,
    );
  });

  it('loadCombatPowerTable は形の違う表を読み込みの失敗にする（画面は「戦闘力の表を読めない」と出す）', async () => {
    const fetchOf = (json: unknown) => (async () => new Response(JSON.stringify(json))) as typeof fetch;
    await expect(loadCombatPowerTable({ fetchImpl: fetchOf(table) })).resolves.toEqual(table);
    await expect(loadCombatPowerTable({ fetchImpl: fetchOf({ ...table, formatVersion: 2 }) })).rejects.toThrow(
      'この版の戦闘力の表は読めない（formatVersion 2）',
    );
  });
});
