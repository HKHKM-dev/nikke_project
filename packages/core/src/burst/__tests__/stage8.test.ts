// Stage 8: 時刻表の追加分（枠ごとのフルバースト時間、発動の結果入った段階、段階突入のフレーム、常時のゲージ速度、射撃の列の共有）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { planShots } from '../../sim/shots.ts';
import type { BurstNextStep, BurstStep, CharacterData } from '../../types.ts';
import {
  BURST_GAUGE_MAX,
  DEFAULT_BURST_TIMING,
  finishSchedule,
  initialBurstController,
  stepBurstController,
  type BurstUnit,
} from '../controller.ts';
import { planDynamicSchedule } from '../dynamic.ts';
import { durationToFrames, planFixedCycle } from '../fixedCycle.ts';
import { stageEnterFrames, type BurstSchedule } from '../schedule.ts';

const NEXT: Record<BurstStep, BurstNextStep> = {
  Step1: 'Step2',
  Step2: 'Step3',
  Step3: 'StepFull',
  AllStep: 'NextStep',
};

function unit(burstStep: BurstStep, cooldownFrames: number, fullBurstFrames?: number): BurstUnit {
  const u: NonNullable<BurstUnit> = { burstStep, nextStep: NEXT[burstStep], cooldownFrames };
  if (fullBurstFrames !== undefined) u.fullBurstFrames = fullBurstFrames;
  return u;
}

function run(units: readonly BurstUnit[], frames: number, gaugePerFrame: number): BurstSchedule {
  const state = initialBurstController(units, DEFAULT_BURST_TIMING);
  for (let f = 0; f < frames; f++) stepBurstController(state, f, gaugePerFrame);
  return finishSchedule(state, frames);
}

function load(id: number): { character: CharacterData } {
  const path = new URL(`../../../data/characters/${id}.json`, import.meta.url);
  return { character: JSON.parse(readFileSync(path, 'utf8')) as CharacterData };
}

describe('full burst length per unit (burst_duration)', () => {
  it('uses the length of the unit whose activation starts the full burst', () => {
    // III が 300f（イサベル型）。I / II の長さは使わない
    const s = run([unit('Step1', 0, 900), unit('Step2', 0, 900), unit('Step3', 0, 300)], 1000, BURST_GAUGE_MAX);
    expect(s.fullBurstWindows[0]).toEqual({ start: 60, end: 360 });
    // 終了後は 0 から溜め直して、次の満タンは 360f
    expect(s.gaugeFullFrames[1]).toBe(360);
  });

  it('falls back to timing.fullBurstFrames (600f) when the unit has none', () => {
    const s = run([unit('Step1', 0), unit('Step2', 0), unit('Step3', 0)], 1000, BURST_GAUGE_MAX);
    expect(s.fullBurstWindows[0]).toEqual({ start: 60, end: 660 });
  });

  it('takes 5 s from イサベル and 15 s from モダニア as III in a real team', () => {
    const frames = durationToFrames(180);
    const lengths = (iii: number): number[] =>
      planDynamicSchedule([291, 20, iii].map(load), frames).fullBurstWindows.map((w) => w.end - w.start);
    expect(new Set(lengths(231).slice(0, -1))).toEqual(new Set([300]));
    expect(new Set(lengths(260).slice(0, -1))).toEqual(new Set([900]));
    expect(new Set(lengths(10).slice(0, -1))).toEqual(new Set([600]));
  });
});

describe('enteredStep and stageEnterFrames', () => {
  it('records the step each activation moves the chain into (dynamic)', () => {
    const s = run([unit('Step1', 0), unit('Step2', 0), unit('Step3', 0)], 300, BURST_GAUGE_MAX);
    expect(s.activations.map((a) => [a.frame, a.step, a.enteredStep])).toEqual([
      [20, 'Step1', 'Step2'],
      [40, 'Step2', 'Step3'],
      [60, 'Step3', null],
    ]);
    // 段階 1 はゲージ満タン、2 / 3 は I / II の発動フレーム
    expect(stageEnterFrames(s, 'Step1')).toEqual([0]);
    expect(stageEnterFrames(s, 'Step2')).toEqual([20]);
    expect(stageEnterFrames(s, 'Step3')).toEqual([40]);
  });

  it('counts a re-entry (Step1 → Step1) as entering stage 1 again', () => {
    const reentry: BurstUnit = { burstStep: 'Step1', nextStep: 'Step1', cooldownFrames: 0 };
    const s = run([reentry, unit('Step1', 0), unit('Step2', 0), unit('Step3', 0)], 300, BURST_GAUGE_MAX);
    expect(s.activations[0]!.enteredStep).toBe('Step1');
    expect(stageEnterFrames(s, 'Step1')).toEqual([0, s.activations[0]!.frame]);
  });

  it('puts all three stage entries on the activation frame in the fixed cycle', () => {
    const s = planFixedCycle([{ burstStep: 'Step1' }, { burstStep: 'Step2' }, { burstStep: 'Step3' }], 3000);
    for (const step of ['Step1', 'Step2', 'Step3'] as const) expect(stageEnterFrames(s, step)).toEqual([600, 1800]);
  });
});

describe('planDynamicSchedule with shared shots and gauge speed', () => {
  const frames = durationToFrames(180);
  const team = [291, 20, 290].map(load);

  it('gives the same schedule whether it runs the shooters itself or takes planShots', () => {
    const own = planDynamicSchedule(team, frames, undefined, undefined, 2);
    const shared = planDynamicSchedule(team, frames, undefined, undefined, 2, { shots: planShots(team, frames) });
    expect(shared).toEqual(own);
  });

  it('speeds up only the gauge of the slot with burstGaugeSpeed', () => {
    const plain = planDynamicSchedule(team, frames, undefined, undefined, 2);
    const fast = planDynamicSchedule(team, frames, undefined, undefined, 2, { gaugeSpeed: [0, 0, 0.704] });
    const zero = planDynamicSchedule(team, frames, undefined, undefined, 2, { gaugeSpeed: [0, 0, 0] });
    expect(zero).toEqual(plain);
    expect(fast.gaugeFullFrames[0]!).toBeLessThan(plain.gaugeFullFrames[0]!);
    // 他の枠に付けてもマナの枠ほどは速くならない（効くのはその枠の射撃のゲージだけ）
    const onAether = planDynamicSchedule(team, frames, undefined, undefined, 2, { gaugeSpeed: [0.704, 0, 0] });
    expect(onAether.gaugeFullFrames[0]!).not.toBe(fast.gaugeFullFrames[0]!);
  });
});
