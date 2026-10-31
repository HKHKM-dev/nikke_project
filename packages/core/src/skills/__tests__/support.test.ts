// スキル定義の対応状況の索引（data/skills/support.json。skills/support.ts）: 完全対応の判定と、生成物が最新であること
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SKILL_SUPPORT_PATH, skillSupportIndexOfData } from '../../../scripts/records-data.ts';
import { makeCharacter } from '../../__tests__/fixtures.ts';
import type { CharacterData, SkillRaw } from '../../types.ts';
import { buildSkillSupportIndex, parseSkillSupportIndex, renderSkillSupportIndex } from '../support.ts';
import { parseSkillDefinition, type SkillDefinition } from '../types.ts';

function raw(id: number): SkillRaw {
  return { id, name: { ja: `s${id}`, en: `s${id}` }, description: { ja: '', en: '' }, values: [Array(10).fill('10')] };
}

const unimplemented = { ja: 'a', en: 'a', kind: 'unimplemented' };
const passive = { effects: [{ kind: 'passive', target: 'self', stat: 'attack', ref: 1 }] };
const burst = { effects: [{ kind: 'burstDamage', ref: 1, damageType: 'skill' }] };
const noEffect = { effects: [], notes: [{ ja: 'b', en: 'b', kind: 'noDamage' }] };

function definition(resourceId: number, patch: Record<string, unknown> = {}): SkillDefinition {
  return parseSkillDefinition({
    formatVersion: 1,
    resourceId,
    checkedAt: '2026-10-31',
    skills: { skill1: passive, skill2: noEffect, burst, ...(patch.skills as object) },
    ...(patch.treasureSkills === undefined ? {} : { treasureSkills: patch.treasureSkills }),
  });
}

function character(resourceId: number, treasure: boolean): CharacterData {
  return makeCharacter(
    {},
    {
      resourceId,
      skills: { skill1: raw(1), skill2: raw(2), burst: raw(3) },
      treasure: treasure
        ? {
            favoriteId: 200001,
            name: { ja: '宝物', en: 'Treasure' },
            unlockOrder: ['skill2', 'burst', 'skill1'],
            skills: { skill1: raw(51), skill2: raw(52), burst: raw(53) },
          }
        : null,
    },
  );
}

describe('buildSkillSupportIndex', () => {
  it('lists only characters with no partial or unsupported slot, in the base and the treasure version', () => {
    const index = buildSkillSupportIndex([
      // 効果の無いスロット（noEffect）は完全対応に数える
      { definition: definition(30), character: character(30, false) },
      // 基礎版に未実装（partial）
      {
        definition: definition(10, { skills: { skill1: { ...passive, notes: [unimplemented] } } }),
        character: character(10, false),
      },
      // 宝物版の定義がそろっている
      {
        definition: definition(20, { treasureSkills: { skill1: passive, skill2: passive, burst } }),
        character: character(20, true),
      },
      // 宝物版に未実装（unsupported）
      {
        definition: definition(40, {
          treasureSkills: { skill1: passive, skill2: { effects: [], notes: [unimplemented] }, burst },
        }),
        character: character(40, true),
      },
      // 宝物版の定義が無いスロットは unsupported（skills/treasure.ts）
      {
        definition: definition(50, { treasureSkills: { skill2: passive, burst } }),
        character: character(50, true),
      },
    ]);
    expect(index).toEqual({ formatVersion: 1, fullySupported: [20, 30] });
  });

  it('round-trips through the file and rejects a malformed index', () => {
    const index = { formatVersion: 1 as const, fullySupported: [3, 7] };
    expect(parseSkillSupportIndex(JSON.parse(renderSkillSupportIndex(index)))).toEqual(index);
    expect(() => parseSkillSupportIndex({ formatVersion: 2, fullySupported: [] })).toThrow(/formatVersion/);
    expect(() => parseSkillSupportIndex({ formatVersion: 1, fullySupported: [0] })).toThrow(/positive integers/);
    expect(() => parseSkillSupportIndex([])).toThrow(/object/);
  });
});

describe('data/skills/support.json（実データ）', () => {
  it('matches the definitions (npm run records:check)', () => {
    expect(readFileSync(SKILL_SUPPORT_PATH, 'utf8')).toBe(renderSkillSupportIndex(skillSupportIndexOfData()));
  });
});
