// data/skills/ の手書き定義がキャラデータと整合していることを固定する。
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CharacterData } from '../../types.ts';
import { resolveBurstDamage } from '../burstDamage.ts';
import { MAX_SKILL_LEVELS, resolvePassives, resolveTimed, skillValue } from '../resolve.ts';
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

    it('references values that exist for every level (buffs ≤ 100%, burst damage ≥ 100%)', () => {
      for (const slot of SKILL_SLOTS) {
        for (const effect of def.skills[slot].effects) {
          const entry = character.skills[slot].values[effect.ref - 1];
          expect(entry, `${slot} ref ${effect.ref}`).toHaveLength(SKILL_LEVEL_MAX);
          for (let lv = 1; lv <= SKILL_LEVEL_MAX; lv++) {
            const v = skillValue(character.skills[slot], effect.ref, lv);
            expect(v).toBeGreaterThan(0);
            if (effect.kind === 'burstDamage') expect(v).toBeGreaterThanOrEqual(100);
            else expect(v).toBeLessThanOrEqual(100);
          }
        }
      }
    });

    it('timed effects reference a positive duration that does not change with the skill level', () => {
      for (const slot of SKILL_SLOTS) {
        for (const effect of def.skills[slot].effects) {
          if (effect.kind !== 'timed' || effect.durationRef === undefined) continue;
          const seconds = Array.from({ length: SKILL_LEVEL_MAX }, (_, i) =>
            skillValue(character.skills[slot], effect.durationRef!, i + 1),
          );
          expect(seconds[0], `${slot} durationRef ${effect.durationRef}`).toBeGreaterThan(0);
          // NIKKE の維持時間は Lv に依らないはず。崩れたらここで気づきたい
          expect(new Set(seconds).size, `${slot} durationRef ${effect.durationRef}`).toBe(1);
        }
      }
    });

    it('resolves at Lv10 and values are non-decreasing with level', () => {
      const lv10 = resolvePassives(def, character, MAX_SKILL_LEVELS);
      const lv1 = resolvePassives(def, character, { skill1: 1, skill2: 1, burst: 1 });
      const burst10 = resolveBurstDamage(def, character, MAX_SKILL_LEVELS);
      const burst1 = resolveBurstDamage(def, character, { skill1: 1, skill2: 1, burst: 1 });
      const timed10 = resolveTimed(def, character, MAX_SKILL_LEVELS);
      const timed1 = resolveTimed(def, character, { skill1: 1, skill2: 1, burst: 1 });
      expect(lv10.length + burst10.length + timed10.length).toBeGreaterThan(0);
      lv10.forEach((e, i) => expect(e.value).toBeGreaterThanOrEqual(lv1[i]!.value));
      burst10.forEach((e, i) => expect(e.multiplier).toBeGreaterThanOrEqual(burst1[i]!.multiplier));
      timed10.forEach((e, i) => {
        expect(e.value).toBeGreaterThanOrEqual(timed1[i]!.value);
        expect(e.durationFrames).toBe(timed1[i]!.durationFrames);
      });
    });

    it('explains what is not modeled', () => {
      for (const slot of SKILL_SLOTS) {
        const entry = def.skills[slot];
        if (entry.support !== 'supported') expect(entry.notes?.length ?? 0, `${slot} notes`).toBeGreaterThan(0);
      }
    });
  });
});
