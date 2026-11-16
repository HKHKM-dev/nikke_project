// メイデン：アイスローズ（183）の語彙（plan/design-maiden-ice-rose.md 2.2 節・8 節）: 最大HP を攻撃力に合算するダメージ
// （damage・burstDamage の addCasterMaxHpRef）と、所持カウンタ分の連続攻撃（burstDamage の hitsFrom）の検証・解決と、ヒットの攻撃力に
// 自分の最終最大HP × 比率が足されること
import { describe, expect, it } from 'vitest';
import { characterOf, fixedTeam, rawDefinition } from '../../__tests__/teamHelpers.ts';
import { planTeamRun } from '../../frame/plan.ts';
import { computeFixedSpecAttack } from '../../fixedSpec.ts';
import { runSimulation } from '../../sim/engine.ts';
import { resolveBurstDamage, resolveDamageEffects } from '../burstDamage.ts';
import { MAX_SKILL_LEVELS } from '../resolve.ts';
import { parseSkillDefinition } from '../types.ts';

type Effects = { effects: Record<string, unknown>[] };
type Raw = { skills: { skill1: Effects; skill2: Effects; burst: Effects } };
const MAIDEN = 183;
const raw = rawDefinition<Raw>(MAIDEN);
/** S2 のフルチャージごとの倍率ダメージ（damage）の番号 */
const S2_DAMAGE = 4;

const patched = (slot: keyof Raw['skills'], index: number, patch: Record<string, unknown>, def: Raw = raw): Raw => {
  const copy = structuredClone(def);
  copy.skills[slot].effects[index] = { ...copy.skills[slot].effects[index], ...patch };
  return copy;
};

describe('語彙の検証', () => {
  it('accepts the definition', () => {
    expect(() => parseSkillDefinition(raw)).not.toThrow();
  });

  it('rejects addCasterMaxHpRef on the damage forms that do not compute a skill hit', () => {
    const fixedShare = { damageType: 'fixedShare', trigger: { count: 'fullChargeShot' }, addCasterMaxHpRef: 10 };
    expect(() => parseSkillDefinition(patched('skill2', S2_DAMAGE, fixedShare))).toThrow(
      /addCasterMaxHpRef cannot be used/,
    );
  });

  it('rejects addCasterMaxHpRef on a per-shot damage that folds into the shot', () => {
    const def = parseSkillDefinition(patched('skill2', S2_DAMAGE, { addCasterMaxHpRef: 10, gaugeHits: undefined }));
    expect(() => resolveDamageEffects(def, characterOf(MAIDEN), MAX_SKILL_LEVELS)).toThrow(
      /cannot add the max HP to the attack/,
    );
  });

  it('rejects hitsFrom with hitsRef, and hitsFrom or addCasterMaxHpRef with another burstDamage', () => {
    expect(() => parseSkillDefinition(patched('burst', 0, { hitsRef: 3 }))).toThrow(/hitsFrom cannot be used/);
    const two = structuredClone(raw);
    two.skills.burst.effects.push({ kind: 'burstDamage', damageType: 'skill', ref: 3 });
    expect(() => resolveBurstDamage(parseSkillDefinition(two), characterOf(MAIDEN), MAX_SKILL_LEVELS)).toThrow(
      /need the only burstDamage/,
    );
  });

  it('rejects valueBeforeFire on hits split by perCountIntervalFrames (each hit uses its own frame)', () => {
    const split = {
      trigger: 'burstUse',
      gaugeHits: undefined,
      perCount: { counter: 'mp' },
      perCountIntervalFrames: 12,
      delayFrames: 6,
      valueBeforeFire: true,
    };
    expect(() => parseSkillDefinition(patched('skill2', S2_DAMAGE, split))).toThrow(
      /cannot be used with valueBeforeFire/,
    );
  });
});

describe('解決', () => {
  it('resolves the burst as one hit value with 10% of the max HP added to the attack', () => {
    const burst = resolveBurstDamage(parseSkillDefinition(raw), characterOf(MAIDEN), MAX_SKILL_LEVELS);
    expect(burst.map((r) => [r.multiplier, r.addCasterMaxHpRatio, r.oneEnemy])).toEqual([[13.728, 0.1, true]]);
  });
});

describe('ヒットの攻撃力', () => {
  // S2 の HP に比例する攻撃力▲と S1 の最大HP のみ▲ を外し、攻撃力がスペック固定の値のままの編成（ココア + ソルジャーF.A. + メイデン）で比べる
  const bare = structuredClone(raw);
  bare.skills.skill1.effects.splice(3, 1);
  bare.skills.skill2.effects.splice(0, 4);
  const team = (hpOverride: number, def: unknown) => {
    const input = fixedTeam([311, 301, MAIDEN], 2);
    input.slots[2] = { ...input.slots[2]!, hpOverride };
    input.slots[2]!.skills = { definition: parseSkillDefinition(def), levels: MAX_SKILL_LEVELS };
    return input;
  };
  const attack = computeFixedSpecAttack(characterOf(MAIDEN)).attack;
  const defence = fixedTeam([MAIDEN], 0).enemy.defence;
  const ratio = (attack + 100_000 - defence) / (attack - defence);

  it('adds the final max HP × 10% to the attack of a burstDamage hit (before subtracting the defence)', () => {
    const firstBurst = (hp: number, def: unknown) =>
      runSimulation(team(hp, def)).slots[2]!.burst.hits[0]!.perActivation;
    const without = firstBurst(1_000_000, patched('burst', 0, { addCasterMaxHpRef: undefined }, bare));
    const withHp = firstBurst(1_000_000, bare);
    expect(withHp / without).toBeCloseTo(ratio, 9);
    // 最大HP に比例して増える
    expect(firstBurst(2_000_000, bare) - withHp).toBeCloseTo(withHp - without, 3);
  });

  it('adds the final max HP × 10% to the attack of a damage hit', () => {
    // S2 の倍率ダメージを、バースト使用時の damage に置き換えて比べる
    const asDamage = (hpRef: number | undefined) =>
      patched('skill2', 0, { trigger: 'burstUse', gaugeHits: undefined, addCasterMaxHpRef: hpRef }, bare);
    const first = (def: unknown) =>
      planTeamRun(team(1_000_000, def)).skillHits.find((h) => h.slotIndex === 2 && h.effect.source.skill === 'skill2')!
        .hit.perActivation;
    // 値 02 は 10（%）
    expect(first(asDamage(2)) / first(asDamage(undefined))).toBeCloseTo(ratio, 9);
  });
});
