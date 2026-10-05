// 対象の語彙編（plan/design-target-vocab.md 4 節）: 予測の仮説の override で定義に効果を足す（CompareSetup.addEffects）
import { describe, expect, it } from 'vitest';
import { loadSkillDefinitions } from '../../../scripts/records-data.ts';
import { withAddedEffects } from '../observations.ts';

const effect = { kind: 'passive', target: 'self', stat: 'attack', ref: 1 };

describe('withAddedEffects', () => {
  it('leaves every definition unchanged except for the added effect', () => {
    for (const { definition } of loadSkillDefinitions()) {
      const added = withAddedEffects(definition, [{ rid: definition.resourceId, skill: 'skill1', effect }]);
      const skill1 = added.skills.skill1;
      expect(skill1.effects.at(-1)).toEqual(effect);
      expect({
        ...added,
        skills: { ...added.skills, skill1: { ...skill1, effects: skill1.effects.slice(0, -1) } },
      }).toEqual({
        ...definition,
        skills: {
          ...definition.skills,
          // 効果が足されると対応状況は読み込みで決め直される
          skill1: { ...definition.skills.skill1, support: skill1.support },
        },
      });
    }
  });

  it('returns the definition itself without effects to add, and checks the added effect', () => {
    const definition = loadSkillDefinitions()
      .map((d) => d.definition)
      .find((d) => d.skills.skill1.effects.length > 0)!;
    expect(withAddedEffects(definition, [])).toBe(definition);
    const replaced = withAddedEffects(definition, [
      { rid: definition.resourceId, skill: 'skill1', effect, replace: 0 },
    ]);
    expect(replaced.skills.skill1.effects[0]).toEqual(effect);
    expect(replaced.skills.skill1.effects).toHaveLength(definition.skills.skill1.effects.length);
    expect(() => withAddedEffects(definition, [{ rid: 1, skill: 'skill1', effect, replace: 99 }])).toThrow(/99 番目/);
    expect(() =>
      withAddedEffects(definition, [
        { rid: definition.resourceId, skill: 'skill1', effect: { ...effect, target: 'x' } },
      ]),
    ).toThrow(/target/);
  });
});
