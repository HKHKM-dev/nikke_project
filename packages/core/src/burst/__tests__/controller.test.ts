import { describe, expect, it } from 'vitest';
import type { BurstNextStep, BurstStep } from '../../types.ts';
import {
  BURST_GAUGE_MAX,
  DEFAULT_BURST_TIMING,
  finishSchedule,
  initialBurstController,
  resolveNextStep,
  stepBurstController,
  type BurstTiming,
  type BurstUnit,
} from '../controller.ts';
import type { BurstSchedule } from '../schedule.ts';

const NEXT: Record<BurstStep, BurstNextStep> = {
  Step1: 'Step2',
  Step2: 'Step3',
  Step3: 'StepFull',
  AllStep: 'NextStep',
};

function unit(burstStep: BurstStep, cooldownFrames: number, nextStep: BurstNextStep = NEXT[burstStep]): BurstUnit {
  return { burstStep, nextStep, cooldownFrames };
}

/** 毎フレーム gaugePerFrame を入れて frames フレーム回す */
function run(
  units: readonly BurstUnit[],
  frames: number,
  gaugePerFrame: number,
  timing: BurstTiming = DEFAULT_BURST_TIMING,
): BurstSchedule {
  const state = initialBurstController(units, timing);
  for (let f = 0; f < frames; f++) stepBurstController(state, f, gaugePerFrame);
  return finishSchedule(state, frames);
}

const FAST = BURST_GAUGE_MAX; // 1 フレームで満タン
const starts = (s: BurstSchedule): number[] => s.fullBurstWindows.map((w) => w.start);
const summary = (s: BurstSchedule): string[] => s.activations.map((a) => `${a.frame}:${a.step}:${a.slotIndex}`);

describe('BurstController', () => {
  it('is gauge-bound when cooldowns are short: full → I → II → III with 20f steps, 600f full burst, then refill from 0', () => {
    const s = run([unit('Step1', 0), unit('Step2', 0), unit('Step3', 0)], 1800, 5000); // 200f で満タン
    expect(s.gaugeFullFrames).toEqual([199, 1058]);
    expect(summary(s)).toEqual([
      '219:Step1:0',
      '239:Step2:1',
      '259:Step3:2',
      '1078:Step1:0',
      '1098:Step2:1',
      '1118:Step3:2',
    ]);
    expect(s.fullBurstWindows).toEqual([
      { start: 259, end: 859, burstUsers: [0, 1, 2] },
      { start: 1118, end: 1718, burstUsers: [0, 1, 2] },
    ]);
    // 3 回目の満タンは 1,718 + 199 = 1,917 で、1,800f の戦闘には入らない
    expect(s.activations.map((a) => a.startsFullBurst)).toEqual([false, false, true, false, false, true]);
    expect(s.fullBurstFramesTotal).toBe(1200);
    expect(s.model).toBe('dynamic');
  });

  it('does not charge during full burst', () => {
    // 満タンまで 200f。フルバースト終了（859）から数え直すので 2 回目の満タンは 859 + 199
    const s = run([unit('Step1', 0), unit('Step2', 0), unit('Step3', 0)], 1100, 5000);
    expect(s.gaugeFullFrames[1]).toBe(859 + 199);
  });

  it('is cooldown-bound with a single III of 40 s: full bursts exactly 2,400f apart, 5 in 180 s', () => {
    const s = run([unit('Step1', 2400), unit('Step2', 2400), unit('Step3', 2400)], 10800, FAST);
    expect(starts(s)).toEqual([60, 2460, 4860, 7260, 9660]);
    // 満タンのあと I の CT 明けを待つ間はタイムアウトしない
    expect(s.chainTimeouts).toEqual([]);
    expect(s.gaugeFullFrames[1]).toBe(660);
  });

  it('alternates two IIIs so that the cycle shrinks to the 20 s of I / II', () => {
    const s = run([unit('Step1', 1200), unit('Step2', 1200), unit('Step3', 2400), unit('Step3', 2400)], 5000, FAST);
    expect(starts(s)).toEqual([60, 1260, 2460, 3660, 4860]);
    expect(s.activations.filter((a) => a.step === 'Step3').map((a) => a.slotIndex)).toEqual([2, 3, 2, 3, 2]);
  });

  it('prefers the lowest ready slot among candidates of the same step', () => {
    const s = run([unit('Step3', 2400), unit('Step1', 0), unit('Step2', 0), unit('Step3', 2400)], 1000, FAST);
    expect(summary(s).slice(0, 3)).toEqual(['20:Step1:1', '40:Step2:2', '60:Step3:0']);
  });

  it('never full-bursts without a III: the chain times out 600f after II and the gauge resets', () => {
    const s = run([unit('Step1', 1200), unit('Step2', 1200)], 3000, FAST);
    expect(s.fullBurstWindows).toEqual([]);
    expect(s.chainTimeouts).toEqual([640, 1840]);
    // タイムアウトの次のフレームから溜め直す
    expect(s.gaugeFullFrames).toEqual([0, 641, 1841]);
    expect(summary(s)).toEqual([
      '20:Step1:0',
      '40:Step2:1',
      '1220:Step1:0',
      '1240:Step2:1',
      '2420:Step1:0',
      '2440:Step2:1',
    ]);
  });

  it('times out after I when II is still on cooldown (the second chain of recording 22)', () => {
    const s = run([unit('Step1', 1200), unit('Step2', 2400), unit('Step3', 2400)], 3000, FAST);
    // 1 回目は通る。2 回目は I（CT 20 秒）が 1,220f に撃つが II の CT 明けは 2,440f なので 600f 後に切れる
    expect(summary(s).slice(3)).toEqual(['1220:Step1:0', '2420:Step1:0', '2440:Step2:1', '2460:Step3:2']);
    expect(s.chainTimeouts).toEqual([1820]);
    expect(starts(s)).toEqual([60, 2460]);
  });

  it('handles re-entry (Step1 → Step1): two Is fire before II', () => {
    const s = run(
      [unit('Step1', 1200, 'Step1'), unit('Step1', 1200), unit('Step2', 1200), unit('Step3', 1200)],
      200,
      FAST,
    );
    expect(summary(s)).toEqual(['20:Step1:0', '40:Step1:1', '60:Step2:2', '80:Step3:3']);
  });

  it('fills a missing step with AllStep (NextStep) and prefers dedicated slots', () => {
    const s = run([unit('AllStep', 2400), unit('Step1', 1200), unit('Step3', 2400)], 200, FAST);
    expect(summary(s)).toEqual(['20:Step1:1', '40:Step2:0', '60:Step3:2']);
    expect(resolveNextStep('NextStep', 'Step3')).toBe('StepFull');
    expect(resolveNextStep('Step1', 'Step1')).toBe('Step1');
  });

  it('clips the last full burst at the end of the battle', () => {
    const s = run([unit('Step1', 0), unit('Step2', 0), unit('Step3', 0)], 500, 5000);
    expect(s.fullBurstWindows).toEqual([{ start: 259, end: 500, burstUsers: [0, 1, 2] }]);
    expect(s.fullBurstFramesTotal).toBe(241);
  });

  it('can fire several steps in one frame when intervals are 0', () => {
    const timing = { ...DEFAULT_BURST_TIMING, readyDelayFrames: 0, step1ToStep2Frames: 0, step2ToStep3Frames: 0 };
    const s = run([unit('Step1', 0), unit('Step2', 0), unit('Step3', 0)], 10, FAST, timing);
    expect(summary(s)).toEqual(['0:Step1:0', '0:Step2:1', '0:Step3:2']);
  });

  it('does nothing with an empty team and rejects bad timing or cooldowns', () => {
    const empty = run([null, null], 1000, FAST);
    expect(empty.activations).toEqual([]);
    expect(empty.gaugeFullFrames).toEqual([0]);
    expect(() => initialBurstController([], { ...DEFAULT_BURST_TIMING, gaugeMax: 0 })).toThrow(RangeError);
    expect(() => initialBurstController([], { ...DEFAULT_BURST_TIMING, fullBurstFrames: 1.5 })).toThrow(RangeError);
    expect(() => initialBurstController([unit('Step1', -1)])).toThrow(RangeError);
  });
});
