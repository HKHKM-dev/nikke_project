// data/skills/ の手書き定義がキャラデータと整合していることを固定する。
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CharacterData } from '../../types.ts';
import { MAX_SKILL_LEVELS, resolvePassives, skillValue } from '../resolve.ts';
import { SKILL_LEVEL_MAX } from '../resolve.ts';
import { parseSkillDefinition, parseSkillIndex, SKILL_SLOTS } from '../types.ts';

const DATA_DIR = join(import.meta.dirname, '../../../data');
const SKILLS_DIR = join(DATA_DIR, 'skills');

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

const index = parseSkillIndex(readJson(join(SKILLS_DIR, 'index.json')));
const files = readdirSync(SKILLS_DIR)
  .filter((f) => /^\d+\.json$/.test(f))
  .map((f) => Number(f.replace('.json', '')))
  .sort((a, b) => a - b);

describe('data/skills', () => {
  it('index lists exactly the definition files, sorted and without duplicates', () => {
    expect([...index.resourceIds].sort((a, b) => a - b)).toEqual(files);
    expect(index.resourceIds).toEqual([...index.resourceIds].sort((a, b) => a - b));
    expect(new Set(index.resourceIds).size).toBe(index.resourceIds.length);
  });

  describe.each(files)('definition %i', (resourceId) => {
    const def = parseSkillDefinition(readJson(join(SKILLS_DIR, `${resourceId}.json`)));
    const character = readJson(join(DATA_DIR, 'characters', `${resourceId}.json`)) as CharacterData;

    it('names the character of its file and a checked date', () => {
      expect(def.resourceId).toBe(resourceId);
      expect(character.resourceId).toBe(resourceId);
      expect(def.checkedAt <= new Date().toISOString().slice(0, 10)).toBe(true);
    });

    it('references values that exist for every level, and burst is unsupported', () => {
      expect(def.skills.burst.support).toBe('unsupported');
      for (const slot of SKILL_SLOTS) {
        for (const effect of def.skills[slot].effects) {
          const entry = character.skills[slot].values[effect.ref - 1];
          expect(entry, `${slot} ref ${effect.ref}`).toHaveLength(SKILL_LEVEL_MAX);
          for (let lv = 1; lv <= SKILL_LEVEL_MAX; lv++) {
            const v = skillValue(character.skills[slot], effect.ref, lv);
            expect(v).toBeGreaterThan(0);
            expect(v).toBeLessThanOrEqual(100);
          }
        }
      }
    });

    it('resolves at Lv10 and values are non-decreasing with level', () => {
      const lv10 = resolvePassives(def, character, MAX_SKILL_LEVELS);
      const lv1 = resolvePassives(def, character, { skill1: 1, skill2: 1, burst: 1 });
      expect(lv10.length).toBeGreaterThan(0);
      lv10.forEach((e, i) => expect(e.value).toBeGreaterThanOrEqual(lv1[i]!.value));
    });

    it('explains what is not modeled', () => {
      for (const slot of SKILL_SLOTS) {
        const entry = def.skills[slot];
        if (entry.support !== 'supported') expect(entry.notes?.length ?? 0, `${slot} notes`).toBeGreaterThan(0);
      }
    });
  });
});
