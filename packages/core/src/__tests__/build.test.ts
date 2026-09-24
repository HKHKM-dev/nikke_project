// Stage 12: 育成入力（ステータス層）。スペック固定はこの入力の 1 つのプリセットで、computeFixedSpecAttack と同値（退化）
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  AFFECTION_RANK_MAX,
  BUILD_CORE_APPLIES_TO,
  GEAR_PARTS,
  computeCombatAttack,
  emptyBuild,
  fixedSpecBuild,
  isEmptyBuild,
  validateBuild,
  type BuildInput,
} from '../build.ts';
import { AFFECTION_ATTACK, FIXED_SPEC_GEAR_ATTACK, computeFixedSpecAttack, fixedSpecGrowth } from '../fixedSpec.ts';
import { computeStat } from '../stats.ts';
import type { BuildMasters, CharacterData, NikkeClass } from '../types.ts';

function readJson<T>(relative: string): T {
  return JSON.parse(readFileSync(new URL(relative, import.meta.url), 'utf8')) as T;
}
function loadCharacter(resourceId: number): CharacterData {
  return readJson<CharacterData>(`../../data/characters/${resourceId}.json`);
}
const masters: BuildMasters = {
  gear: readJson('../../data/masters/gear.json'),
  affection: readJson('../../data/masters/affection.json'),
  cubes: readJson('../../data/masters/cubes.json'),
  collections: readJson('../../data/masters/collections.json'),
  recycleRoom: readJson('../../data/masters/recycleRoom.json'),
  overload: readJson('../../data/masters/overload.json'),
};
const CLASSES: NikkeClass[] = ['Attacker', 'Defender', 'Supporter'];

describe('masters', () => {
  it('gear: T9 Lv5 sums per class equal the fixed-spec constants (verified in the shooting range)', () => {
    for (const cls of CLASSES) {
      const sum = GEAR_PARTS.reduce((s, part) => s + (masters.gear.tiers.T9[cls][part].attack[5] ?? NaN), 0);
      expect(sum, cls).toBe(FIXED_SPEC_GEAR_ATTACK[cls]);
    }
  });

  it('gear: every tier / class / part has Lv0..5 and corporate T9 starts at T9 Lv3 attack', () => {
    for (const type of ['T9', 'T9Corp', 'OL'] as const) {
      for (const cls of CLASSES) {
        for (const part of GEAR_PARTS) {
          const stats = masters.gear.tiers[type][cls][part];
          expect(stats.attack, `${type} ${cls} ${part}`).toHaveLength(6);
          expect(stats.hp).toHaveLength(6);
          expect(stats.defence).toHaveLength(6);
        }
        // 企業装備の Lv0 は T9 Lv3 相当（参照表の丸めで ±1 ずれる行がある）
        const corp0 = masters.gear.tiers.T9Corp[cls].head.attack[0]!;
        expect(Math.abs(corp0 - masters.gear.tiers.T9[cls].head.attack[3]!)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('affection: rank 10 / 30 / 40 equal the fixed-spec table and rank 1 adds nothing', () => {
    expect(masters.affection.ranks).toHaveLength(AFFECTION_RANK_MAX);
    for (const cls of CLASSES) {
      expect(masters.affection.ranks[0]?.attack[cls]).toBe(0);
      for (const rank of [10, 30, 40] as const) {
        expect(masters.affection.ranks[rank - 1]?.attack[cls], `${cls} rank ${rank}`).toBe(AFFECTION_ATTACK[cls][rank]);
      }
    }
  });

  it('cubes / collections / recycle room have the expected shape', () => {
    expect(masters.cubes.cubes.length).toBeGreaterThanOrEqual(17);
    for (const cube of masters.cubes.cubes) {
      expect(cube.stats.attack).toHaveLength(15);
      expect(cube.skillStages).toHaveLength(cube.skills.length);
    }
    expect(masters.collections.collections).toHaveLength(12);
    for (const c of masters.collections.collections) {
      expect(c.stats.attack).toHaveLength(16);
      expect(c.stats.attack[0]).toBeGreaterThan(0);
    }
    // SR Lv15 と宝物のステータスは同じ（別プロジェクトの CDN 突合と同じ結論）
    const srAr = masters.collections.collections.find((c) => c.rarity === 'SR' && c.weaponType === 'AR');
    expect(srAr?.stats.attack[15]).toBe(masters.collections.treasureStats.attack);
    expect(masters.recycleRoom.corporation.PILGRIM?.attack).toBe(25);
    expect(masters.recycleRoom.personal.attack).toBe(0);
  });
});

describe('computeCombatAttack', () => {
  const dataDir = new URL('../../data/characters/', import.meta.url);
  const allIds = readdirSync(dataDir)
    .filter((f) => /^\d+\.json$/.test(f))
    .map((f) => Number(f.replace('.json', '')));

  it('with fixedSpecBuild equals computeFixedSpecAttack for every character (retreat)', () => {
    expect(allIds.length).toBeGreaterThan(100);
    for (const id of allIds) {
      const c = loadCharacter(id);
      const expected = computeFixedSpecAttack(c);
      const r = computeCombatAttack(c, fixedSpecGrowth(c), fixedSpecBuild(c), masters);
      expect(r.attack, `${id} ${c.name.ja}`).toBe(expected.attack);
      expect(r.withCore).toBe(expected.withCore);
      expect(r.gear).toBe(expected.gear);
      expect(r.affection).toBe(expected.affection);
    }
  });

  it('with an empty build equals the plain computeStat (nothing added)', () => {
    const emma = loadCharacter(90);
    const growth = { level: 200, grade: 3, core: 7 };
    const r = computeCombatAttack(emma, growth, emptyBuild(), masters);
    expect(r.attack).toBe(computeStat(emma, 'attack', growth));
    expect(isEmptyBuild(emptyBuild())).toBe(true);
    expect(isEmptyBuild(fixedSpecBuild(emma))).toBe(false);
  });

  it('adds gear outside the core multiplier and cube / collection / recycle room inside it (assumption)', () => {
    const emma = loadCharacter(90); // SSR Supporter, coreAttack 200 (2% / step)
    const growth = { level: 400, grade: 3, core: 7 };
    const build: BuildInput = {
      ...emptyBuild(),
      affectionRank: 30,
      gear: {
        head: { type: 'OL', level: 5 },
        body: { type: 'T9', level: 5 },
        arm: { type: 'T9Corp', level: 2 },
        leg: null,
      },
      cube: { id: 1000301, level: 15 },
      collection: { rarity: 'SR', level: 15 },
      recycleRoom: { personal: 3, class: 2, corporation: 4 },
      extraAttack: 100,
    };
    const r = computeCombatAttack(emma, growth, build, masters);
    expect(r.gradeBase).toBe(79840);
    expect(r.affection).toBe(1367);
    expect(r.gear).toBe(
      masters.gear.tiers.OL.Supporter.head.attack[5]! +
        masters.gear.tiers.T9.Supporter.body.attack[5]! +
        masters.gear.tiers.T9Corp.Supporter.arm.attack[2]!,
    );
    expect(r.cube).toBe(2780);
    expect(r.collection).toBe(9688);
    expect(r.recycleRoom).toBe(4 * masters.recycleRoom.corporation[emma.corporation]!.attack); // 企業研究 Lv4。共通・クラスは攻撃力 0
    expect(r.extra).toBe(100);
    const inner = (flag: boolean, v: number) => (flag ? v : 0);
    const coreSide =
      79840 +
      1367 +
      inner(BUILD_CORE_APPLIES_TO.cube, 2780) +
      inner(BUILD_CORE_APPLIES_TO.collection, 9688) +
      inner(BUILD_CORE_APPLIES_TO.recycleRoom, 100) +
      inner(BUILD_CORE_APPLIES_TO.extra, 100);
    expect(r.coreSide).toBe(coreSide);
    expect(r.withCore).toBe(Math.round(coreSide * (1 + (7 * emma.statEnhance.coreAttack) / 10000)));
    expect(r.attack).toBe(r.withCore + r.gear + (BUILD_CORE_APPLIES_TO.extra ? 0 : 100));
  });

  it('uses the treasure stats instead of the collection when the treasure is unlocked', () => {
    const drake = loadCharacter(101); // 宝物あり
    const growth = { level: 200, grade: 3, core: 0 };
    const withCollection = computeCombatAttack(
      drake,
      growth,
      { ...emptyBuild(), collection: { rarity: 'SR', level: 15 } },
      masters,
    );
    const withTreasure = computeCombatAttack(drake, growth, emptyBuild(), masters, { treasurePhase: 1 });
    expect(withTreasure.collection).toBe(9688);
    expect(withTreasure.attack).toBe(withCollection.attack);
    expect(() => computeCombatAttack(loadCharacter(90), growth, emptyBuild(), masters, { treasurePhase: 1 })).toThrow(
      RangeError,
    );
  });

  it('rejects out-of-range or unknown inputs', () => {
    const emma = loadCharacter(90);
    const bad = (patch: Partial<BuildInput>) => () => validateBuild(emma, { ...emptyBuild(), ...patch }, masters);
    expect(bad({ affectionRank: 0 })).toThrow(RangeError);
    expect(bad({ affectionRank: 41 })).toThrow(RangeError);
    expect(bad({ gear: { ...emptyBuild().gear, head: { type: 'T9', level: 6 } } })).toThrow(RangeError);
    expect(bad({ cube: { id: 1, level: 1 } })).toThrow(RangeError);
    expect(bad({ cube: { id: 1000301, level: 0 } })).toThrow(RangeError);
    expect(bad({ collection: { rarity: 'SR', level: 16 } })).toThrow(RangeError);
    expect(bad({ extraAttack: -1 })).toThrow(RangeError);
    expect(bad({ recycleRoom: { personal: 1.5, class: 0, corporation: 0 } })).toThrow(RangeError);
    expect(bad({})).not.toThrow();
  });
});
