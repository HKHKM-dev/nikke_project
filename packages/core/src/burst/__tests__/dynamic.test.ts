import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { makeCharacter } from '../../__tests__/fixtures.ts';
import type { CharacterData } from '../../types.ts';
import { BURST_GAUGE_MAX } from '../controller.ts';
import { SG_PELLET_GAUGE_HIT_RATE, burstUnitOf, energyPerTrigger, planDynamicSchedule } from '../dynamic.ts';
import { gameSecondsToFrames } from '../../time.ts';

function load(id: number): CharacterData {
  return JSON.parse(
    readFileSync(new URL(`../../../data/characters/${id}.json`, import.meta.url), 'utf8'),
  ) as CharacterData;
}

// 単騎の録画（2026-09-23、射撃場の BigArms）で、戦闘の 1 発目から数えて何ヒット目で BURST バーが消えたか（本当の満タン。
// V-0028・C-0083）。消えたヒットの 1 つ前では満タンに届かず、そのヒットで届く。BURST バーの px は本当のゲージの
// 約 12.6〜96% しか映さない（C-0084）ので、1 発の量は px ではなくヒットの数で比べる
const MEASURED: { name: string; id: number; controlled: boolean; hits: number }[] = [
  { name: 'ラピ AR（操作コア・操作胴体・AI の 3 本とも 250 ヒット目）', id: 10, controlled: true, hits: 250 },
  { name: 'エマ MG（AI・1,000 ヒット目）', id: 90, controlled: false, hits: 1000 },
];

describe('energyPerTrigger (calibrated on single-character recordings)', () => {
  for (const m of MEASURED) {
    it(m.name, () => {
      const energy = energyPerTrigger(load(m.id).shot, m.controlled);
      expect((m.hits - 1) * energy).toBeLessThan(BURST_GAUGE_MAX);
      expect(m.hits * energy).toBeGreaterThanOrEqual(BURST_GAUGE_MAX);
    });
  }

  it('デルタ SR（AI）: 20 発目で消える。うち 1 発は的に当たらなかったので、当たりの 19 回目', () => {
    const hit = energyPerTrigger(load(20).shot, false);
    expect(18 * hit).toBeLessThan(BURST_GAUGE_MAX);
    expect(19 * hit).toBeGreaterThanOrEqual(BURST_GAUGE_MAX);
  });

  it('applies the full-charge ratio only to the controlled nike', () => {
    const delta = load(20).shot;
    expect(energyPerTrigger(delta, true) / energyPerTrigger(delta, false)).toBeCloseTo(2.5, 12);
    // チャージなし武器は操作でも AI でも同じ。倍率の値も無視する
    const ar = makeCharacter({ fullChargeBurstEnergy: 3 }).shot;
    expect(energyPerTrigger(ar, true)).toBe(energyPerTrigger(ar, false));
    expect(energyPerTrigger(ar, true)).toBe(4000);
  });

  it('counts SG pellets at the gauge hit rate', () => {
    expect(energyPerTrigger(load(271).shot, false)).toBeCloseTo(9000 * 10 * SG_PELLET_GAUGE_HIT_RATE, 9);
  });
});

describe('burstUnitOf', () => {
  it('turns the cooldown seconds into frames and keeps the step and the next step', () => {
    expect(burstUnitOf(load(10))).toEqual({
      burstStep: 'Step3',
      nextStep: 'StepFull',
      cooldownFrames: gameSecondsToFrames(40),
      fullBurstFrames: gameSecondsToFrames(10),
    });
    expect(burstUnitOf(load(93))).toEqual({
      burstStep: 'Step1',
      nextStep: 'Step2',
      cooldownFrames: gameSecondsToFrames(20),
      fullBurstFrames: gameSecondsToFrames(10),
    });
  });

  it('takes the full burst length from burst_duration (Stage 8: イサベル 5 秒、モダニア 15 秒)', () => {
    expect(burstUnitOf(load(231)).fullBurstFrames).toBe(gameSecondsToFrames(5));
    expect(burstUnitOf(load(260)).fullBurstFrames).toBe(gameSecondsToFrames(15));
  });
});

describe('planDynamicSchedule', () => {
  it('returns an empty dynamic schedule for 0 frames and rejects bad frame counts', () => {
    const s = planDynamicSchedule([{ character: load(10) }], 0);
    expect(s).toMatchObject({ model: 'dynamic', activations: [], fullBurstWindows: [], fullBurstFramesTotal: 0 });
    expect(() => planDynamicSchedule([], -1)).toThrow(RangeError);
    expect(() => planDynamicSchedule([], 1.5)).toThrow(RangeError);
  });

  it('never bursts with only empty slots', () => {
    expect(planDynamicSchedule([null, null], 10800).activations).toEqual([]);
  });
});
