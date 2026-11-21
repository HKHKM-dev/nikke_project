// キロ編（plan/design-kilo.md）: キロ（361）を含む編成で、戦闘開始時のナノコーティング（自分へのバリア）が戦闘の終わりまで続き、
// バーストのたびに最大HP を攻撃力として換算した 1 ヒットが出るか
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { planTeamRun } from '../frame/plan.ts';
import { hitFramesOf } from '../burst/schedule.ts';
import { itemsOf } from '../skills/holders.ts';
import { runSimulation } from '../sim/engine.ts';
import { staticStatesOf } from '../skills/types.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { describeEveryShotInOneGroup, fixedSlot, fixedTeam, rangeEnemyWithEvents } from './teamHelpers.ts';

const KILO = 361;
const rangeEnemy: EnemyInput = rangeEnemyWithEvents();

/** 撮影の編成。キロは 3 枠目（操作） */
function rangeTeam(ids: readonly number[]): TeamInput {
  const slots = ids.map((id): TeamSlotInput => fixedSlot(id, { conditionMode: 'auto' }));
  return fixedTeam(slots, 2, { enemy: rangeEnemy });
}

type Case = { input: TeamInput; kilo: number };
const CASES: Record<string, Case> = {
  '撮影（ココア + ソルジャーF.A. + キロ）': { input: rangeTeam([311, 301, KILO]), kilo: 2 },
  '実戦寄り（リター + クラウン + キロ + 紅蓮 + アリス）': { input: fixedTeam([82, 330, KILO, 222, 191], 2), kilo: 2 },
};

describe.each(Object.entries(CASES))('編成: %s', (_name, { input, kilo: K }) => {
  const plan = planTeamRun(input);
  const mine = plan.schedule!.activations.filter((a) => a.slotIndex === K);

  it('keeps Nano Coating on herself from the start of battle to the end (a static state, not items)', () => {
    expect(staticStatesOf(input.slots[K]!.skills!.definition)).toEqual(['nanoCoating']);
    expect(itemsOf(plan.history, { state: 'nanoCoating' })).toEqual([]);
  });

  it('hits once at every Burst use of hers', () => {
    expect(mine.length).toBeGreaterThan(0);
    // 遅れの表に行が無い（既定の遅れ）。時刻は録画で読む
    for (const a of mine) expect(hitFramesOf(a).length).toBe(1);
    const result = runSimulation(input).slots[K]!.burst;
    expect(result.activations.length).toBe(mine.length);
    expect(result.damage).toBeGreaterThan(0);
  });
});

describeEveryShotInOneGroup(Object.fromEntries(Object.entries(CASES).map(([n, c]) => [n, c.input])));
