// ミルク（141）を含む編成（2 段目の段 15 の PR 1。plan/design-skill-stage15.md 2.1 節。V-0559）。宝物版と HP の閾値の細かい動きは
// skills/__tests__/stage15Milk.test.ts。ここでは味方と組んだ時に:
// S2: 自分の HP が 80% 以上の間、味方全体に会心ダメージ▲（HP は満タンのままなので戦闘の全部）。
// バースト: バーストスキルダメージは使うたびに 1 ヒット。射撃の列のグループ分け。
import { describe, expect, it } from 'vitest';
import { activationFramesOfSlot } from '../burst/schedule.ts';
import { runSimulation } from '../sim/engine.ts';
import { describeEveryShotInOneGroup, fixedTeam, skillValueOf } from './teamHelpers.ts';

const MILK = 141;

const TEAMS = {
  単騎: fixedTeam([MILK], 0),
  'ミルク + デルタ + スノーホワイト：ヘビーアームズ': fixedTeam([MILK, 20, 471], 2),
};

describe('ミルク + デルタ + スノーホワイト：ヘビーアームズ', () => {
  const sim = runSimulation(TEAMS['ミルク + デルタ + スノーホワイト：ヘビーアームズ']);

  it('raises the crit damage of every ally for the whole battle while her HP stays full (S2)', () => {
    // 編成のほかのキャラに会心ダメージ▲は無いので、どの区間のどの枠もミルクの▲だけ
    const critDamage = skillValueOf(MILK, 'skill2', 1) / 100;
    expect(critDamage).toBeGreaterThan(0);
    expect(sim.timeline.segments[0]!.start).toBe(0);
    expect(sim.timeline.segments.at(-1)!.end).toBe(sim.frames);
    for (const segment of sim.timeline.segments)
      for (const slot of segment.slots) expect(slot!.buffs.critDamage).toBeCloseTo(critDamage, 12);
  });

  it('lands one burst skill damage hit on every burst use', () => {
    const uses = activationFramesOfSlot(sim.schedule!, 0);
    const burst = sim.slots[0]!.burst;
    expect(uses.length).toBeGreaterThan(2);
    expect(burst.activations).toEqual(uses);
    for (const hit of burst.hits) expect(hit.perActivation).toBeGreaterThan(0);
  });
});

describeEveryShotInOneGroup(TEAMS);
