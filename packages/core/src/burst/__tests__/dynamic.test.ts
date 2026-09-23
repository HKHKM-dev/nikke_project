import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { makeCharacter } from '../../__tests__/fixtures.ts';
import type { CharacterData } from '../../types.ts';
import { BURST_GAUGE_MAX } from '../controller.ts';
import {
  BURST_ENERGY_MULTIPLIER,
  SG_PELLET_GAUGE_HIT_RATE,
  burstUnitOf,
  energyPerTrigger,
  planDynamicSchedule,
} from '../dynamic.ts';

function load(id: number): CharacterData {
  return JSON.parse(
    readFileSync(new URL(`../../../data/characters/${id}.json`, import.meta.url), 'utf8'),
  ) as CharacterData;
}

// 単騎の録画（2026-09-23、射撃場の BigArms）で読んだ 1 トリガーの増分。BURST バーは 113px なので 1px ≈ 0.885%。
// AR / MG は 1 発が 1px 未満なので、1 マガジンの伸びを弾数で割った値。範囲は読み取りの ±0.5px ぶん
const MEASURED: { name: string; id: number; controlled: boolean; percent: [number, number] }[] = [
  { name: 'ラピ AR（操作・AI とも 32〜33px / 60 発）', id: 10, controlled: true, percent: [0.472, 0.487] },
  { name: 'エマ MG（操作・AI とも 40〜41px / 300 発）', id: 90, controlled: true, percent: [0.118, 0.121] },
  { name: 'ベロータ RL（操作・コア / 胴体とも 13px）', id: 60, controlled: true, percent: [11.06, 11.95] },
  { name: 'デルタ SR（操作・コア / 胴体とも 17〜18px）', id: 20, controlled: true, percent: [15.0, 16.4] },
  { name: 'デルタ SR（AI・7〜8px）', id: 20, controlled: false, percent: [5.75, 7.5] },
  { name: 'ノワール SG（操作・平均 8.1%、AI・平均 8.4%）', id: 271, controlled: true, percent: [7.9, 8.6] },
];

describe('energyPerTrigger (calibrated on single-character recordings)', () => {
  for (const m of MEASURED) {
    it(m.name, () => {
      const percent = (energyPerTrigger(load(m.id).shot, m.controlled) / BURST_GAUGE_MAX) * 100;
      expect(percent).toBeGreaterThanOrEqual(m.percent[0]);
      expect(percent).toBeLessThanOrEqual(m.percent[1]);
    });
  }

  it('applies the full-charge ratio only to the controlled nike', () => {
    const delta = load(20).shot;
    expect(energyPerTrigger(delta, true) / energyPerTrigger(delta, false)).toBeCloseTo(2.5, 12);
    // チャージなし武器は操作でも AI でも同じ。倍率の値も無視する
    const ar = makeCharacter({ fullChargeBurstEnergy: 3 }).shot;
    expect(energyPerTrigger(ar, true)).toBe(energyPerTrigger(ar, false));
    expect(energyPerTrigger(ar, true)).toBeCloseTo(4000 * BURST_ENERGY_MULTIPLIER, 9);
  });

  it('counts SG pellets at the gauge hit rate', () => {
    expect(energyPerTrigger(load(271).shot, false)).toBeCloseTo(
      9000 * 10 * SG_PELLET_GAUGE_HIT_RATE * BURST_ENERGY_MULTIPLIER,
      9,
    );
  });
});

describe('burstUnitOf', () => {
  it('turns the cooldown seconds into frames and keeps the step and the next step', () => {
    expect(burstUnitOf(load(10))).toEqual({
      burstStep: 'Step3',
      nextStep: 'StepFull',
      cooldownFrames: 2400,
      fullBurstFrames: 600,
    });
    expect(burstUnitOf(load(93))).toEqual({
      burstStep: 'Step1',
      nextStep: 'Step2',
      cooldownFrames: 1200,
      fullBurstFrames: 600,
    });
  });

  it('takes the full burst length from burst_duration (Stage 8: イサベル 5 秒、モダニア 15 秒)', () => {
    expect(burstUnitOf(load(231)).fullBurstFrames).toBe(300);
    expect(burstUnitOf(load(260)).fullBurstFrames).toBe(900);
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
