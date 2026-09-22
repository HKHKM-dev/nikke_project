import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { makeCharacter } from '../../__tests__/fixtures.ts';
import type { CharacterData } from '../../types.ts';
import { burstUnitOf, energyPerTrigger, planDynamicSchedule } from '../dynamic.ts';

function load(id: number): CharacterData {
  return JSON.parse(
    readFileSync(new URL(`../../../data/characters/${id}.json`, import.meta.url), 'utf8'),
  ) as CharacterData;
}

describe('energyPerTrigger', () => {
  it('multiplies the per-pellet value by the pellet count (SG) and the full-charge ratio (SR / RL)', () => {
    expect(energyPerTrigger(load(10).shot)).toBe(4000); // ラピ AR: 1 発 4,000
    expect(energyPerTrigger(load(271).shot)).toBe(90000); // ノワール SG: 9,000 × 10 ペレット
    expect(energyPerTrigger(load(291).shot)).toBe(40000); // エーテル SG: 4,000 × 10
    expect(energyPerTrigger(load(20).shot)).toBe(132500); // デルタ SR: 53,000 × 2.5
    expect(energyPerTrigger(load(93).shot)).toBe(1000); // エマ：TU MG
  });

  it('ignores fullChargeBurstEnergy for weapons without charge', () => {
    expect(energyPerTrigger(makeCharacter({ fullChargeBurstEnergy: 3 }).shot)).toBe(4000);
  });
});

describe('burstUnitOf', () => {
  it('turns the cooldown seconds into frames and keeps the step and the next step', () => {
    expect(burstUnitOf(load(10))).toEqual({ burstStep: 'Step3', nextStep: 'StepFull', cooldownFrames: 2400 });
    expect(burstUnitOf(load(93))).toEqual({ burstStep: 'Step1', nextStep: 'Step2', cooldownFrames: 1200 });
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
