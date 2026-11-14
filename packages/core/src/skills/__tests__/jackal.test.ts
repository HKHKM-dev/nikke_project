// plan/design-jackal.md 2 節: 「スキル対象の説明部分が『〜敵1機に』で終わるバーストスキルダメージ▲」（oneEnemyBurstDamage）。
// 説明文の対象の句から burstDamage に印 oneEnemy を付け、印の付いたヒットにだけ攻撃ダメージ▲と同じ和で掛ける
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { makeCharacter } from '../../__tests__/fixtures.ts';
import type { EnemyInput } from '../../damage.ts';
import type { CharacterData, SkillRaw } from '../../types.ts';
import { computeBurstHit, resolveBurstDamage, type ResolvedSkillDamage } from '../burstDamage.ts';
import { MAX_SKILL_LEVELS, targetPhraseOf } from '../resolve.ts';
import { applyTreasure, TREASURE_PHASE_MAX } from '../treasure.ts';
import { parseSkillDefinition, type SkillDefinition } from '../types.ts';

const same = (v: string) => Array.from({ length: 10 }, () => v);
const empty: SkillRaw = { id: 0, name: { ja: '', en: '' }, description: { ja: '', en: '' }, values: [] };
const burst: SkillRaw = {
  id: 3,
  name: { ja: 'バースト', en: 'Burst' },
  description: {
    ja:
      '■<word_group=1>最終</word_group>攻撃力が最も高い敵{description_value_01}機に\n<color=#00AEFF>「最終攻撃力の{description_value_02}％の\nバーストスキルダメージ」</color>\n' +
      '■敵全体に\n「最終攻撃力の{description_value_03}％のバーストスキルダメージ」\n' +
      '■照準線に最も近い敵 1機に\n「最終攻撃力の{description_value_04}％の追加ダメージ」',
    en: '',
  },
  values: [same('1'), same('300'), same('200'), same('100')],
};
const character = makeCharacter({}, { resourceId: 7, skills: { skill1: empty, skill2: empty, burst } });
const definition: SkillDefinition = {
  formatVersion: 1,
  resourceId: 7,
  checkedAt: '2026-11-14',
  skills: {
    skill1: { support: 'unsupported', effects: [] },
    skill2: { support: 'unsupported', effects: [] },
    burst: {
      support: 'supported',
      effects: [
        { kind: 'burstDamage', ref: 2, damageType: 'skill' },
        { kind: 'burstDamage', ref: 3, damageType: 'skill' },
        // 対象の句の中の値でも、その行の対象の句で決まる
        { kind: 'burstDamage', ref: 1, damageType: 'skill' },
      ],
    },
  },
};

describe('targetPhraseOf', () => {
  it('reads the target phrase of the line holding the value, with the level values in and tags and spaces out', () => {
    expect(targetPhraseOf(burst, 2, 10)).toBe('最終攻撃力が最も高い敵1機に');
    expect(targetPhraseOf(burst, 3, 10)).toBe('敵全体に');
    expect(targetPhraseOf(burst, 4, 10)).toBe('照準線に最も近い敵1機に');
  });

  it('is undefined when no line holds the value (a value used only in the target phrase still counts)', () => {
    expect(targetPhraseOf(burst, 1, 10)).toBe('最終攻撃力が最も高い敵1機に');
    expect(targetPhraseOf({ ...burst, description: { ja: '■敵全体に「X」', en: '' } }, 2, 10)).toBeUndefined();
  });
});

describe('resolveBurstDamage: oneEnemy', () => {
  it('marks only the burstDamage whose line ends with 敵1機に', () => {
    const resolved = resolveBurstDamage(definition, character, MAX_SKILL_LEVELS);
    expect(resolved.map((r) => r.oneEnemy)).toEqual([true, undefined, true]);
    const noLine = resolveBurstDamage(
      {
        ...definition,
        skills: {
          ...definition.skills,
          burst: { support: 'supported', effects: [{ kind: 'burstDamage', ref: 2, damageType: 'skill' }] },
        },
      },
      makeCharacter(
        {},
        {
          resourceId: 7,
          skills: {
            skill1: empty,
            skill2: empty,
            burst: { ...burst, description: { ja: '最終攻撃力の300%', en: '' } },
          },
        },
      ),
      MAX_SKILL_LEVELS,
    );
    expect(noLine[0]?.oneEnemy).toBeUndefined();
  });
});

describe('computeBurstHit: oneEnemyBurstDamage', () => {
  const enemy: EnemyInput = { defence: 100, element: 'Wind', hasCore: false };
  const source = { resourceId: 7, skill: 'burst' as const, name: burst.name };
  const one: ResolvedSkillDamage = { source, damageType: 'skill', multiplier: 3, oneEnemy: true };
  const all: ResolvedSkillDamage = { source, damageType: 'skill', multiplier: 2 };
  const hit = (attackDamageMultiplier: number, oneEnemyBurstDamage?: number) =>
    computeBurstHit({
      attack: 10100,
      enemy,
      crit: { rate: 0, damage: 1.5 },
      attackDamageMultiplier,
      elementMultiplier: 1,
      effects: [one, all],
      ...(oneEnemyBurstDamage === undefined ? {} : { oneEnemyBurstDamage }),
    });

  it('adds Σ to the attack damage sum of the marked hit only', () => {
    const base = hit(1);
    const up = hit(1, 0.3891);
    expect(up.perEffect[0]!.expected).toBeCloseTo(base.perEffect[0]!.expected * 1.3891, 6);
    expect(up.perEffect[1]!.expected).toBe(base.perEffect[1]!.expected);
    expect(up.oneEnemyBurstDamageMultiplier).toBeCloseTo(1.3891, 12);
  });

  it('shares the sum with the attack damage up (論点 3)', () => {
    const base = hit(1.2);
    const up = hit(1.2, 0.3);
    expect(up.perEffect[0]!.expected / base.perEffect[0]!.expected).toBeCloseTo(1.5 / 1.2, 12);
  });

  it('is 1 without the buff', () => {
    expect(hit(1).oneEnemyBurstDamageMultiplier).toBe(1);
  });
});

describe('data: which burstDamage get the oneEnemy mark', () => {
  // 説明文を取り込み直して対象の句が変わったら、ここで気づく（plan/design-jackal.md 2.2 節。宝物版は宝物の説明文で決まる）
  it('marks the 敵1機に bursts of the defined characters, base and treasure', () => {
    const dir = new URL('../../../data/', import.meta.url);
    const read = (path: string): unknown => JSON.parse(readFileSync(new URL(path, dir), 'utf8'));
    const ids = (read('skills/index.json') as { resourceIds: number[] }).resourceIds;
    const marked: string[] = [];
    for (const id of ids) {
      const def = parseSkillDefinition(read(`skills/${id}.json`));
      const character = read(`characters/${id}.json`) as CharacterData;
      const variants: [string, SkillDefinition, CharacterData][] = [[`${id}`, def, character]];
      if (def.treasureSkills !== undefined && character.treasure !== null) {
        const applied = applyTreasure(character, def, TREASURE_PHASE_MAX);
        variants.push([`${id}t`, applied.definition!, applied.character]);
      }
      for (const [label, d, c] of variants)
        if (resolveBurstDamage(d, c, MAX_SKILL_LEVELS).some((r) => r.oneEnemy === true)) marked.push(label);
    }
    expect(marked).toEqual(['10', '141', '141t', '202', '304', '352', '352t', '400', '500', '515']);
  });
});
