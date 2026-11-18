// デルタ（20）を含む編成: 定義はダメージに効く効果を持たない（S1 とバーストは noEffect。S2 の防御力▲ は自分に付く効果で、与ダメージの式は
// 読まない。C-0589）。射撃の列のグループ分け（V-0027、C-0081）。
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

const DELTA = 20;
// 録画 0063 の編成（フラワー + デルタ + アスカ）と、デルタが II の実戦寄りの 5 人
const TEAMS: Record<string, { input: TeamInput; delta: number }> = {
  '録画 0063 の編成（フラワー + デルタ + アスカ）': {
    input: team([fixedSlot(304), fixedSlot(DELTA), fixedSlot(830)], 2),
    delta: 1,
  },
  '実戦寄り（リター + デルタ + ドレイク + アリス + クラウン）': {
    input: team([fixedSlot(82), fixedSlot(DELTA), fixedSlot(101), fixedSlot(191), fixedSlot(330)], 2),
    delta: 1,
  },
};

describe('デルタの定義', () => {
  it('has no effects in S1 and the burst, and only the DEF up on herself in S2 (C-0081・C-0589)', () => {
    const def = parseSkillDefinition(rawDefinition(DELTA));
    for (const slot of ['skill1', 'burst'] as const) {
      expect(def.skills[slot].support).toBe('noEffect');
      expect(def.skills[slot].effects).toEqual([]);
    }
    expect(def.skills.skill2.support).toBe('supported');
    expect(def.skills.skill2.effects).toHaveLength(1);
    expect(def.skills.skill2.effects[0]).toMatchObject({ kind: 'timed', stat: 'defense', target: 'self' });
  });
});

describe.each(Object.entries(TEAMS))('編成: %s', (_name, { input, delta }) => {
  const calc = runTeam(input);
  const plan = planTeamRun(input);

  it('gives no damage buff windows or instants from Delta, only the DEF up on herself (C-0081・C-0589)', () => {
    const windows = piecesOf(plan).filter((w) => w.sourceSlotIndex === delta);
    expect(windows.length).toBeGreaterThan(0);
    expect(windows.every((w) => w.effect.stat === 'defense' && w.slotIndex === delta)).toBe(true);
    expect(plan.instants.filter((e) => e.sourceSlotIndex === delta)).toEqual([]);
  });

  it('partitions every shot into exactly one group (start ≤ shot < end)', () => {
    input.slots.forEach((_, i) => {
      const frames = plan.shots[i]!.frames;
      const total = calc.slots[i]!.segments.reduce((sum, g) => sum + countShotsInRanges(frames, g.ranges), 0);
      expect(total).toBe(frames.length);
    });
  });
});
