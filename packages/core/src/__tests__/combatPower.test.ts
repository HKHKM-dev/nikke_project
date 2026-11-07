// キャラの戦闘力（C-0981。V-0685）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeCombatStat, emptyBuild, OVERLOAD_OPTIONS, type BuildInput } from '../build.ts';
import { computeCombatPower } from '../combatPower.ts';
import type { BuildMasters, CharacterData, OverloadOption } from '../types.ts';

function readJson<T>(relative: string): T {
  return JSON.parse(readFileSync(new URL(relative, import.meta.url), 'utf8')) as T;
}
const loadCharacter = (resourceId: number) => readJson<CharacterData>(`../../data/characters/${resourceId}.json`);
const masters: BuildMasters = {
  gear: readJson('../../data/masters/gear.json'),
  affection: readJson('../../data/masters/affection.json'),
  cubes: readJson('../../data/masters/cubes.json'),
  collections: readJson('../../data/masters/collections.json'),
  recycleRoom: readJson('../../data/masters/recycleRoom.json'),
  overload: readJson('../../data/masters/overload.json'),
};
const LV1 = { level: 1, grade: 0, core: 0 };
const SKILLS_1 = { skill1: 1, skill2: 1, burst: 1 };

describe('OL の行の戦闘力（overload.json の powers）', () => {
  // 2026-09-24〜10-29: ShiftyPad（Blablalink）の state_effects にある OL 行の function_battlepower（ゲームのデータ）。
  // 観測できた 113 点（Lv → 値）。出ていない Lv は C-0982 の規則の値
  const OBSERVED: Record<OverloadOption, Record<number, number>> = {
    elementDamage: {
      ...{ 2: 166, 3: 248, 4: 331, 5: 414, 6: 497, 7: 580, 8: 662, 9: 745 },
      ...{ 10: 828, 11: 911, 12: 994, 13: 1076, 14: 1159, 15: 1242 },
    },
    hitRate: { 1: 69, 2: 138, 3: 207, 4: 276, 5: 345, 6: 414, 7: 483, 8: 552, 10: 690, 11: 759, 13: 897, 15: 1035 },
    maxAmmo: {
      ...{ 1: 69, 2: 138, 3: 207, 4: 276, 5: 345, 6: 414, 7: 483, 8: 552 },
      ...{ 9: 621, 10: 690, 11: 759, 12: 828, 13: 897, 14: 966 },
    },
    attack: {
      ...{ 1: 69, 2: 138, 3: 207, 4: 276, 5: 345, 6: 414, 7: 483, 8: 552 },
      ...{ 9: 621, 10: 690, 11: 759, 12: 828, 13: 897, 14: 966, 15: 1035 },
    },
    chargeDamage: { 1: 69, 2: 138, 3: 207, 4: 276, 5: 345, 6: 414, 7: 483, 9: 621, 10: 690, 11: 759, 14: 966 },
    chargeSpeed: {
      ...{ 1: 69, 2: 138, 3: 207, 4: 276, 5: 345, 6: 414, 7: 483, 8: 552 },
      ...{ 9: 621, 10: 690, 11: 759, 12: 828, 13: 897, 15: 1035 },
    },
    critRate: { 1: 69, 2: 138, 3: 207, 4: 276, 5: 345, 7: 483, 8: 552, 10: 690, 11: 759, 14: 966, 15: 1035 },
    critDamage: { 1: 69, 2: 138, 3: 207, 4: 276, 5: 345, 6: 414, 7: 483, 8: 552, 9: 621, 10: 690, 11: 759, 14: 966 },
    defence: { 2: 138, 3: 207, 5: 345, 7: 483, 8: 552, 9: 621, 10: 690, 11: 759, 13: 897, 14: 966 },
  };

  it('matches the 113 values observed in the game data (ShiftyPad state_effects)', () => {
    let count = 0;
    for (const option of OVERLOAD_OPTIONS) {
      const powers = masters.overload.options.find((o) => o.option === option)?.powers;
      for (const [level, value] of Object.entries(OBSERVED[option])) {
        expect(powers?.[Number(level) - 1], `${option} Lv${level}`).toBe(value);
        count++;
      }
    }
    expect(count).toBe(113);
  });

  it('follows the rule of C-0982 on every level (elementDamage round(82.8 × Lv), others 69 × Lv)', () => {
    for (const o of masters.overload.options) {
      const unit = o.option === 'elementDamage' ? 82.8 : 69;
      expect(o.powers, o.option).toEqual(Array.from({ length: 15 }, (_, i) => Math.round(unit * (i + 1))));
    }
  });
});

describe('computeCombatPower', () => {
  it('computes the formula of C-0981 from the stats (ラピ Lv1・育成なし)', () => {
    // 攻撃力 540・HP 10350・防御力 81（levelCurve の Lv1）、会心 15%・150%
    // S = 1.075 × 540 × 18 + (10350 + 81 × 100) × 0.7 = 10449 + 12915 = 23364、K = 1.3 + 0.01 × 2 + 0.02 = 1.34
    const result = computeCombatPower(
      loadCharacter(10),
      { growth: LV1, build: emptyBuild(), skillLevels: SKILLS_1, treasure: false },
      masters,
    );
    expect(result.stats).toEqual({ attack: 540, hp: 10350, defence: 81 });
    expect(result.statTerm).toBeCloseTo(23364, 6);
    expect(result.coefficient.total).toBe(13400);
    expect(result.value).toBe(313); // 23364 × 1.34 / 100 = 313.08
  });

  it('adds the skill levels, OL lines, cube and collection to K', () => {
    const rapi = loadCharacter(10); // AR
    const build: BuildInput = {
      ...emptyBuild(),
      gear: {
        head: {
          type: 'OL',
          level: 5,
          overload: [
            { option: 'attack', level: 15 },
            { option: 'elementDamage', level: 1 },
          ],
        },
        body: null,
        arm: { type: 'OL', level: 5, overload: [{ option: 'critRate', level: 7 }] },
        leg: { type: 'T9', level: 5 },
      },
      cube: { id: 1000303, level: 8 },
      collection: { rarity: 'SR', level: 5 },
    };
    const result = computeCombatPower(
      rapi,
      { growth: LV1, build, skillLevels: { skill1: 10, skill2: 4, burst: 7 }, treasure: false },
      masters,
    );
    expect(result.coefficient).toEqual({
      base: 13000,
      skills: 100 * 10 + 100 * 4 + 200 * 7,
      overload: 1035 + 83 + 483,
      cube: 736,
      collection: 1012,
      total: 13000 + 2800 + 1601 + 736 + 1012,
    });
    // ステータスはキャラ画面の値（装備・キューブ・コレクションのステータスも入る）
    for (const kind of ['attack', 'hp', 'defence'] as const) {
      expect(result.stats[kind], kind).toBe(computeCombatStat(rapi, LV1, build, masters, kind).value);
    }
    expect(result.value).toBe(Math.round((result.statTerm * result.coefficient.total) / 1e6));
  });

  it('adds the treasure stats and power whatever the collection field holds (V-0685)', () => {
    const laplace = loadCharacter(100);
    const withCollection = { ...emptyBuild(), collection: { rarity: 'SR' as const, level: 5 } };
    const input = { growth: LV1, skillLevels: SKILLS_1, treasure: true };
    const a = computeCombatPower(laplace, { ...input, build: emptyBuild() }, masters);
    const b = computeCombatPower(laplace, { ...input, build: withCollection }, masters);
    expect(a.coefficient.collection).toBe(masters.collections.treasurePower);
    expect(a.stats.attack).toBe(
      computeCombatStat(laplace, LV1, emptyBuild(), masters, 'attack', { treasurePhase: 3 }).value,
    );
    expect(b).toEqual(a);
  });

  it('rejects skill levels out of 1..10', () => {
    const run = (burst: number) =>
      computeCombatPower(
        loadCharacter(10),
        { growth: LV1, build: emptyBuild(), skillLevels: { ...SKILLS_1, burst }, treasure: false },
        masters,
      );
    expect(() => run(0)).toThrow(RangeError);
    expect(() => run(11)).toThrow(RangeError);
  });
});
