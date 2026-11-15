// ブレッディ編（plan/design-bready.md 2 節）: 「〈stat〉増加効果が適用された時」のきっかけ（{ buffApplied }）、条件「自分が〈stat〉増加状態で
// なければ」（selfBuffed の present: false）、持続ダメージの効果▲（dotEffect）の語彙の検証と解決と、tick の式
import { describe, expect, it } from 'vitest';
import { characterOf, rawDefinition } from '../../__tests__/teamHelpers.ts';
import { computeBurstHit, type BurstHitInput, type ResolvedSkillDamage } from '../burstDamage.ts';
import { MAX_SKILL_LEVELS, resolveStateGrants, resolveTimed } from '../resolve.ts';
import { namedStateGroup } from '../states.ts';
import { parseSkillDefinition } from '../types.ts';

type Effects = { effects: Record<string, unknown>[] };
type Raw = { skills: { skill1: Effects; skill2: Effects; burst: Effects } };
const BREADY = 520;
const raw = rawDefinition<Raw>(BREADY);
const character = characterOf(BREADY);

const patched = (slot: keyof Raw['skills'], index: number, patch: Record<string, unknown>) => {
  const copy = structuredClone(raw);
  copy.skills[slot].effects[index] = { ...copy.skills[slot].effects[index], ...patch };
  return () => parseSkillDefinition(copy);
};
const indexOf = (slot: keyof Raw['skills'], match: (e: Record<string, unknown>) => boolean) =>
  raw.skills[slot].effects.findIndex(match);
const LINGERING = indexOf('skill1', (e) => e.state === 'lingeringTaste');
const RECOMMENDED = indexOf('skill1', (e) => e.state === 'recommendedTaste');
const DAMAGE_TAKEN = indexOf('skill2', (e) => e.stat === 'damageTaken');

describe('語彙の検証', () => {
  it('accepts the definition', () => {
    expect(() => parseSkillDefinition(raw)).not.toThrow();
  });

  it('takes { buffApplied } only on a grant on self, with a stat that has a buff state', () => {
    expect(patched('skill2', DAMAGE_TAKEN, { trigger: { buffApplied: 'sustainedDamage' } })).toThrow(
      /only allowed in state grants/,
    );
    expect(patched('skill1', LINGERING, { target: 'allies' })).toThrow(/can only target "self"/);
    expect(patched('skill1', LINGERING, { trigger: { buffApplied: 'damageTaken' } })).toThrow(/held by the enemy/);
    expect(patched('skill1', LINGERING, { trigger: { buffApplied: 'pierce' } })).toThrow(/not a buff state/);
    expect(patched('skill1', LINGERING, { trigger: { buffApplied: 'attack', extra: 1 } })).toThrow(/extra/);
  });

  it('reads selfBuffed { stat, present: false } as "if not buffed"', () => {
    const def = parseSkillDefinition(raw);
    expect(def.skills.skill1.effects[RECOMMENDED]).toMatchObject({
      condition: { selfBuffed: { stat: 'sustainedDamage', present: false } },
    });
    const cond = (selfBuffed: unknown) => patched('skill1', RECOMMENDED, { condition: { selfBuffed } });
    expect(cond({ stat: 'sustainedDamage', present: true })).toThrow(/expected false/);
    expect(cond({ stat: 'damageTaken', present: false })).toThrow(/held by the enemy/);
    expect(cond({ stat: 'sustainedDamage', present: false, other: 1 })).toThrow(/other/);
  });

  it('puts the two tastes in one switch group', () => {
    expect(namedStateGroup('lingeringTaste')).toBe('taste');
    expect(namedStateGroup('recommendedTaste')).toBe('taste');
  });
});

describe('解決', () => {
  const levels = MAX_SKILL_LEVELS;
  it('resolves the taste grants on { buffApplied } with the Charge Speed down', () => {
    const grants = resolveStateGrants(parseSkillDefinition(raw), character, levels);
    expect(grants.find((g) => g.state === 'lingeringTaste')!.trigger).toEqual({ buffApplied: 'sustainedDamage' });
    expect(grants.find((g) => g.state === 'recommendedTaste')!.trigger).toEqual({ buffApplied: 'distributedDamage' });
  });

  it('resolves the Aftertaste Effect up as dotEffect 349.8% at Lv10', () => {
    const timed = resolveTimed(parseSkillDefinition(raw), character, levels);
    const up = timed.find((e) => e.stat === 'dotEffect')!;
    expect(up.value).toBeCloseTo(3.498, 6);
    expect(up.source.skill).toBe('burst');
  });
});

describe('持続ダメージの効果▲の式', () => {
  const base: Omit<BurstHitInput, 'effects'> = {
    attack: 10_000,
    enemy: { defence: 0, element: null, hasCore: false },
    crit: { rate: 0, damage: 0.5 },
    attackDamageMultiplier: 1.6,
    elementMultiplier: 1,
    fullBurstBonus: false,
    sustainedDamage: 0.2,
  };
  const effect = (sustained: boolean): ResolvedSkillDamage => ({
    source: { resourceId: BREADY, skill: 'skill2', name: { ja: '', en: '' } },
    damageType: 'skill',
    multiplier: 1.5,
    ...(sustained ? { sustained: true as const } : {}),
  });
  const value = (dotEffect: number, sustained: boolean) =>
    computeBurstHit({ ...base, effects: [effect(sustained)], dotEffect }).perActivation;

  it('multiplies only sustained ticks by (1 + Σ) as a separate factor', () => {
    expect(value(3.498, true) / value(0, true)).toBeCloseTo(4.498, 9);
    expect(value(3.498, false)).toBeCloseTo(value(0, false), 9);
  });
});
