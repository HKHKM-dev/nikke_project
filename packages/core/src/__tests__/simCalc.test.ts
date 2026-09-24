// Stage 5 / 6: sim（フレーム逐次）と calc（区間期待値）の整合。plan/design-stage6.md 6.4 節の 3 段で固定する。
//   1. 厳密一致する量（区間分割・バフ・1 トリガー値・バーストスキル・フルバースト時間）
//   2. 離散化誤差の上限（グループのトリガー数は「1 マガジン × 区間数」未満、枠 5%・編成 3%）
//   3. 長時間での収束（calc は sim の長時間平均）
// Stage 6 の持続バフは describe('with timed buffs') で扱う。
import { describe, expect, it } from 'vitest';
import type { BuildEffect } from '../buildEffects.ts';
import { slotsByStep, type BurstScheduleModel } from '../burst/schedule.ts';
import type { EnemyInput } from '../damage.ts';
import { runSimulation, simGroupTotals, simIntervalTotals } from '../sim/engine.ts';
import { simTeamResult } from '../sim/teamResult.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import type { SkillDefinition, TimedEffect } from '../skills/types.ts';
import { computeTeamDamage } from '../calc/model.ts';
import { type SlotCondition, type TeamSlotInput } from '../team.ts';
import type { BurstStep, ShotParams, SkillRaw } from '../types.ts';
import { FPS } from '../weapons.ts';
import { makeCharacter } from './fixtures.ts';

/**
 * 18,000 秒（5 時間）を sim で回す収束のテストの制限時間。単独でも 2〜4 秒かかり、CI でほかのテスト（vite build を回す
 * check-pages-build.test.ts など）と並ぶと既定の 5 秒を超えることがあった（2026-09-24、6.5 秒）ので、長めに取る
 */
const LONG_SIM_TIMEOUT_MS = 60_000;

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
  timedEffect: TimedEffect | null = null,
): TeamSlotInput {
  const skill1: SkillRaw = {
    ...empty,
    id: resourceId * 10 + 1,
    values: passiveAttackPercent ? [tenLevels(passiveAttackPercent)] : [],
  };
  // burst の values: [1] = バースト倍率、[2] = 持続バフの比率 40%、[3] = 維持秒数 10
  const burst: SkillRaw = {
    ...empty,
    id: resourceId * 10 + 3,
    values: burstPercent ? [tenLevels(burstPercent), tenLevels('40'), tenLevels('10')] : [],
  };
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
        ? {
            support: 'supported',
            effects: timedEffect
              ? [{ kind: 'burstDamage', ref: 1, damageType: 'skill' }, timedEffect]
              : [{ kind: 'burstDamage', ref: 1, damageType: 'skill' }],
          }
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

// Stage 5 / 6 のテストは固定 20 秒サイクルで書いてある（Stage 7 の退化テストを兼ねる）。動的サイクルは末尾の Stage 7 節
function both(durationSeconds: number, burst: boolean, burstModel: BurstScheduleModel = 'fixed') {
  const input = { slots: team, enemy, durationSeconds, burst, burstModel };
  return { sim: runSimulation(input), calc: computeTeamDamage(input) };
}

describe('sim vs calc: quantities that must match exactly', () => {
  const { sim, calc } = both(180, true);

  it('share the same schedule, buffs and per-trigger damage', () => {
    expect(sim.schedule).toEqual(calc.schedule);
    expect(calc.schedule && slotsByStep(calc.schedule)).toEqual({ Step1: [1], Step2: [3], Step3: [0] });
    expect(sim.timeline.segments).toEqual(calc.timeline.segments);
    for (let i = 0; i < team.length; i++) {
      const c = calc.slots[i]!;
      const groups = simGroupTotals(sim, i);
      // 持続バフがないので区間は「通常 / フルバースト」の 2 グループに退化する
      expect(c.segments.map((g) => g.fullBurst)).toEqual([false, true]);
      expect(c.segments.map((g) => g.seconds)).toEqual([90, 90]);
      expect(groups.map((g) => g.key)).toEqual(
        c.segments.map((_, j) => sim.timeline.segments[j === 0 ? 0 : 1]!.slotKeys[i]),
      );
      expect(c.passiveBuffs).toEqual(sim.slots[i]!.passiveBuffs);
      for (const g of c.segments) expect(g.buffs).toEqual(c.passiveBuffs);
      expect(c.segments[1]!.trigger.boost.fullBurst).toBe(0.5);
      expect(c.segments[0]!.trigger.boost.fullBurst).toBe(0);
      expect(sim.slots[i]!.segments.map((seg) => seg.trigger.perTrigger)).toEqual(
        sim.timeline.segments.map((seg) => c.segments[seg.fullBurst ? 1 : 0]!.trigger.perTrigger),
      );
    }
  });

  it('give identical burst skill totals and activation counts', () => {
    for (let i = 0; i < team.length; i++) {
      const s = sim.slots[i]!;
      const c = calc.slots[i]!;
      expect(s.burst.hit).toEqual(c.burst.hit);
      expect(s.burst.activations.map((f) => f / FPS)).toEqual(c.burst.activations.map((a) => a.seconds));
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
      const expected = c.cadence.triggersPerSecond * 180;
      expect(Math.abs(simIntervalTotals(s).nonFullBurst.triggers - expected)).toBeLessThanOrEqual(
        s.character.shot.maxAmmo,
      );
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
      // グループのトリガー数は「1 マガジン × そのグループに含まれる区間数」を超えてずれない
      const groups = simGroupTotals(sim, i);
      c.segments.forEach((g, j) => {
        const bound = s.character.shot.maxAmmo * g.ranges.length;
        expect(Math.abs(groups[j]!.triggers - g.triggers), `slot ${i} group ${j}`).toBeLessThanOrEqual(bound);
      });
    }
  });
});

describe('sim vs calc: convergence', () => {
  it(
    'the relative difference shrinks as the battle gets longer and is below 0.5% at 18,000 s',
    () => {
      const diffs = [180, 1800, 18000].map((d) => {
        const { sim, calc } = both(d, true);
        return Math.abs(sim.totalDamage - calc.totalDamage) / calc.totalDamage;
      });
      expect(diffs[2]).toBeLessThan(0.005);
      expect(diffs[2]).toBeLessThanOrEqual(diffs[0]! + 1e-12);
    },
    LONG_SIM_TIMEOUT_MS,
  );
});

// ---- Stage 6: 持続バフを載せた編成 ----

// III（AR）が自分に攻撃力 +40%（10 秒）、II（RL）が味方全体に +40%（10 秒）を配る
const selfBuff: TimedEffect = {
  kind: 'timed',
  trigger: 'burstUse',
  target: 'self',
  stat: 'attack',
  ref: 2,
  durationRef: 3,
};
const alliesBuff: TimedEffect = { ...selfBuff, target: 'allies', trigger: 'fullBurstStart' };
const timedTeam: TeamSlotInput[] = [
  slot(1, {}, 'Step3', '351.64', null, selfBuff),
  team[1]!,
  team[2]!,
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
    null,
    alliesBuff,
  ),
  team[4]!,
];

function bothTimed(durationSeconds: number, burst = true, burstModel: BurstScheduleModel = 'fixed') {
  const input = { slots: timedTeam, enemy, durationSeconds, burst, burstModel };
  return { sim: runSimulation(input), calc: computeTeamDamage(input) };
}

describe('sim vs calc with timed buffs: quantities that must match exactly', () => {
  const { sim, calc } = bothTimed(180);

  it('share the same segmentation and per-segment buffs', () => {
    expect(sim.timeline.segments).toEqual(calc.timeline.segments);
    // 10 秒バフの窓はフルバースト窓と重なるので、区間は 18 個・バフ状態は 2 通り
    expect(sim.timeline.segments).toHaveLength(18);
    for (let i = 0; i < timedTeam.length; i++) {
      const c = calc.slots[i]!;
      expect(c.segments).toHaveLength(2);
      expect(c.segments.map((g) => g.fullBurst)).toEqual([false, true]);
      expect(c.segments.map((g) => g.seconds)).toEqual([90, 90]);
      const groups = simGroupTotals(sim, i);
      expect(groups.map((g) => g.seconds)).toEqual(c.segments.map((g) => g.seconds));
    }
  });

  it('put the buffs on the right slots', () => {
    // 枠 0 は自分の +40% だけ、枠 3 の allies は全枠に掛かる
    const fb = calc.slots[0]!.segments[1]!;
    expect(fb.buffs.attackRatio).toBeCloseTo(0.4 + 0.4 + 0.1, 12); // self + allies + SR の常時 +10%
    expect(calc.slots[0]!.segments[0]!.buffs.attackRatio).toBeCloseTo(0.1, 12);
    expect(calc.slots[1]!.segments[1]!.buffs.attackRatio).toBeCloseTo(0.4 + 0.1, 12);
    expect(calc.slots[1]!.segments[0]!.buffs.attackRatio).toBeCloseTo(0.1, 12);
    expect(calc.slots[0]!.windows).toHaveLength(18); // self 9 + allies 9
    expect(calc.slots[1]!.windows).toHaveLength(9);
  });

  it('compute the same per-segment trigger damage and the same burst hits', () => {
    for (let i = 0; i < timedTeam.length; i++) {
      const c = calc.slots[i]!;
      const simSlot = sim.slots[i]!;
      // sim の各区間の 1 トリガー値は、calc の対応するグループの値と完全一致する
      sim.timeline.segments.forEach((segment, j) => {
        const group = c.segments.find((g) => g.ranges.some((r) => r.start === segment.start))!;
        expect(simSlot.segments[j]!.trigger.perTrigger).toBe(group.trigger.perTrigger);
        expect(simSlot.segments[j]!.buffs).toEqual(group.buffs);
      });
      expect(simSlot.burst.activations.map((f) => f / FPS)).toEqual(c.burst.activations.map((a) => a.seconds));
      expect(simSlot.burst.damage).toBeCloseTo(c.burst.totalDamage, 6);
      if (c.burst.activations.length > 0) expect(simSlot.burst.hit).toEqual(c.burst.activations[0]!.hit);
    }
  });

  it('give a bigger total than the same team without the timed buffs', () => {
    const plain = computeTeamDamage({ slots: team, enemy, durationSeconds: 180, burst: true, burstModel: 'fixed' });
    expect(calc.totalDamage).toBeGreaterThan(plain.totalDamage);
  });
});

describe('sim vs calc with timed buffs: discretization error bounds', () => {
  it('stays within one magazine per segment and 5% / 3% on the totals', () => {
    const { sim, calc } = bothTimed(180);
    expect(Math.abs(sim.totalDamage - calc.totalDamage) / calc.totalDamage).toBeLessThan(0.03);
    for (let i = 0; i < timedTeam.length; i++) {
      const s = sim.slots[i]!;
      const c = calc.slots[i]!;
      expect(Math.abs(s.totalDamage - c.totalDamage) / c.totalDamage, `slot ${i}`).toBeLessThan(0.05);
      const groups = simGroupTotals(sim, i);
      c.segments.forEach((g, j) => {
        const bound = s.character.shot.maxAmmo * g.ranges.length;
        expect(Math.abs(groups[j]!.triggers - g.triggers), `slot ${i} group ${j}`).toBeLessThanOrEqual(bound);
      });
    }
  });

  it(
    'converges below 0.5% at 18,000 s',
    () => {
      const diffs = [180, 1800, 18000].map((d) => {
        const { sim, calc } = bothTimed(d);
        return Math.abs(sim.totalDamage - calc.totalDamage) / calc.totalDamage;
      });
      expect(diffs[2]).toBeLessThan(0.005);
    },
    LONG_SIM_TIMEOUT_MS,
  );
});

// ---- Stage 7: 動的サイクル（ゲージ蓄積・CT・チェーン） ----

describe('sim vs calc on the dynamic cycle: quantities that must match exactly', () => {
  const { sim, calc } = bothTimed(180, true, 'dynamic');

  it('share the same schedule, segmentation and per-segment trigger damage', () => {
    expect(calc.schedule?.model).toBe('dynamic');
    expect(sim.schedule).toEqual(calc.schedule);
    expect(sim.timeline.segments).toEqual(calc.timeline.segments);
    for (let i = 0; i < timedTeam.length; i++) {
      const c = calc.slots[i]!;
      const simSlot = sim.slots[i]!;
      sim.timeline.segments.forEach((segment, j) => {
        const group = c.segments.find((g) => g.ranges.some((r) => r.start <= segment.start && segment.start < r.end))!;
        expect(simSlot.segments[j]!.trigger.perTrigger).toBe(group.trigger.perTrigger);
      });
      expect(simSlot.burst.activations.map((f) => f / FPS)).toEqual(c.burst.activations.map((a) => a.seconds));
      expect(simSlot.burst.damage).toBeCloseTo(c.burst.totalDamage, 6);
    }
  });

  it('bursts fewer times than the fixed 20 s cycle (every nike here has a 40 s cooldown)', () => {
    const fixed = bothTimed(180).calc;
    expect(fixed.burstSummary?.fullBursts).toBe(9);
    expect(calc.burstSummary?.fullBursts).toBeLessThan(9);
    expect(calc.burstSummary?.meanCycleSeconds).toBeGreaterThanOrEqual(40);
    // フルバーストは III が撃ったフレームから始まる
    for (const w of calc.schedule!.fullBurstWindows) {
      expect(calc.schedule!.activations.some((a) => a.startsFullBurst && a.frame === w.start)).toBe(true);
    }
  });
});

describe('sim vs calc on the dynamic cycle: discretization error bounds', () => {
  it('stays within one magazine per segment and 5% / 3% on the totals', () => {
    const { sim, calc } = bothTimed(180, true, 'dynamic');
    expect(Math.abs(sim.totalDamage - calc.totalDamage) / calc.totalDamage).toBeLessThan(0.03);
    for (let i = 0; i < timedTeam.length; i++) {
      const s = sim.slots[i]!;
      const c = calc.slots[i]!;
      expect(Math.abs(s.totalDamage - c.totalDamage) / c.totalDamage, `slot ${i}`).toBeLessThan(0.05);
      const groups = simGroupTotals(sim, i);
      c.segments.forEach((g, j) => {
        const bound = s.character.shot.maxAmmo * g.ranges.length;
        expect(Math.abs(groups[j]!.triggers - g.triggers), `slot ${i} group ${j}`).toBeLessThanOrEqual(bound);
      });
    }
  });

  it(
    'converges below 0.5% at 18,000 s',
    () => {
      const diffs = [180, 1800, 18000].map((d) => {
        const { sim, calc } = bothTimed(d, true, 'dynamic');
        return Math.abs(sim.totalDamage - calc.totalDamage) / calc.totalDamage;
      });
      expect(diffs[2]).toBeLessThan(0.005);
    },
    LONG_SIM_TIMEOUT_MS,
  );
});

// Stage 13: 育成入力の効果層（OL・キューブ・コレクション）を付けた編成（plan/design-stage12.md 3.4 節）。
// 常時バフの合成だけなので、区間・1 トリガー値は厳密一致し、差は通常攻撃のトリガー数の期待値だけ（Stage 11 までと同じ範囲）
const effect = (stat: BuildEffect['stat'], value: number): BuildEffect => ({
  source: { kind: 'overload', name: { ja: '', en: '' }, level: 15 },
  stat,
  value,
});
const buildTeam: TeamSlotInput[] = team.map((s, i) => ({
  ...s,
  buildEffects: [
    // AR: 攻撃力・有利コード・クリダメ・コアダメ（コレクション）
    [
      effect('attack', 0.1463),
      effect('elementDamage', 0.2916),
      effect('critDamage', 0.2036),
      effect('coreDamage', 0.1704),
    ],
    // SMG: 通常攻撃ダメージ倍率（コレクション）・リロード速度（キューブ）
    [effect('normalAttackDamage', 0.0946), effect('reloadSpeed', 0.2969)],
    // SR: チャージダメ・チャージ速度・最大装弾数
    [effect('chargeDamage', 0.0947), effect('chargeSpeed', 0.0604), effect('maxAmmo', 0.8537)],
    // RL: クリ率・命中率（状態だけ）
    [effect('critRate', 0.0707), effect('hitRate', 0.1463)],
    // MG: バーストゲージのチャージ速度（クオンタム）・最大装弾数
    [effect('burstGaugeSpeed', 0.0466), effect('maxAmmo', 0.095)],
  ][i]!,
}));

describe('sim vs calc with build effects (Stage 13)', () => {
  const input = { slots: buildTeam, enemy, durationSeconds: 180, burst: true, burstModel: 'dynamic' as const };
  const sim = runSimulation(input);
  const calc = computeTeamDamage(input);

  it('share the same schedule, segmentation and per-segment trigger damage', () => {
    expect(sim.schedule).toEqual(calc.schedule);
    expect(sim.timeline.segments).toEqual(calc.timeline.segments);
    for (let i = 0; i < buildTeam.length; i++) {
      const c = calc.slots[i]!;
      expect(c.passiveBuffs).toEqual(sim.slots[i]!.passiveBuffs);
      expect(c.buildEffects).toEqual(sim.slots[i]!.buildEffects);
      expect(c.buildEffects).toBe(buildTeam[i]!.buildEffects);
    }
  });

  it('stays within 5% per slot and 3% on the total, and beats the same team without effects', () => {
    expect(Math.abs(sim.totalDamage - calc.totalDamage) / calc.totalDamage).toBeLessThan(0.03);
    for (let i = 0; i < buildTeam.length; i++) {
      const s = sim.slots[i]!;
      const c = calc.slots[i]!;
      expect(Math.abs(s.totalDamage - c.totalDamage) / c.totalDamage, `slot ${i}`).toBeLessThan(0.05);
    }
    const plain = computeTeamDamage({ ...input, slots: team });
    expect(calc.totalDamage).toBeGreaterThan(plain.totalDamage);
  });
});

// Stage 16（plan/design-stage16.md 3 節 16-A）: 画面は sim の結果も calc と同じ形（TeamResult）で出す
describe('simTeamResult: sim in the TeamResult shape', () => {
  const input = { slots: team, enemy, durationSeconds: 180, burst: true };
  const sim = runSimulation(input);
  const calc = computeTeamDamage(input);
  const view = simTeamResult(input, sim);

  it('keeps the sim totals', () => {
    expect(view.totalDamage).toBe(sim.totalDamage);
    expect(view.totalDps).toBeCloseTo(sim.totalDamage / 180, 6);
    expect(view.filledCount).toBe(team.length);
    for (let i = 0; i < team.length; i++) {
      const v = view.slots[i]!;
      const s = sim.slots[i]!;
      expect(v.totalDamage).toBe(s.totalDamage);
      expect(v.normalDamage).toBe(s.normalDamage);
      expect(v.segments.reduce((sum, g) => sum + g.damage, 0)).toBeCloseTo(s.normalDamage, 6);
      expect(v.segments.map((g) => g.triggers)).toEqual(simGroupTotals(sim, i).map((g) => g.triggers));
    }
  });

  it('matches calc except for the normal-attack trigger counts', () => {
    expect(view.schedule).toEqual(calc.schedule);
    expect(view.burstSummary).toEqual(calc.burstSummary);
    for (let i = 0; i < team.length; i++) {
      const v = view.slots[i]!;
      const c = calc.slots[i]!;
      expect(v.segments.map((g) => [g.ranges, g.seconds, g.fullBurst, g.trigger.perTrigger])).toEqual(
        c.segments.map((g) => [g.ranges, g.seconds, g.fullBurst, g.trigger.perTrigger]),
      );
      expect(v.burst).toEqual(c.burst);
      expect(v.skillHits).toEqual(c.skillHits);
      expect(v.cadence).toEqual(c.cadence);
      expect(v.skillSupport).toEqual(c.skillSupport);
      expect(v.segments.every((g) => g.triggerSource === 'shots')).toBe(true);
    }
  });
});
