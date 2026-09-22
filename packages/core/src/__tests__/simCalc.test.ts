// Stage 5: sim（フレーム逐次）と calc（2 区間の期待値）の整合。plan/design-stage5.md 6.1 節の 3 段で固定する。
//   1. 厳密一致する量（バーストスキル・1 トリガー値・フルバースト時間）
//   2. 離散化誤差の上限（トリガー数は 1 マガジン未満、総ダメージは 3% 以内）
//   3. 長時間での収束（calc は sim の長時間平均）
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { runSimulation } from '../sim/engine.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import type { SkillDefinition } from '../skills/types.ts';
import { computeTeamDamage, type SlotCondition, type TeamSlotInput } from '../team.ts';
import type { BurstStep, ShotParams, SkillRaw } from '../types.ts';
import { FPS } from '../weapons.ts';
import { makeCharacter } from './fixtures.ts';

const enemy: EnemyInput = { defence: 100, element: 'Wind', hasCore: true };
const condition: SlotCondition = { coreHitRate: 0.6, distanceBonus: true, fullCharge: true };
const growth = { level: 1, grade: 0, core: 0 };
const tenLevels = (v: string) => Array.from({ length: 10 }, () => v);
const empty: SkillRaw = { id: 0, name: { ja: '', en: '' }, description: { ja: '', en: '' }, values: [] };

function slot(
  resourceId: number,
  shot: Partial<ShotParams>,
  burstStep: BurstStep,
  burstPercent: string | null,
  passiveAttackPercent: string | null = null,
): TeamSlotInput {
  const skill1: SkillRaw = {
    ...empty,
    id: resourceId * 10 + 1,
    values: passiveAttackPercent ? [tenLevels(passiveAttackPercent)] : [],
  };
  const burst: SkillRaw = { ...empty, id: resourceId * 10 + 3, values: burstPercent ? [tenLevels(burstPercent)] : [] };
  const character = makeCharacter(shot, { resourceId, burstStep, skills: { skill1, skill2: empty, burst } });
  const definition: SkillDefinition = {
    formatVersion: 1,
    resourceId,
    checkedAt: '2026-09-22',
    skills: {
      skill1: passiveAttackPercent
        ? { support: 'supported', effects: [{ kind: 'passive', target: 'allies', stat: 'attack', ref: 1 }] }
        : { support: 'unsupported', effects: [] },
      skill2: { support: 'unsupported', effects: [] },
      burst: burstPercent
        ? { support: 'supported', effects: [{ kind: 'burstDamage', ref: 1, damageType: 'skill' }] }
        : { support: 'unsupported', effects: [] },
    },
  };
  return { character, growth, condition, skills: { definition, levels: MAX_SKILL_LEVELS } };
}

// AR / SMG / SR / RL / MG の 5 体。I は SMG、II は RL、III は AR（バーストスキルあり）。SR が味方全体に攻撃力 +10%
const team: TeamSlotInput[] = [
  slot(1, {}, 'Step3', '351.64'),
  slot(2, { maxAmmo: 120, rateOfFire: 1440, endRateOfFire: 1440, damage: 500 }, 'Step1', null),
  slot(
    3,
    {
      maxAmmo: 6,
      reloadTime: 1.5,
      rateOfFire: 60,
      endRateOfFire: 60,
      chargeTime: 1,
      inputType: 'UP',
      damage: 6000,
      fullChargeDamage: 2.5,
    },
    'Step3',
    '200',
    '10',
  ),
  slot(
    4,
    {
      maxAmmo: 6,
      reloadTime: 2,
      rateOfFire: 60,
      endRateOfFire: 60,
      chargeTime: 1.5,
      inputType: 'UP',
      damage: 6130,
      fullChargeDamage: 3.5,
    },
    'Step2',
    '150',
  ),
  slot(
    5,
    { maxAmmo: 300, reloadTime: 2.5, rateOfFire: 60, endRateOfFire: 3600, rateOfFireChangePerShot: 100, damage: 557 },
    'AllStep',
    null,
  ),
];

function both(durationSeconds: number, burst: boolean) {
  const input = { slots: team, enemy, durationSeconds, burst };
  return { sim: runSimulation(input), calc: computeTeamDamage(input) };
}

describe('sim vs calc: quantities that must match exactly', () => {
  const { sim, calc } = both(180, true);

  it('share the same schedule, buffs and per-trigger damage', () => {
    expect(sim.schedule).toEqual(calc.schedule);
    expect(calc.schedule?.assignment).toEqual({ Step1: 1, Step2: 3, Step3: 0 });
    for (let i = 0; i < team.length; i++) {
      const s = sim.slots[i]!;
      const c = calc.slots[i]!;
      expect(s.buffs).toEqual(c.buffs);
      expect(s.trigger.normal.perTrigger).toBe(c.result.perTrigger);
      expect(s.trigger.fullBurst.perTrigger).toBe(c.fullBurstResult?.perTrigger);
      expect(s.trigger.normal.boost).toEqual(c.result.boost);
      expect(c.fullBurstResult?.boost.fullBurst).toBe(0.5);
    }
    expect((calc.slots[0]?.result.totalDamage ?? 0) / (calc.slots[0]?.result.dps ?? 1)).toBeCloseTo(90, 9);
    expect((calc.slots[0]?.fullBurstResult?.totalDamage ?? 0) / (calc.slots[0]?.fullBurstResult?.dps ?? 1)).toBeCloseTo(
      90,
      9,
    );
  });

  it('give identical burst skill totals and activation counts', () => {
    for (let i = 0; i < team.length; i++) {
      const s = sim.slots[i]!;
      const c = calc.slots[i]!;
      expect(s.burst.hit).toEqual(c.burst.hit);
      expect(s.burst.activations.map((f) => f / FPS)).toEqual(c.burst.activations);
      expect(s.burst.damage).toBeCloseTo(c.burst.totalDamage, 6);
    }
    expect(calc.slots[0]?.burst.activations).toHaveLength(9);
    expect(calc.slots[3]?.burst.activations).toHaveLength(9);
    expect(calc.slots[2]?.burst.activations).toHaveLength(0); // III の 2 体目は撃たない
    expect(calc.slots[1]?.burst.hit).toBeNull();
  });
});

describe('sim vs calc: discretization error bounds', () => {
  it('without burst, trigger counts differ by less than one magazine per slot', () => {
    const { sim, calc } = both(180, false);
    for (let i = 0; i < team.length; i++) {
      const s = sim.slots[i]!;
      const c = calc.slots[i]!;
      const expected = c.result.cadence.triggersPerSecond * 180;
      expect(Math.abs(s.normal.nonFullBurst.triggers - expected)).toBeLessThanOrEqual(s.character.shot.maxAmmo);
      expect(Math.abs(s.totalDamage - c.totalDamage) / c.totalDamage).toBeLessThan(0.03);
    }
  });

  it('with burst, the 5-slot totals agree within 3% and every slot within 5%', () => {
    const { sim, calc } = both(180, true);
    expect(Math.abs(sim.totalDamage - calc.totalDamage) / calc.totalDamage).toBeLessThan(0.03);
    for (let i = 0; i < team.length; i++) {
      const s = sim.slots[i]!;
      const c = calc.slots[i]!;
      expect(Math.abs(s.totalDamage - c.totalDamage) / c.totalDamage, `slot ${i}`).toBeLessThan(0.05);
      // フルバースト区間のトリガー数は期待値 (秒間トリガー × 90) から 1 マガジン以上ずれない
      const expectedFb = c.fullBurstResult!.cadence.triggersPerSecond * 90;
      expect(Math.abs(s.normal.fullBurst.triggers - expectedFb), `slot ${i} fb`).toBeLessThanOrEqual(
        s.character.shot.maxAmmo,
      );
    }
  });
});

describe('sim vs calc: convergence', () => {
  it('the relative difference shrinks as the battle gets longer and is below 0.5% at 18,000 s', () => {
    const diffs = [180, 1800, 18000].map((d) => {
      const { sim, calc } = both(d, true);
      return Math.abs(sim.totalDamage - calc.totalDamage) / calc.totalDamage;
    });
    expect(diffs[2]).toBeLessThan(0.005);
    expect(diffs[2]).toBeLessThanOrEqual(diffs[0]! + 1e-12);
  });
});
