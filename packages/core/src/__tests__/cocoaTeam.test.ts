// ココア（311）を含む編成: 定義はダメージに効く効果を持たない（S1 の遮蔽物 HP 回復は、遮蔽物を読む味方がいる時だけ効く。段 17 の PR 3、
// C-0822。デバフ解除は、デバフの状態を持つ味方がいる時だけ効く。課題 2-59）。射撃の列のグループ分け（V-0031、C-0977）。
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import { countShotsInRanges } from '../frame/shots.ts';
import { runTeam } from './runTeam.ts';
import { planTeamRun } from '../frame/plan.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { piecesOf } from './historyHelpers.ts';
import { rawDefinition } from './data.ts';
import { fixedEnemy, fixedSlot, fixedTeam } from './teamHelpers.ts';

const enemy: EnemyInput = fixedEnemy();

function team(slots: TeamSlotInput[], controlledSlot: number): TeamInput {
  return fixedTeam(slots, controlledSlot, { enemy });
}

const COCOA = 311;
// 撮影の計画の編成（ココア + ニヒリスター。V-0031）と、ココアが I の実戦寄りの 5 人
const TEAMS: Record<string, { input: TeamInput; cocoa: number }> = {
  '撮影の計画の編成（ココア + ニヒリスター）': {
    input: team([fixedSlot(COCOA), fixedSlot(261)], 1),
    cocoa: 0,
  },
  '実戦寄り（ココア + クラウン + アリス + 紅蓮BS + モダニア）': {
    input: team([fixedSlot(COCOA), fixedSlot(330), fixedSlot(191), fixedSlot(225), fixedSlot(260)], 2),
    cocoa: 0,
  },
};

describe('ココアの定義', () => {
  it('has the S1 cover heal and the debuff removals (S1 and burst) as effects', () => {
    const def = parseSkillDefinition(rawDefinition(COCOA));
    expect(def.skills.skill1.effects.map((e) => e.kind)).toEqual(['coverHeal', 'removeDebuff']);
    expect(def.skills.burst.effects.map((e) => e.kind)).toEqual(['removeDebuff']);
    expect(def.skills.skill2.effects).toEqual([]);
    expect(def.skills.skill2.support).toBe('noEffect');
  });
});

describe.each(Object.entries(TEAMS))('編成: %s', (_name, { input, cocoa }) => {
  const calc = runTeam(input);
  const plan = planTeamRun(input);

  it('gives no buff windows or instants from Cocoa (C-0977)', () => {
    expect(piecesOf(plan).filter((w) => w.sourceSlotIndex === cocoa)).toEqual([]);
    expect(plan.instants.filter((e) => e.sourceSlotIndex === cocoa)).toEqual([]);
  });

  it('partitions every shot into exactly one group (start ≤ shot < end)', () => {
    input.slots.forEach((_, i) => {
      const frames = plan.shots[i]!.frames;
      const total = calc.slots[i]!.segments.reduce((sum, g) => sum + countShotsInRanges(frames, g.ranges), 0);
      expect(total).toBe(frames.length);
    });
  });
});
