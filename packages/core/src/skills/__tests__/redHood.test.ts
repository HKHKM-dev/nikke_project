// レッドフード編（plan/design-red-hood.md 2 節）: 使った段階の条件（burstStep）・戦闘中の発火の回数（maxFires）・チャージ速度の超過分の
// 変換（chargeSpeedOverflow）の語彙の検証と式、Lv ごとの解決値
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CharacterData } from '../../types.ts';
import { applyChargeBuffs, chargeSpeedOverflowDamage, ZERO_BUFFS } from '../buffs.ts';
import { MAX_SKILL_LEVELS, resolveInstant, resolvePassives, resolveStateGrants, resolveTimed } from '../resolve.ts';
import { parseSkillDefinition } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

type Effects = { effects: Record<string, unknown>[] };
const RED_HOOD = 470;
const raw = readJson<{ skills: { skill1: Effects; skill2: Effects; burst: Effects } }>(
  `../../../data/skills/${RED_HOOD}.json`,
);
const character = readJson<CharacterData>(`../../../data/characters/${RED_HOOD}.json`);
const def = parseSkillDefinition(raw);
const burstIndex = (kind: string, step: string) =>
  raw.skills.burst.effects.findIndex(
    (e) => e.kind === kind && (e.condition as { burstStep?: string } | undefined)?.burstStep === step,
  );
const overflowIndex = raw.skills.skill1.effects.findIndex((e) => e.stat === 'chargeSpeedOverflow');

const patched = (slot: 'skill1' | 'skill2' | 'burst', index: number, patch: Record<string, unknown>) => {
  const copy = structuredClone(raw);
  copy.skills[slot].effects[index] = { ...copy.skills[slot].effects[index], ...patch };
  return () => parseSkillDefinition(copy);
};

describe('語彙の検証', () => {
  it('accepts the definition', () => {
    expect(() => parseSkillDefinition(raw)).not.toThrow();
  });

  it('takes burstStep only with the trigger burstUse', () => {
    for (const kind of ['timed', 'state', 'cooldownReduction', 'weaponChange']) {
      expect(
        patched('burst', burstIndex(kind, 'Step3') >= 0 ? burstIndex(kind, 'Step3') : burstIndex(kind, 'Step1'), {
          trigger: 'fullBurstStart',
        }),
      ).toThrow(/burstStep is only allowed with trigger burstUse/);
    }
    expect(patched('burst', burstIndex('timed', 'Step1'), { condition: { burstStep: 'StepFull' } })).toThrow(
      /expected one of Step1, Step2, Step3/,
    );
  });

  it('takes only burstStep as the condition of a weapon change', () => {
    expect(patched('burst', burstIndex('weaponChange', 'Step3'), { condition: { selfState: 'redWolf' } })).toThrow(
      /unknown field \(allowed: burstStep\)/,
    );
  });

  it('takes maxFires on cooldownReduction as a positive integer', () => {
    expect(patched('burst', burstIndex('cooldownReduction', 'Step1'), { maxFires: 0 })).toThrow(
      /maxFires: expected a positive integer/,
    );
  });

  it('takes chargeSpeedOverflow only in a passive on self', () => {
    expect(patched('skill1', overflowIndex, { target: 'allies' })).toThrow(
      /chargeSpeedOverflow is only allowed with target "self"/,
    );
    expect(patched('skill1', 0, { stat: 'chargeSpeedOverflow' })).toThrow(
      /chargeSpeedOverflow is only allowed in passive/,
    );
  });
});

describe('解決値（Lv10）', () => {
  it('resolves the overflow conversion to 240% and the S1 charge speed stacks', () => {
    const passive = resolvePassives(def, character, MAX_SKILL_LEVELS).find((e) => e.stat === 'chargeSpeedOverflow')!;
    expect(passive.value).toBeCloseTo(2.4, 10);
    const stacks = resolveTimed(def, character, MAX_SKILL_LEVELS).find(
      (e) => e.source.skill === 'skill1' && e.stat === 'chargeSpeed',
    )!;
    expect(stacks).toMatchObject({ maxStacks: 10 });
    expect(stacks.value).toBeCloseTo(0.0381, 10);
  });

  it('keeps the step condition on the weapon change, the burst buffs, the mode names and the CT cuts', () => {
    const timed = resolveTimed(def, character, MAX_SKILL_LEVELS).filter((e) => e.source.skill === 'burst');
    const weapon = timed.find((e) => e.stat === 'weapon')!;
    expect(weapon.condition).toEqual({ burstStep: 'Step3' });
    expect(weapon.value).toBeCloseTo(0.5146, 10);
    expect(weapon.weapon!.shot.fullChargeDamage).toBeCloseTo(2.5, 10);
    expect(timed.find((e) => e.stat === 'attack')!.condition).toEqual({ burstStep: 'Step1' });
    expect(timed.find((e) => e.stat === 'chargeSpeed')!.condition).toEqual({ burstStep: 'Step3' });
    const grants = resolveStateGrants(def, character, MAX_SKILL_LEVELS);
    expect(grants.map((g) => [g.state, g.condition?.burstStep])).toEqual([
      ['beastCage', 'Step1'],
      ['theLastHowl', 'Step2'],
      ['redWolf', 'Step3'],
    ]);
    const cuts = resolveInstant(def, character, MAX_SKILL_LEVELS).filter((e) => e.kind === 'cooldownReduction');
    expect(cuts.map((e) => [e.value, e.maxFires, e.condition?.burstStep])).toEqual([
      [40, 1, 'Step1'],
      [40, 1, 'Step2'],
    ]);
  });
});

describe('チャージ速度の超過分の変換（applyChargeBuffs）', () => {
  const buffs = (chargeSpeed: number, chargeSpeedOverflow: number) => ({
    ...ZERO_BUFFS,
    chargeSpeed,
    chargeSpeedOverflow,
  });

  it('adds max(0, Σ − 1) × the conversion rate to the additive charge damage', () => {
    // レッドウルフの窓: III の 100.8% と S1 の 10 スタック（38.1%）で、超過は 38.9%
    expect(chargeSpeedOverflowDamage(buffs(1.008 + 0.381, 2.4))).toBeCloseTo(0.9336, 10);
    expect(applyChargeBuffs(2.5, true, buffs(1.008 + 0.381, 2.4))).toBeCloseTo(3.4336, 10);
  });

  it('adds nothing at or below 100%, without the conversion, or on a partial charge', () => {
    expect(applyChargeBuffs(2.5, true, buffs(0.381, 2.4))).toBeCloseTo(2.5, 10);
    expect(applyChargeBuffs(2.5, true, buffs(1, 2.4))).toBeCloseTo(2.5, 10);
    expect(applyChargeBuffs(2.5, true, buffs(1.389, 0))).toBeCloseTo(2.5, 10);
    expect(applyChargeBuffs(2.5, false, buffs(1.389, 2.4))).toBe(1);
  });
});
