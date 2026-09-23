import { describe, expect, it } from 'vitest';
import type { BurstStep } from '../../types.ts';
import {
  FIXED_BURST_CYCLE,
  assignBurstSteps,
  durationToFrames,
  isFullBurstFrame,
  planFixedCycle,
  type BurstCandidate,
} from '../fixedCycle.ts';
import { slotsByStep, type BurstSchedule } from '../schedule.ts';

const starts = (s: BurstSchedule): number[] => s.fullBurstWindows.map((w) => w.start);

const c = (step: BurstStep): BurstCandidate => ({ burstStep: step });

describe('planFixedCycle', () => {
  it('fires 9 times in 180 seconds at 10, 30, …, 170 s and spends 90 s in full burst', () => {
    const s = planFixedCycle([c('Step1'), c('Step2'), c('Step3')], durationToFrames(180));
    expect(starts(s)).toEqual([600, 1800, 3000, 4200, 5400, 6600, 7800, 9000, 10200]);
    expect(s.model).toBe('fixed');
    // 各サイクルで I → II → III が同じフレームに並ぶ
    expect(s.activations).toHaveLength(27);
    expect(s.activations.slice(0, 3)).toEqual([
      { frame: 600, step: 'Step1', slotIndex: 0, startsFullBurst: false, enteredStep: 'Step2' },
      { frame: 600, step: 'Step2', slotIndex: 1, startsFullBurst: false, enteredStep: 'Step3' },
      { frame: 600, step: 'Step3', slotIndex: 2, startsFullBurst: true, enteredStep: null },
    ]);
    expect(s.fullBurstWindows[0]).toEqual({ start: 600, end: 1200, burstUsers: [0, 1, 2] });
    expect(s.fullBurstWindows[8]).toEqual({ start: 10200, end: 10800, burstUsers: [0, 1, 2] });
    expect(s.fullBurstFramesTotal).toBe(5400);
    expect(slotsByStep(s)).toEqual({ Step1: [0], Step2: [1], Step3: [2] });
    expect(assignBurstSteps([c('Step1'), c('Step2'), c('Step3')])).toEqual({ Step1: 0, Step2: 1, Step3: 2 });
  });

  it('clips the last window at the end of the battle and drops activations after it', () => {
    const s = planFixedCycle([c('Step3')], 10500);
    expect(starts(s)).toHaveLength(9);
    expect(s.fullBurstWindows[8]).toEqual({ start: 10200, end: 10500, burstUsers: [0] });
    expect(s.fullBurstFramesTotal).toBe(8 * 600 + 300);
    const short = planFixedCycle([c('Step3')], 600);
    expect(starts(short)).toEqual([]);
    expect(short.activations).toEqual([]);
    expect(short.fullBurstFramesTotal).toBe(0);
    expect(starts(planFixedCycle([c('Step3')], 601))).toEqual([600]);
    expect(starts(planFixedCycle([c('Step3')], 0))).toEqual([]);
  });

  it('rejects a non-integer or negative duration and an inconsistent cycle', () => {
    expect(() => planFixedCycle([], -1)).toThrow(RangeError);
    expect(() => planFixedCycle([], 1.5)).toThrow(RangeError);
    expect(() => planFixedCycle([], 100, { cycleFrames: 100, normalFrames: 60, fullBurstFrames: 60 })).toThrow(
      RangeError,
    );
  });

  it('durationToFrames rounds up', () => {
    expect(durationToFrames(180)).toBe(10800);
    expect(durationToFrames(0.01)).toBe(1);
    expect(() => durationToFrames(-1)).toThrow(RangeError);
  });
});

describe('isFullBurstFrame', () => {
  it('is true for the second half of every cycle', () => {
    expect(isFullBurstFrame(599)).toBe(false);
    expect(isFullBurstFrame(600)).toBe(true);
    expect(isFullBurstFrame(1199)).toBe(true);
    expect(isFullBurstFrame(1200)).toBe(false);
    expect(isFullBurstFrame(10200)).toBe(true);
    expect(FIXED_BURST_CYCLE.normalFrames + FIXED_BURST_CYCLE.fullBurstFrames).toBe(FIXED_BURST_CYCLE.cycleFrames);
  });
});

describe('assignBurstSteps', () => {
  it('picks the lowest slot for each step and leaves missing steps null', () => {
    expect(assignBurstSteps([c('Step3'), c('Step1'), null, c('Step3')])).toEqual({ Step1: 1, Step2: null, Step3: 0 });
    expect(assignBurstSteps([null, null])).toEqual({ Step1: null, Step2: null, Step3: null });
  });

  it('uses AllStep for the lowest unfilled steps, each AllStep slot at most once', () => {
    expect(assignBurstSteps([c('Step3'), c('AllStep')])).toEqual({ Step1: 1, Step2: null, Step3: 0 });
    expect(assignBurstSteps([c('AllStep'), c('AllStep'), c('Step2')])).toEqual({ Step1: 0, Step2: 2, Step3: 1 });
    // 専任がいれば AllStep は使わない
    expect(assignBurstSteps([c('AllStep'), c('Step1'), c('Step2'), c('Step3')])).toEqual({
      Step1: 1,
      Step2: 2,
      Step3: 3,
    });
  });
});
