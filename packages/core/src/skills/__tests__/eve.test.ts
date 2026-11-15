// イヴ編（plan/design-eve.md 2 節）: 射撃の回数のきっかけの damage に開いた N 回順番に攻撃（hitsRef）と、弾丸チャージに開いた敵の属性の
// 条件（enemyElement）の検証と解決
import { describe, expect, it } from 'vitest';
import { characterOf, rawDefinition } from '../../__tests__/teamHelpers.ts';
import { resolveDamageEffects, resolvePerShotDamage } from '../burstDamage.ts';
import { MAX_SKILL_LEVELS } from '../resolve.ts';
import { parseSkillDefinition } from '../types.ts';

type Effects = { effects: Record<string, unknown>[] };
type Raw = { skills: { skill1: Effects; skill2: Effects; burst: Effects } };
const EVE = 850;
const raw = rawDefinition<Raw>(EVE);
const character = characterOf(EVE);
const LV1 = { skill1: 1, skill2: 1, burst: 1 };

const withEffect = (slot: keyof Raw['skills'], index: number, patch: Record<string, unknown>) => {
  const copy = structuredClone(raw);
  copy.skills[slot].effects[index] = { ...copy.skills[slot].effects[index], ...patch };
  return parseSkillDefinition(copy);
};

describe('語彙の検証', () => {
  it('accepts the definition', () => {
    expect(() => parseSkillDefinition(raw)).not.toThrow();
  });

  it('reads enemyElement on ammoRefill and still rejects it on the other instant effects', () => {
    const def = parseSkillDefinition(raw);
    expect(def.skills.skill2.effects[3]).toMatchObject({ kind: 'ammoRefill', enemyElement: 'Electronic' });
    const copy = structuredClone(raw);
    copy.skills.skill2.effects.push({
      kind: 'cooldownReduction',
      trigger: 'burstUse',
      target: 'self',
      seconds: 1,
      enemyElement: 'Electronic',
    });
    expect(() => parseSkillDefinition(copy)).toThrow(/enemyElement/);
  });
});

describe('射撃の回数のきっかけの N 回順番に攻撃', () => {
  it('resolves Unstable Energy as 3 sequential hits that do not fold into the shot', () => {
    const def = parseSkillDefinition(raw);
    const hits = resolveDamageEffects(def, character, MAX_SKILL_LEVELS).filter((e) => e.source.skill === 'skill1');
    expect(hits).toHaveLength(2);
    for (const e of hits) {
      expect(e).toMatchObject({ hits: 3, hitIntervalFrames: 12, sequential: true, valueDelayFrames: 0 });
      expect(e.trigger).toEqual({ count: 'critHit', every: 44 });
    }
    expect(hits[0]!.multiplier).toBeCloseTo(2.4, 10);
    const lv1 = resolveDamageEffects(def, character, LV1).filter((e) => e.source.skill === 'skill1');
    expect(lv1[0]!.multiplier).toBeCloseTo(1.4182, 10);
    expect(resolvePerShotDamage(def, character, MAX_SKILL_LEVELS)).toEqual([]);
  });

  it('does not fold sequential hits into the shot even on a per-shot trigger', () => {
    const def = withEffect('skill1', 1, {
      trigger: { count: 'normalShot', every: 1 },
      delayFrames: undefined,
      gaugePerHit: undefined,
    });
    expect(resolvePerShotDamage(def, character, MAX_SKILL_LEVELS)).toEqual([]);
    const perShot = resolveDamageEffects(def, character, MAX_SKILL_LEVELS).find((e) => e.effectIndex === 1);
    expect(perShot).toMatchObject({ hits: 3, trigger: { count: 'normalShot', every: 1 } });
  });
});
