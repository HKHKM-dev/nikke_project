import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeBaseStats, computeStat, growthLimits, validateGrowth } from '../stats.ts';
import type { CharacterData } from '../types.ts';

function loadCharacter(resourceId: number): CharacterData {
  const url = new URL(`../../data/characters/${resourceId}.json`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as CharacterData;
}

describe('computeStat (Emma, resourceId 90, SSR)', () => {
  const emma = loadCharacter(90);

  it('returns the raw curve value with no limit break', () => {
    expect(computeStat(emma, 'attack', { level: 1, grade: 0, core: 0 })).toBe(500);
    expect(computeStat(emma, 'attack', { level: 200, grade: 0, core: 0 })).toBe(17576);
  });

  it('applies limit break as floor(curve × (1 + 2% × grade) + 20 × grade)', () => {
    // 17576 × 1.06 + 60 = 18690.56 → 18690
    expect(computeStat(emma, 'attack', { level: 200, grade: 3, core: 0 })).toBe(18690);
  });

  it('applies core as round(base × (1 + 2% × core))', () => {
    // 18690 × 1.14 = 21306.6 → 21307
    expect(computeStat(emma, 'attack', { level: 200, grade: 3, core: 7 })).toBe(21307);
  });

  it('computes all three stats', () => {
    const stats = computeBaseStats(emma, { level: 1, grade: 0, core: 0 });
    expect(stats).toEqual({ attack: 500, hp: 15000, defence: 84 });
  });

  it('matches Blablalink ShiftyPad display values (checked 2026-09-22)', () => {
    expect(computeBaseStats(emma, { level: 200, grade: 0, core: 0 })).toEqual({
      attack: 17576,
      hp: 527303,
      defence: 2940,
    });
    expect(computeBaseStats(emma, { level: 200, grade: 3, core: 0 })).toEqual({
      attack: 18690,
      hp: 567941,
      defence: 3416,
    });
    expect(computeBaseStats(emma, { level: 200, grade: 3, core: 7 })).toEqual({
      attack: 21307,
      hp: 647453,
      defence: 3894,
    });
    expect(computeStat(emma, 'attack', { level: 201, grade: 0, core: 0 })).toBe(18455);
  });

  it('exposes growth limits by rarity', () => {
    expect(growthLimits(emma)).toEqual({ levelMax: 1400, gradeMax: 3, coreMax: 7 });
  });

  it('rejects out-of-range input', () => {
    expect(() => validateGrowth(emma, { level: 0, grade: 0, core: 0 })).toThrow(RangeError);
    expect(() => validateGrowth(emma, { level: 1401, grade: 0, core: 0 })).toThrow(RangeError);
    expect(() => validateGrowth(emma, { level: 1, grade: 4, core: 0 })).toThrow(RangeError);
    expect(() => validateGrowth(emma, { level: 1, grade: 0, core: 8 })).toThrow(RangeError);
    expect(() => validateGrowth(emma, { level: 1.5, grade: 0, core: 0 })).toThrow(RangeError);
  });
});

describe('computeStat (Rapi, resourceId 10, SR)', () => {
  const rapi = loadCharacter(10);

  it('uses SR coefficients (+18 attack per limit break, max 2, no core)', () => {
    expect(growthLimits(rapi)).toEqual({ levelMax: 1400, gradeMax: 2, coreMax: 0 });
    // ShiftyPad の表示値と一致を確認済み（2026-09-22）
    expect(computeStat(rapi, 'attack', { level: 200, grade: 0, core: 0 })).toBe(18983);
    expect(computeStat(rapi, 'attack', { level: 200, grade: 2, core: 0 })).toBe(19778);
  });
});
