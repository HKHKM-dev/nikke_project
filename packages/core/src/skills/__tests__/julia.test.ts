// ジュリア（150）の語彙（plan/design-julia.md 2.1 節）: 倍率ダメージの会心をきっかけにする 1 ヒット（damage の onSkillCrit）の検証・解決と、
// 期待値（値 × 倍率ダメージの会心率）と、出た時の 1 ヒットの値（oneHitValue は会心率を外す）
import { describe, expect, it } from 'vitest';
import { characterOf, rawDefinition } from '../../__tests__/teamHelpers.ts';
import type { EnemyInput } from '../../damage.ts';
import { computeBurstHit, oneHitValue, resolveDamageEffects, type ResolvedSkillDamage } from '../burstDamage.ts';
import { MAX_SKILL_LEVELS } from '../resolve.ts';
import { applyTreasure, TREASURE_PHASE_MAX } from '../treasure.ts';
import { parseSkillDefinition } from '../types.ts';

type Effects = { effects: Record<string, unknown>[] };
type Raw = { treasureSkills: { skill2: Effects } };
const JULIA = 150;
const raw = rawDefinition<Raw>(JULIA);
const followUp = raw.treasureSkills.skill2.effects.findIndex((e) => e.onSkillCrit === true);

const patched = (patch: Record<string, unknown>) => {
  const copy = structuredClone(raw);
  copy.treasureSkills.skill2.effects[followUp] = { ...copy.treasureSkills.skill2.effects[followUp], ...patch };
  return copy;
};

describe('語彙の検証', () => {
  it('accepts the definition', () => {
    expect(followUp).toBeGreaterThanOrEqual(0);
    expect(() => parseSkillDefinition(raw)).not.toThrow();
  });

  it('accepts only true for onSkillCrit', () => {
    expect(() => parseSkillDefinition(patched({ onSkillCrit: false }))).toThrow(/onSkillCrit/);
  });

  it('rejects onSkillCrit on a per-shot damage that folds into the shot', () => {
    const def = parseSkillDefinition(patched({ trigger: { count: 'normalShot' } }));
    const applied = applyTreasure(characterOf(JULIA), def, TREASURE_PHASE_MAX);
    expect(() => resolveDamageEffects(applied.definition!, applied.character, MAX_SKILL_LEVELS)).toThrow(
      /cannot fire on a skill critical hit/,
    );
  });
});

describe('解決', () => {
  it('marks the follow-up hit with the Marcato trigger (every 8 critical hits)', () => {
    const def = parseSkillDefinition(raw);
    const applied = applyTreasure(characterOf(JULIA), def, TREASURE_PHASE_MAX);
    const skill2 = resolveDamageEffects(applied.definition!, applied.character, MAX_SKILL_LEVELS).filter(
      (r) => r.source.skill === 'skill2',
    );
    expect(skill2.map((r) => [r.multiplier, r.onSkillCrit])).toEqual([
      [0.88, undefined],
      [1, true],
    ]);
    expect(skill2.map((r) => r.trigger)).toEqual([skill2[0]!.trigger, skill2[0]!.trigger]);
  });
});

describe('computeBurstHit: onSkillCrit', () => {
  const enemy: EnemyInput = { defence: 100, element: 'Wind', hasCore: false };
  const source = { resourceId: JULIA, skill: 'skill2' as const, name: { ja: '', en: '' } };
  const marcato: ResolvedSkillDamage = { source, damageType: 'additional', multiplier: 0.88 };
  const follow: ResolvedSkillDamage = { source, damageType: 'additional', multiplier: 1, onSkillCrit: true };
  const hit = (effect: ResolvedSkillDamage, rate: number) =>
    computeBurstHit({
      attack: 10100,
      enemy,
      crit: { rate, damage: 2.74 },
      attackDamageMultiplier: 1,
      elementMultiplier: 1,
      effects: [effect],
    });

  it('multiplies the expected value by the skill crit rate', () => {
    const plain = hit({ ...follow, onSkillCrit: undefined }, 0.4104);
    const marked = hit(follow, 0.4104);
    expect(marked.perActivation).toBeCloseTo(plain.perActivation * 0.4104, 6);
    expect(marked.onSkillCritRate).toBe(0.4104);
    expect(hit(marcato, 0.4104).onSkillCritRate).toBeUndefined();
  });

  it('gives the value of the hit when it fires (oneHitValue removes the crit rate)', () => {
    const plain = hit({ ...follow, onSkillCrit: undefined }, 0.4104);
    const marked = hit(follow, 0.4104);
    expect(oneHitValue(marked, false)).toBeCloseTo(oneHitValue(plain, false), 6);
    expect(oneHitValue(marked, true)).toBeCloseTo(oneHitValue(plain, true), 6);
    expect(oneHitValue(marked, false)).toBeCloseTo(10000, 6);
  });

  it('never fires at a crit rate of 0', () => {
    const marked = hit(follow, 0);
    expect(marked.perActivation).toBe(0);
    expect(oneHitValue(marked, false)).toBe(0);
  });
});
