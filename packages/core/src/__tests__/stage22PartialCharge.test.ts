// Stage 22-B: チャージの途中で攻撃できる的がいなくなると、その時点のチャージで撃つ（部分チャージ。C-0109、plan/design-stage22.md 3.2 節）。
import { describe, expect, it } from 'vitest';
import { partialGaugeRatio } from '../burst/dynamic.ts';
import { computeTeamDamage } from '../calc/model.ts';
import { firstShotFrames } from '../cadence.ts';
import { computeTriggerDamage, partialChargeTriggerDamage, type EnemyEvent, type EnemyInput } from '../damage.ts';
import { initialShooter, partialChargeShot, stepShooter } from '../frame/shooter.ts';
import type { ShotLog } from '../frame/shots.ts';
import { runSimulation } from '../sim/engine.ts';
import { simTeamResult } from '../sim/teamResult.ts';
import { cycleShotFrames } from '../skills/cycles.ts';
import { replayEvents } from '../skills/triggers.ts';
import type { SlotCondition, TeamInput } from '../team.ts';
import type { ShotParams } from '../types.ts';
import { makeCharacter } from './fixtures.ts';
import { framesToGameSeconds } from '../time.ts';

// SR: チャージ 1 秒（59f）・発と発の間 82f・戦闘開始から 70f（C-0232）・6 発
const SR: Partial<ShotParams> = {
  maxAmmo: 6,
  reloadTime: 1.5,
  rateOfFire: 60,
  endRateOfFire: 60,
  chargeTime: 1,
  fullChargeDamage: 2.5,
  fullChargeBurstEnergy: 2.5,
  inputType: 'UP',
  damage: 6000,
};

/** 戦闘開始から n フレーム進めた射手 */
function shooterAfter(shot: ShotParams, n: number) {
  const state = initialShooter(shot);
  for (let f = 0; f < n; f++) stepShooter(state, shot);
  return state;
}

describe('partialChargeShot（射手）', () => {
  const shot = makeCharacter(SR).shot;

  it('fires with the charge progress (C + 1 − k) / C, where k is the wait until the next shot', () => {
    // 戦闘開始の待ちは 70f（SR の構え 11f + チャージ 59f + 満ちてから撃つまで 1f − 1。C-0232）。20f 進めると残り 50f で、
    // チャージは 10f 進んでいる
    expect(firstShotFrames(shot)).toBe(70);
    const state = shooterAfter(shot, 20);
    expect(state.wait).toBe(50);
    expect(partialChargeShot(state, shot)).toBeCloseTo(10 / 59, 12);
    expect(state.ammo).toBe(5);
  });

  it('does not fire before the charge starts (during the aim motion) or while reloading', () => {
    expect(partialChargeShot(shooterAfter(shot, 5), shot)).toBeNull();
    const reloading = shooterAfter(shot, 0);
    reloading.phase = 'reloading';
    expect(partialChargeShot(reloading, shot)).toBeNull();
  });

  it('counts a shot that was due on this very frame as a full charge', () => {
    const state = shooterAfter(shot, 70);
    expect(state.wait).toBe(0);
    expect(partialChargeShot(state, shot)).toBe(1);
  });

  it('ignores DOWN_Charge and non-charge weapons (design-stage22.md 0.4 節)', () => {
    const down = makeCharacter({ ...SR, inputType: 'DOWN_Charge' }).shot;
    expect(partialChargeShot(shooterAfter(down, 60), down)).toBeNull();
    const ar = makeCharacter({}).shot;
    expect(partialChargeShot(shooterAfter(ar, 3), ar)).toBeNull();
  });
});

describe('部分チャージの 1 発の値とゲージ', () => {
  const character = makeCharacter(SR);
  const enemy: EnemyInput = { defence: 100, element: null, hasCore: true };
  const condition: SlotCondition = { coreHitRate: 1, distanceBonus: false, fullCharge: true };
  const full = computeTriggerDamage({ character, growth: { level: 1, grade: 0, core: 0 }, enemy, condition });

  it('scales the charge multiplier M to 1 + (M − 1) × p (紅蓮BS 145% / 150% → 0.967、C-0109)', () => {
    expect(full.chargeMultiplier).toBe(2.5);
    const half = partialChargeTriggerDamage(full, 0.5);
    expect(half.chargeMultiplier).toBeCloseTo(1.75, 12);
    expect(half.normal / full.normal).toBeCloseTo(1.75 / 2.5, 12);
    expect(half.perTrigger).toBeCloseTo(half.normal + full.perShot, 6);
    expect(partialChargeTriggerDamage(full, 1)).toBe(full);
    // 紅蓮BS（倍率 1.5）の表示 145% は 0.9 の進み
    const bs = { ...full, chargeMultiplier: 1.5 };
    expect(partialChargeTriggerDamage(bs, 0.9).normal / bs.normal).toBeCloseTo(1.45 / 1.5, 12);
  });

  it('scales the full-charge gauge the same way, only for the controlled slot (assumed)', () => {
    expect(partialGaugeRatio(character.shot, true, 0.5)).toBeCloseTo(1.75 / 2.5, 12);
    expect(partialGaugeRatio(character.shot, false, 0.5)).toBe(1);
    expect(partialGaugeRatio(character.shot, true, 1)).toBe(1);
  });
});

describe('回数トリガー', () => {
  const log: ShotLog = { frames: [69, 151, 200, 233], fullCharge: true, partialShots: [{ frame: 200, progress: 0.3 }] };

  it('does not count a partial-charge shot as fullChargeShot, but counts it as a shot (紅蓮BS の S1。046-20)', () => {
    expect(cycleShotFrames(log, { count: 'fullChargeShot', every: 1 })).toEqual([69, 151, 233]);
    expect(cycleShotFrames(log, { count: 'normalShot', every: 1 })).toEqual([69, 151, 200, 233]);
    const events = replayEvents(null, [log], 300);
    const at = (f: number) => events.find((e) => e.frame === f)!.shots[0]!;
    expect(at(151).fullCharge).toBe(true);
    expect(at(200).fullCharge).toBe(false);
  });
});

describe('編成（sim と calc）', () => {
  // 3 発目（69 + 82 × 2 = 233f）のチャージの途中（あと 30f）の 203f に窓が始まる
  const windowStart = 203;
  const events: EnemyEvent[] = [
    { kind: 'untargetable', start: framesToGameSeconds(windowStart), end: framesToGameSeconds(windowStart + 120) },
  ];
  const input: TeamInput = {
    slots: [
      {
        character: makeCharacter(SR, { resourceId: 2 }),
        growth: { level: 1, grade: 0, core: 0 },
        condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true },
      },
    ],
    enemy: { defence: 100, element: null, hasCore: true, events },
    durationSeconds: 30,
    burst: false,
  };

  it('fires a partial-charge shot on the first frame of the window, then hides and reloads', () => {
    const sim = runSimulation(input);
    const log = sim.shots[0]!;
    const start = sim.untargetable[0]!.start;
    expect(log.partialShots).toEqual([{ frame: start, progress: expect.any(Number) }]);
    expect(log.frames.filter((f) => f >= start && f < sim.untargetable[0]!.end)).toEqual([start]);
    expect(log.partialShots![0]!.progress).toBeGreaterThan(0);
    expect(log.partialShots![0]!.progress).toBeLessThan(1);
  });

  it('gives the same shots and damage in sim and calc, partial-charge shots included', () => {
    const sim = runSimulation(input);
    const calc = computeTeamDamage(input);
    const simTeam = simTeamResult(input, sim);
    const c = calc.slots[0]!;
    expect(c.normalDamage).toBeCloseTo(sim.slots[0]!.normalDamage, 3);
    const partialOf = (segments: typeof c.segments) =>
      segments.reduce((sum, s) => sum + (s.partialCharge?.triggers ?? 0), 0);
    expect(partialOf(c.segments)).toBe(1);
    expect(partialOf(simTeam.slots[0]!.segments)).toBe(1);
    const damageOf = (segments: typeof c.segments) =>
      segments.reduce((sum, s) => sum + (s.partialCharge?.damage ?? 0), 0);
    expect(damageOf(c.segments)).toBeCloseTo(damageOf(simTeam.slots[0]!.segments), 6);
  });
});
