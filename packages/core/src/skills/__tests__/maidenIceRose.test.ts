// メイデン：アイスローズ（183）の語彙（plan/design-maiden-ice-rose.md 2.2 節）: 最大HP を攻撃力に合算するダメージ（damage の
// addCasterMaxHpRef）の検証・解決と、ヒットの攻撃力に自分の最終最大HP × 比率が足されること
import { describe, expect, it } from 'vitest';
import { characterOf, fixedTeam, rawDefinition } from '../../__tests__/teamHelpers.ts';
import { planTeamRun } from '../../frame/plan.ts';
import { computeFixedSpecAttack } from '../../fixedSpec.ts';
import { resolveDamageEffects } from '../burstDamage.ts';
import { MAX_SKILL_LEVELS } from '../resolve.ts';
import { parseSkillDefinition } from '../types.ts';

type Effects = { effects: Record<string, unknown>[] };
type Raw = { skills: { skill1: Effects; skill2: Effects; burst: Effects } };
const MAIDEN = 183;
const raw = rawDefinition<Raw>(MAIDEN);

describe('語彙の検証', () => {
  it('accepts the definition', () => {
    expect(() => parseSkillDefinition(raw)).not.toThrow();
  });

  it('rejects addCasterMaxHpRef on the forms that do not compute a skill hit', () => {
    expect(() =>
      parseSkillDefinition(patchedBurstOf(raw, { damageType: 'fixedShare', trigger: { count: 'fullChargeShot' } })),
    ).toThrow(/addCasterMaxHpRef cannot be used/);
  });

  it('rejects addCasterMaxHpRef on a per-shot damage that folds into the shot', () => {
    const copy = structuredClone(raw);
    copy.skills.skill2.effects[4] = { ...copy.skills.skill2.effects[4], addCasterMaxHpRef: 10 };
    expect(() => resolveDamageEffects(parseSkillDefinition(copy), characterOf(MAIDEN), MAX_SKILL_LEVELS)).toThrow(
      /cannot add the max HP to the attack/,
    );
  });
});

describe('解決', () => {
  it('resolves the burst as MP-count hits with 10% of the max HP added to the attack', () => {
    const burst = resolveDamageEffects(parseSkillDefinition(raw), characterOf(MAIDEN), MAX_SKILL_LEVELS).filter(
      (r) => r.source.skill === 'burst',
    );
    expect(burst.map((r) => [r.multiplier, r.addCasterMaxHpRatio, r.perCount])).toEqual([
      [13.728, 0.1, { counter: 'mp' }],
    ]);
  });
});

describe('ヒットの攻撃力', () => {
  // S2 の HP に比例する攻撃力▲と S1 の最大HP のみ▲ を外し、攻撃力がスペック固定の値のままの編成（ココア + ソルジャーF.A. + メイデン）で比べる
  const bare = structuredClone(raw);
  bare.skills.skill1.effects.splice(3, 1);
  bare.skills.skill2.effects.splice(0, 4);
  const firstBurstHit = (hpOverride: number, def: unknown) => {
    const input = fixedTeam([311, 301, MAIDEN], 2);
    input.slots[2] = { ...input.slots[2]!, hpOverride };
    input.slots[2]!.skills = { definition: parseSkillDefinition(def), levels: MAX_SKILL_LEVELS };
    const hit = planTeamRun(input).skillHits.find((h) => h.slotIndex === 2 && h.effect.source.skill === 'burst');
    expect(hit).toBeDefined();
    return hit!.hit.perActivation;
  };

  it('adds the final max HP × 10% to the attack before subtracting the defence', () => {
    const attack = computeFixedSpecAttack(characterOf(MAIDEN)).attack;
    const without = firstBurstHit(1_000_000, patchedBurstOf(bare, { addCasterMaxHpRef: undefined }));
    const withHp = firstBurstHit(1_000_000, bare);
    const input = fixedTeam([311, 301, MAIDEN], 2);
    const defence = input.enemy.defence;
    expect(withHp / without).toBeCloseTo((attack + 100_000 - defence) / (attack - defence), 9);
    // 最大HP に比例して増える
    const doubled = firstBurstHit(2_000_000, bare);
    expect(doubled - withHp).toBeCloseTo(withHp - without, 3);
  });
});

function patchedBurstOf(def: Raw, patch: Record<string, unknown>): Raw {
  const copy = structuredClone(def);
  copy.skills.burst.effects[0] = { ...copy.skills.burst.effects[0], ...patch };
  return copy;
}

describe('1 つずつ出すヒットと値のフレーム', () => {
  it('rejects valueBeforeFire on hits split by perCountIntervalFrames (each hit uses its own frame)', () => {
    expect(() => parseSkillDefinition(patchedBurstOf(raw, { valueBeforeFire: true }))).toThrow(
      /cannot be used with valueBeforeFire/,
    );
  });
});
