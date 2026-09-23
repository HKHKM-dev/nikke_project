// data/skills/ の手書き定義がキャラデータと整合していることを固定する。
// Stage 9: 宝物版の定義（treasureSkills）は、宝物の全段階（3）で差し替えたキャラデータ・定義に同じ検査を掛ける。
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CharacterData } from '../../types.ts';
import { resolveBurstDamage, resolveDamageEffects } from '../burstDamage.ts';
import { MAX_SKILL_LEVELS, resolvePassives, resolveTimed, skillValue } from '../resolve.ts';
import { applyTreasure, TREASURE_PHASE_MAX } from '../treasure.ts';
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

  // 基礎版と、treasureSkills があれば宝物版（全段階で差し替えたもの）
  const variants = files.flatMap((resourceId) => {
    const def = parseSkillDefinition(readJson(join(SKILLS_DIR, `${resourceId}.json`)));
    const character = readJson(join(DATA_DIR, 'characters', `${resourceId}.json`)) as CharacterData;
    const base = { label: `${resourceId}`, resourceId, def, character };
    if (def.treasureSkills === undefined || character.treasure === null) return [base];
    const applied = applyTreasure(character, def, TREASURE_PHASE_MAX);
    return [
      base,
      { label: `${resourceId} (treasure)`, resourceId, def: applied.definition!, character: applied.character },
    ];
  });

  describe.each(files)('treasure definition %i (Stage 9)', (resourceId) => {
    const def = parseSkillDefinition(readJson(join(SKILLS_DIR, `${resourceId}.json`)));
    const character = readJson(join(DATA_DIR, 'characters', `${resourceId}.json`)) as CharacterData;

    // 宝物版の定義が無いスロットは unsupported になる（設計書 2.2 節）ので、スロットが揃っていることまでは求めない
    it('exists only for characters with a treasure', () => {
      if (def.treasureSkills === undefined) return;
      expect(character.treasure, 'treasureSkills without a treasure').not.toBeNull();
    });
  });

  describe.each(variants)('definition $label', ({ resourceId, def, character }) => {
    it('names the character of its file and a checked date', () => {
      expect(def.resourceId).toBe(resourceId);
      expect(character.resourceId).toBe(resourceId);
      expect(def.checkedAt <= new Date().toISOString().slice(0, 10)).toBe(true);
    });

    it('references values that exist for every level (buffs ≤ 100%, burst damage ≥ 100% at Lv10)', () => {
      for (const slot of SKILL_SLOTS) {
        for (const effect of def.skills[slot].effects) {
          const entry = character.skills[slot].values[effect.ref - 1];
          expect(entry, `${slot} ref ${effect.ref}`).toHaveLength(SKILL_LEVEL_MAX);
          for (let lv = 1; lv <= SKILL_LEVEL_MAX; lv++) {
            const v = skillValue(character.skills[slot], effect.ref, lv);
            expect(v).toBeGreaterThan(0);
            // イサベルのバーストは Lv1 で 93.65%（Lv10 で 149.85%）なので、下限は Lv10 だけで見る
            if (effect.kind === 'burstDamage') {
              if (lv === SKILL_LEVEL_MAX) expect(v).toBeGreaterThanOrEqual(100);
            }
            // Stage 8 の倍率ダメージは 100% 未満もある（ドレイク S2 98.55%）ので上限を見ない
            else if (effect.kind !== 'damage') expect(v).toBeLessThanOrEqual(100);
          }
        }
      }
    });

    it('count triggers resolve to the same positive integer at every level (Stage 8)', () => {
      for (const slot of SKILL_SLOTS) {
        for (const effect of def.skills[slot].effects) {
          if (effect.kind !== 'timed' && effect.kind !== 'damage') continue;
          const t = effect.trigger;
          if (typeof t !== 'object' || !('everyRef' in t) || t.everyRef === undefined) continue;
          const counts = Array.from({ length: SKILL_LEVEL_MAX }, (_, i) =>
            skillValue(character.skills[slot], t.everyRef!, i + 1),
          );
          expect(Number.isInteger(counts[0]) && counts[0]! >= 1, `${slot} everyRef ${t.everyRef}`).toBe(true);
          expect(new Set(counts).size, `${slot} everyRef ${t.everyRef}`).toBe(1);
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
      const damage10 = resolveDamageEffects(def, character, MAX_SKILL_LEVELS);
      const damage1 = resolveDamageEffects(def, character, { skill1: 1, skill2: 1, burst: 1 });
      expect(lv10.length + burst10.length + timed10.length + damage10.length).toBeGreaterThan(0);
      damage10.forEach((e, i) => {
        expect(e.multiplier).toBeGreaterThanOrEqual(damage1[i]!.multiplier);
        expect(e.trigger).toEqual(damage1[i]!.trigger);
      });
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
