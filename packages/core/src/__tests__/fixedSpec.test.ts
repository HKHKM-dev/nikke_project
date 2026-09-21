import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeFixedSpecAttack, fixedSpecAffectionRank, fixedSpecGrowth } from '../fixedSpec.ts';
import type { CharacterData } from '../types.ts';

function loadCharacter(resourceId: number): CharacterData {
  return JSON.parse(
    readFileSync(new URL(`../../data/characters/${resourceId}.json`, import.meta.url), 'utf8'),
  ) as CharacterData;
}

// 期待値は射撃場（スペック固定）の 1 ヒット実測から逆算した戦闘中攻撃力。plan/verification.md 参照。
const CASES: { name: string; id: number; attack: number; tolerance: number }[] = [
  { name: 'Emma (SSR Supporter)', id: 90, attack: 99925, tolerance: 0 },
  { name: 'Folkwang (SSR Defender)', id: 242, attack: 79954, tolerance: 0 },
  { name: 'Isabel (SSR Attacker, Pilgrim)', id: 231, attack: 120694, tolerance: 0 },
  { name: 'Delta (SR Defender)', id: 20, attack: 63368, tolerance: 0 },
  { name: 'Belorta (SR Attacker)', id: 60, attack: 95033, tolerance: 0 },
  { name: 'Kurumi (SR Supporter)', id: 862, attack: 79206, tolerance: 8 },
  { name: 'Misato (SR Supporter)', id: 833, attack: 79202, tolerance: 2 },
  { name: 'I-DOLL Flower (R Defender)', id: 304, attack: 54315, tolerance: 1 },
];

describe('computeFixedSpecAttack', () => {
  for (const c of CASES) {
    it(`${c.name} → ${c.attack}`, () => {
      const r = computeFixedSpecAttack(loadCharacter(c.id));
      expect(Math.abs(r.attack - c.attack)).toBeLessThanOrEqual(c.tolerance);
    });
  }

  it('uses rarity-max growth and rank by rarity / corporation', () => {
    const emma = loadCharacter(90);
    expect(fixedSpecGrowth(emma)).toEqual({ level: 400, grade: 3, core: 7 });
    expect(fixedSpecAffectionRank(emma)).toBe(30);
    expect(fixedSpecAffectionRank(loadCharacter(231))).toBe(40);
    expect(fixedSpecAffectionRank(loadCharacter(304))).toBe(10);
    expect(fixedSpecGrowth(loadCharacter(20))).toEqual({ level: 400, grade: 2, core: 0 });
  });

  it('applies core to base + affection but not to gear (Emma breakdown)', () => {
    const r = computeFixedSpecAttack(loadCharacter(90));
    expect(r.gradeBase).toBe(79840);
    expect(r.affection).toBe(1367);
    expect(r.withCore).toBe(92576);
    expect(r.gear).toBe(7349);
  });
});
