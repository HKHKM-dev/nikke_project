// キロ（361）の語彙（plan/design-kilo.md 2.1・2.2 節）: 最大HP を攻撃力として換算するバーストスキルダメージ（burstDamage の
// convertCasterMaxHpRef）の検証・解決と、ヒットの攻撃力が自分の最終最大HP × 比率に置き換わること。状態ナノコーティングがバリアの家族に入ること
import { describe, expect, it } from 'vitest';
import { characterOf, fixedTeam, rawDefinition } from '../../__tests__/teamHelpers.ts';
import { runSimulation } from '../../sim/engine.ts';
import { resolveBurstDamage } from '../burstDamage.ts';
import { parseSkillDefinition } from '../parse/definition.ts';
import { MAX_SKILL_LEVELS } from '../resolve.ts';
import { statesMatching } from '../states.ts';

type Effects = { effects: Record<string, unknown>[] };
type Raw = { skills: { skill1: Effects; skill2: Effects; burst: Effects } };
const KILO = 361;
const raw = rawDefinition<Raw>(KILO);

const patchedBurst = (patch: Record<string, unknown>): Raw => {
  const copy = structuredClone(raw);
  copy.skills.burst.effects[0] = { ...copy.skills.burst.effects[0], ...patch };
  return copy;
};

describe('語彙の検証', () => {
  it('accepts the definition', () => {
    expect(() => parseSkillDefinition(raw)).not.toThrow();
  });

  it('rejects convertCasterMaxHpRef with addCasterMaxHpRef or with another burstDamage', () => {
    expect(() => parseSkillDefinition(patchedBurst({ addCasterMaxHpRef: 1 }))).toThrow(
      /convertCasterMaxHpRef cannot be used with addCasterMaxHpRef/,
    );
    const two = structuredClone(raw);
    two.skills.burst.effects.push({ kind: 'burstDamage', damageType: 'skill', ref: 2 });
    expect(() => parseSkillDefinition(two)).toThrow(/need the only burstDamage/);
  });

  it('puts Nano Coating in the barrier family', () => {
    expect(statesMatching('barrier')).toContain('nanoCoating');
  });
});

describe('解決', () => {
  it('resolves the burst as one hit converting 5% of the max HP to the attack, on all enemies', () => {
    const burst = resolveBurstDamage(parseSkillDefinition(raw), characterOf(KILO), MAX_SKILL_LEVELS);
    expect(burst.map((r) => [r.multiplier, r.convertCasterMaxHpRatio, r.addCasterMaxHpRatio, r.allEnemies])).toEqual([
      [11.5084, 0.05, undefined, true],
    ]);
  });
});

describe('ヒットの攻撃力', () => {
  // 撮影の編成（ココア + ソルジャーF.A. + キロ）。キロの最終最大HP を枠の上書きで変える
  const team = (hpOverride: number, def: unknown) => {
    const input = fixedTeam([311, 301, KILO], 2);
    input.slots[2] = { ...input.slots[2]!, hpOverride };
    input.slots[2]!.skills = { definition: parseSkillDefinition(def), levels: MAX_SKILL_LEVELS };
    return input;
  };
  const defence = fixedTeam([KILO], 0).enemy.defence;
  const firstBurst = (hp: number, def: unknown) => runSimulation(team(hp, def)).slots[2]!.burst.hits[0]!.perActivation;

  it('replaces the attack of the burstDamage hit by the final max HP × 5% (before subtracting the defence)', () => {
    const at1m = firstBurst(1_000_000, raw);
    const at2m = firstBurst(2_000_000, raw);
    expect(at2m / at1m).toBeCloseTo((100_000 - defence) / (50_000 - defence), 9);
  });

  it('differs from adding the max HP to the attack (addCasterMaxHpRef) by the final attack', () => {
    const added = firstBurst(1_000_000, patchedBurst({ convertCasterMaxHpRef: undefined, addCasterMaxHpRef: 1 }));
    const converted = firstBurst(1_000_000, raw);
    expect(added).toBeGreaterThan(converted);
  });
});
