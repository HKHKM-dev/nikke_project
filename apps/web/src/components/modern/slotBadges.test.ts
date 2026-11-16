// @vitest-environment happy-dom
// スロットの育成を育成状況から変えたか（slotBadges.ts の slotGrowthEdited）。データは作った値
import { BUILD_SNAPSHOT_FORMAT_VERSION, emptyBuild, type BuildSnapshot, type SnapshotCharacter } from '@nikke/core';
import { cleanup, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { rosterGrowthOf } from '../../roster.ts';
import { emptySlot, initialTeamState, type SlotGrowthFields, type TeamState } from '../../team.ts';
import { RosterRevertButton } from '../RosterRevertButton.tsx';
import { slotGrowthEdited } from './slotBadges.ts';

afterEach(cleanup);

function character(over: Partial<SnapshotCharacter> = {}): SnapshotCharacter {
  return {
    ...emptyBuild(),
    growth: { level: 400, grade: 3, core: 7 },
    affectionRank: 10,
    cube: { id: 1000301, level: 7 },
    recycleRoom: { personal: 30, class: 20, corporation: 5 },
    skillLevels: { skill1: 10, skill2: 7, burst: 4 },
    treasure: null,
    ...over,
  };
}

/** 育成状況にいるのは 10 と 82。99 はいない */
const ROSTER: BuildSnapshot = {
  formatVersion: BUILD_SNAPSHOT_FORMAT_VERSION,
  fetchedAt: '2026-11-16T00:00:00.000Z',
  synchroLevel: 400,
  recycleRoom: {},
  characters: {
    '10': character({ growth: { level: 400, grade: 1, core: 0 }, skillLevels: { skill1: 4, skill2: 4, burst: 4 } }),
    '82': character(),
  },
  unmapped: [],
};
const growth10 = rosterGrowthOf(ROSTER, 10)!;
const growth82 = rosterGrowthOf(ROSTER, 82)!;

/** スロット 0 にニケ（resourceId）を置き、育成を fields にした編成 */
function teamWith(resourceId: number | null, fields: SlotGrowthFields, fixedSpec = false): TeamState {
  const team = initialTeamState();
  team.slots[0] = { ...emptySlot(), resourceId, ...fields };
  return { ...team, fixedSpec };
}
const otherSkills: SlotGrowthFields = { ...growth82, skillLevels: { skill1: 10, skill2: 8, burst: 4 } };

type Case = { name: string; team: TeamState; roster: BuildSnapshot | null; edited: boolean };
const CASES: Case[] = [
  { name: '育成状況にいるニケで育成が同じ', team: teamWith(82, growth82), roster: ROSTER, edited: false },
  { name: '育成状況にいるニケで育成が違う', team: teamWith(82, otherSkills), roster: ROSTER, edited: true },
  // 育成状況にいないニケに替えると、スロットの育成は前のニケ（ここでは 10）のものが残る
  { name: '育成状況にいないニケ（前のニケの育成が残る）', team: teamWith(99, growth10), roster: ROSTER, edited: false },
  { name: '空のスロット', team: teamWith(null, growth10), roster: ROSTER, edited: false },
  { name: 'スペック固定', team: teamWith(82, otherSkills, true), roster: ROSTER, edited: false },
  { name: '育成状況が無い', team: teamWith(82, otherSkills), roster: null, edited: false },
];

describe('slotGrowthEdited', () => {
  it.each(CASES)('$name → $edited', ({ team, roster, edited }) => {
    expect(slotGrowthEdited(team, roster, 0)).toBe(edited);
  });

  it('見るのは指したスロットだけ', () => {
    const team = teamWith(82, growth82);
    team.slots[1] = { ...emptySlot(), resourceId: 10, ...otherSkills };
    expect(slotGrowthEdited(team, ROSTER, 0)).toBe(false);
    expect(slotGrowthEdited(team, ROSTER, 1)).toBe(true);
  });

  // 歯車の青と「育成状況の値に戻す」（育成・設定の窓。ModernView が rosterGrowthOf で育成状況の値を渡す）は同じ条件
  it.each(CASES)('「育成状況の値に戻す」を押せるのと同じ: $name', ({ team, roster, edited }) => {
    const slot = team.slots[0]!;
    const rosterGrowth = rosterGrowthOf(roster, slot.resourceId);
    render(
      createElement(RosterRevertButton, { fields: slot, rosterGrowth, fixedSpec: team.fixedSpec, onRevert: () => {} }),
    );
    const button = screen.queryByRole('button', { name: '育成状況の値に戻す' });
    const enabled = button !== null && button.getAttribute('aria-disabled') === 'false';
    expect(enabled).toBe(edited);
  });
});
