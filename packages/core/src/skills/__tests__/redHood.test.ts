// レッドフード編（plan/design-red-hood.md 2 節）: 使った段階の条件（burstStep）・戦闘中の発火の回数（maxFires）・チャージ速度の超過分の
// 変換（chargeSpeedOverflow）の語彙の検証と式、Lv ごとの解決値
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CharacterData } from '../../types.ts';
import { addRatioBuff, applyChargeBuffs, type BuffTotals, chargeSpeedOverflowDamage, ZERO_BUFFS } from '../buffs.ts';
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

  it('takes burstStep and a stack count of a state as the condition of a weapon change', () => {
    expect(patched('burst', burstIndex('weaponChange', 'Step3'), { condition: { inFullBurst: true } })).toThrow(
      /unknown field \(allowed: burstStep, selfState\)/,
    );
    expect(patched('burst', burstIndex('weaponChange', 'Step3'), { condition: { selfState: 'redWolf' } })).toThrow(
      /a weapon change can only look at a stack count/,
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

describe('チャージ速度の超過分の変換（applyChargeBuffs。V-0640）', () => {
  // III の 100.8% と S1 の k スタック（3.81% ずつ）を、レッドフードの効果として足す
  const buffs = (stacks: number, chargeSpeedOverflow: number, withIII = true) => {
    let totals: BuffTotals = { ...ZERO_BUFFS, chargeSpeedOverflow };
    if (withIII) totals = addRatioBuff(totals, 'chargeSpeed', 1.008, '470.burst', true);
    for (let i = 0; i < stacks; i++) totals = addRatioBuff(totals, 'chargeSpeed', 0.0381, '470.skill1', true);
    return totals;
  };

  it('rounds each effect to a whole percent before summing, and adds the excess × the rate to the additive charge damage', () => {
    // 10 スタック: 101% + 38% → 超過 39%（丸めない和は 38.9%）
    expect(chargeSpeedOverflowDamage(buffs(10, 2.4))).toBeCloseTo(0.936, 10);
    expect(applyChargeBuffs(2.5, true, buffs(10, 2.4))).toBeCloseTo(3.436, 10);
    // 7 スタック: 101% + 27%（26.67%）→ 28%。和を丸めると 27%（127.67%）になる
    expect(chargeSpeedOverflowDamage(buffs(7, 2.4))).toBeCloseTo(0.672, 10);
    // 5 スタック: 101% + 19%（19.05%）→ 20%
    expect(chargeSpeedOverflowDamage(buffs(5, 2.4))).toBeCloseTo(0.48, 10);
  });

  // 味方からの▲を和に入れること・丸めの単位は未確定（課題 2-53）。いまの定義の読み（効果ごとに丸め、出どころが違えば別の効果）を押さえる
  it('rounds the stacks of one effect together, and a Charge Speed up from another source separately', () => {
    // 同じ出どころの同じ値はスタックとしてまとめて丸める: 101% + 3 スタックの 11%（11.43%）→ 超過 12%（別々に丸めると 13%）
    expect(chargeSpeedOverflowDamage(buffs(3, 2.4))).toBeCloseTo(0.12 * 2.4, 10);
    // 味方の▲は別の効果として丸める: 101% + 11%（11.43%）+ 味方の 3%（3.43%）→ 超過 15%（S1 と味方の和 14.86% を丸めると 16%）
    const withAlly = addRatioBuff(buffs(3, 2.4), 'chargeSpeed', 0.0343, '20.skill1');
    expect(chargeSpeedOverflowDamage(withAlly)).toBeCloseTo(0.15 * 2.4, 10);
  });

  it('keeps the charge speed itself unrounded', () => {
    expect(buffs(10, 2.4).chargeSpeed).toBeCloseTo(1.008 + 0.381, 10);
  });

  it('adds nothing at or below 100%, without the conversion, or on a partial charge', () => {
    expect(applyChargeBuffs(2.5, true, buffs(10, 2.4, false))).toBeCloseTo(2.5, 10);
    expect(applyChargeBuffs(2.5, true, buffs(10, 0))).toBeCloseTo(2.5, 10);
    expect(applyChargeBuffs(2.5, false, buffs(10, 2.4))).toBe(1);
  });
});
