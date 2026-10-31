// ミルク（141）を含む編成（2 段目の段 15 の PR 1。plan/design-skill-stage15.md 2.1 節。V-0559）。宝物版と HP の閾値の細かい動きは
// skills/__tests__/stage15Milk.test.ts。ここでは味方と組んだ時に:
// S2: 自分の HP が 80% 以上の間、味方全体に会心ダメージ▲（HP は満タンのままなので戦闘の全部）。
// バースト: バーストスキルダメージは使うたびに 1 ヒット。射撃の列のグループ分け。
import { describe, expect, it } from 'vitest';
import { planTeamRun } from '../frame/plan.ts';
import { runSimulation } from '../sim/engine.ts';
import { expectEveryShotInOneGroup, fixedTeam, readJson } from './teamHelpers.ts';
import type { CharacterData } from '../types.ts';

const MILK = 141;
// S2 の会心ダメージ▲（Lv10）
const CRIT_DAMAGE =
  Number(readJson<CharacterData>(`../../data/characters/${MILK}.json`).skills.skill2.values[0]![9]) / 100;

const TEAMS = {
  単騎: fixedTeam([MILK], 0),
  'ミルク + デルタ + スノーホワイト：ヘビーアームズ': fixedTeam([MILK, 20, 471], 2),
};

describe('ミルク + デルタ + スノーホワイト：ヘビーアームズ', () => {
  const input = TEAMS['ミルク + デルタ + スノーホワイト：ヘビーアームズ'];
  const plan = planTeamRun(input);

  it('raises the crit damage of every ally for the whole battle while her HP stays full (S2)', () => {
    // 編成のほかのキャラに会心ダメージ▲は無いので、どの区間のどの枠もミルクの▲だけ
    expect(CRIT_DAMAGE).toBeGreaterThan(0);
    expect(plan.timeline.segments[0]!.start).toBe(0);
    expect(plan.timeline.segments.at(-1)!.end).toBe(plan.frames);
    for (const segment of plan.timeline.segments)
      for (const slot of segment.slots) expect(slot!.buffs.critDamage).toBeCloseTo(CRIT_DAMAGE, 12);
  });

  it('lands one burst skill damage hit on every burst use', () => {
    const uses = plan.schedule!.activations.filter((a) => a.slotIndex === 0);
    const burst = runSimulation(input).slots[0]!.burst;
    expect(uses.length).toBeGreaterThan(2);
    expect(burst.activations).toEqual(uses.map((a) => a.frame));
    for (const hit of burst.hits) expect(hit.perActivation).toBeGreaterThan(0);
  });
});

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  it('partitions every shot into exactly one group (start ≤ shot < end)', () => {
    expectEveryShotInOneGroup(input, planTeamRun(input));
  });
});
