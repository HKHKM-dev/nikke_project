// I-DOLL・フラワー（304）の定義（plan/skills-guide.md）。ダメージに効くのはバーストの倍率ダメージ 1 件だけ。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CharacterData } from '../../types.ts';
import { resolveBurstDamage } from '../burstDamage.ts';
import { MAX_SKILL_LEVELS } from '../resolve.ts';
import { parseSkillDefinition } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const flower = readJson<CharacterData>('../../../data/characters/304.json');
const def = parseSkillDefinition(readJson('../../../data/skills/304.json'));

describe('I-DOLL・フラワー（304）', () => {
  it('has no modeled effects on S1 and S2', () => {
    expect(def.skills.skill1).toMatchObject({ support: 'unsupported', effects: [] });
    expect(def.skills.skill2).toMatchObject({ support: 'unsupported', effects: [] });
  });

  it('resolves the burst to one skill-damage hit of the final ATK', () => {
    expect(resolveBurstDamage(def, flower, MAX_SKILL_LEVELS)).toEqual([
      expect.objectContaining({ damageType: 'skill', multiplier: expect.closeTo(3.3061, 10) }),
    ]);
    expect(resolveBurstDamage(def, flower, { skill1: 1, skill2: 1, burst: 1 })).toEqual([
      expect.objectContaining({ damageType: 'skill', multiplier: expect.closeTo(1.102, 10) }),
    ]);
  });
});
