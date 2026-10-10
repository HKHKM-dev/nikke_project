import { describe, expect, it } from 'vitest';
import type { BurstStep } from '../../types.ts';
import {
  FIXED_BURST_CYCLE,
  assignBurstSteps,
  isFullBurstFrame,
  planFixedCycle,
  type BurstCandidate,
} from '../fixedCycle.ts';
import { gameSecondsToFrames } from '../../time.ts';
import { slotsByStep, type BurstSchedule } from '../schedule.ts';

const starts = (s: BurstSchedule): number[] => s.fullBurstWindows.map((w) => w.start);

const c = (step: BurstStep): BurstCandidate => ({ burstStep: step });

describe('planFixedCycle', () => {
  // Stage 21-B: 通常 10 秒・フルバースト 10 秒はそれぞれ gameSecondsToFrames(10) = 588f、1 サイクル 1,176f
  const H = FIXED_BURST_CYCLE.normalFrames;
  const C = FIXED_BURST_CYCLE.cycleFrames;

  it('fires 9 times in 180 seconds at 10, 30, …, 170 s and spends 90 s in full burst', () => {
    expect([H, C]).toEqual([588, 1176]);
    const s = planFixedCycle([c('Step1'), c('Step2'), c('Step3')], gameSecondsToFrames(180));
    expect(starts(s)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8].map((k) => H + k * C));
    expect(s.model).toBe('fixed');
    // 各サイクルで I → II → III が同じフレームに並ぶ
    expect(s.activations).toHaveLength(27);
    expect(s.activations.slice(0, 3)).toEqual([
      { frame: H, step: 'Step1', slotIndex: 0, startsFullBurst: false, enteredStep: 'Step2' },
      { frame: H, step: 'Step2', slotIndex: 1, startsFullBurst: false, enteredStep: 'Step3' },
      { frame: H, step: 'Step3', slotIndex: 2, startsFullBurst: true, enteredStep: null, fullBurstStart: H },
    ]);
    expect(s.fullBurstWindows[0]).toEqual({ start: H, end: C, burstUsers: [0, 1, 2] });
    expect(s.fullBurstWindows[8]).toEqual({ start: H + 8 * C, end: 9 * C, burstUsers: [0, 1, 2] });
    expect(s.fullBurstFramesTotal).toBe(9 * H);
    expect(slotsByStep(s)).toEqual({ Step1: [0], Step2: [1], Step3: [2] });
    expect(assignBurstSteps([c('Step1'), c('Step2'), c('Step3')])).toEqual({ Step1: 0, Step2: 1, Step3: 2 });
  });

  it('clips the last window at the end of the battle and drops activations after it', () => {
    const end = H + 8 * C + 300;
    const s = planFixedCycle([c('Step3')], end);
    expect(starts(s)).toHaveLength(9);
    expect(s.fullBurstWindows[8]).toEqual({ start: H + 8 * C, end, burstUsers: [0] });
    expect(s.fullBurstFramesTotal).toBe(8 * H + 300);
    const short = planFixedCycle([c('Step3')], H);
    expect(starts(short)).toEqual([]);
    expect(short.activations).toEqual([]);
    expect(short.fullBurstFramesTotal).toBe(0);
    expect(starts(planFixedCycle([c('Step3')], H + 1))).toEqual([H]);
    expect(starts(planFixedCycle([c('Step3')], 0))).toEqual([]);
  });

  it('rejects a non-integer or negative duration and an inconsistent cycle', () => {
    expect(() => planFixedCycle([], -1)).toThrow(RangeError);
    expect(() => planFixedCycle([], 1.5)).toThrow(RangeError);
    expect(() => planFixedCycle([], 100, { cycleFrames: 100, normalFrames: 60, fullBurstFrames: 60 })).toThrow(
      RangeError,
    );
  });
});

describe('isFullBurstFrame', () => {
  it('is true for the second half of every cycle', () => {
    const { normalFrames: h, cycleFrames: c } = FIXED_BURST_CYCLE;
    expect(isFullBurstFrame(h - 1)).toBe(false);
    expect(isFullBurstFrame(h)).toBe(true);
    expect(isFullBurstFrame(c - 1)).toBe(true);
    expect(isFullBurstFrame(c)).toBe(false);
    expect(isFullBurstFrame(h + 8 * c)).toBe(true);
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
