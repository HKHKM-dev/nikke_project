// アンカー：イノセントメイド（355）を含む編成: S1・S2 の使用回数別の効果（下位効果のスタック適用）。S1 はフルバーストの始まりの回数、
// S2 はフルバーストの終わりの回数（発動の回数の種類 fullBurstEnd）で数える。バーストは味方全体の発動者基準の攻撃力▲
// （plan/design-maids.md、V-0669）。
import { describe, expect, it } from 'vitest';
import { planTeamRun } from '../frame/plan.ts';
import { gameSecondsToFrames } from '../time.ts';
import type { TeamInput } from '../team.ts';
import { piecesOf, statePiecesOf } from './historyHelpers.ts';
import { describeEveryShotInOneGroup, fixedTeam, SHOOTING_RANGE_ENEMY } from './teamHelpers.ts';

const ANCHOR = 355;
const ANCHOR_SLOT = 1;

function team(ids: readonly number[]): TeamInput {
  return fixedTeam(ids, ANCHOR_SLOT, { enemy: { ...SHOOTING_RANGE_ENEMY, element: 'Fire' } });
}

// 撮影 C の編成（リター + アンカー：IM + サン。V-0669）と、アンカー：IM が II の実戦寄りの 5 人
const TEAMS: Record<string, TeamInput> = {
  '撮影 C の編成（リター + アンカー：IM + サン）': team([82, ANCHOR, 308]),
  '実戦寄り（リター + アンカー：IM + アリス + ドレイク + クラウン）': team([82, ANCHOR, 191, 101, 330]),
};

/** 区間 [start, end) の並びを、重なりと接したものをまとめた昇順の並びにする */
function mergeRanges(ranges: readonly (readonly [number, number])[]): [number, number][] {
  const out: [number, number][] = [];
  for (const [start, end] of [...ranges].sort((x, y) => x[0] - y[0])) {
    const last = out.at(-1);
    if (last !== undefined && start <= last[1]) last[1] = Math.max(last[1], end);
    else out.push([start, end]);
  }
  return out;
}

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const plan = planTeamRun(input);
  const windows = plan.schedule!.fullBurstWindows;
  const s2 = [...piecesOf(plan), ...statePiecesOf(plan)].filter(
    (p) => p.sourceSlotIndex === ANCHOR_SLOT && p.effect.source.skill === 'skill2',
  );
  const startsOf = (stat: string) => [...new Set(s2.filter((p) => p.effect.stat === stat).map((p) => p.start))];

  it('gives the S2 effects at the end of the 1st, 2nd and 3rd full bursts onward (lower effects stack)', () => {
    expect(windows.length).toBeGreaterThanOrEqual(3);
    const ends = windows.map((w) => w.end);
    expect(startsOf('hitRate')).toEqual(ends.filter((e) => e < plan.frames));
    expect(startsOf('attack')).toEqual(ends.slice(1).filter((e) => e < plan.frames));
    // リロード速度▲は 15 秒。切れる前に付き直すと区間がつながるので、付いている間（区間の和）で比べる
    const duration = gameSecondsToFrames(15);
    const expected = mergeRanges(
      ends
        .slice(2)
        .filter((e) => e < plan.frames)
        .map((e) => [e, Math.min(e + duration, plan.frames)] as const),
    );
    const reload = s2.filter((p) => p.effect.stat === 'reloadSpeed' && p.slotIndex === 0);
    expect(mergeRanges(reload.map((p) => [p.start, p.end] as const))).toEqual(expected);
  });

  it('gives the S1 Distributed Damage from the 2nd full burst start onward', () => {
    const s1 = piecesOf(plan).filter(
      (p) => p.sourceSlotIndex === ANCHOR_SLOT && p.effect.source.skill === 'skill1' && p.slotIndex === 0,
    );
    expect(s1.every((p) => p.effect.stat === 'distributedDamage')).toBe(true);
    expect([...new Set(s1.map((p) => p.start))]).toEqual(windows.slice(1).map((w) => w.start));
  });

  it('gives all allies the burst ATK up', () => {
    const burst = piecesOf(plan).filter(
      (p) => p.sourceSlotIndex === ANCHOR_SLOT && p.effect.source.skill === 'burst' && p.effect.stat === 'attack',
    );
    expect(burst.length).toBeGreaterThan(0);
    expect(new Set(burst.map((p) => p.slotIndex))).toEqual(new Set(input.slots.map((_, i) => i)));
  });
});

describeEveryShotInOneGroup(TEAMS);
