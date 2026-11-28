// E.H. 編（plan/design-eh.md）: E.H.（113）を含む編成で、廃品と自家製弾倉の増減（戦闘開始時の廃品 10 個 → 次のフレームに弾倉 1 本）、
// 弾倉 1 本の間の S1 の攻撃力▲、戦闘開始時の S2 の有利コードの攻撃ダメージ▲（15 秒）、バーストの使用武器変更（1 発で戻る）と攻撃力▲が
// 意図どおりに出るか。射撃場の 3 分モード（条件は自動）で見る
import { describe, expect, it } from 'vitest';
import { planTeamRun } from '../frame/plan.ts';
import { effectFrameOf } from '../burst/schedule.ts';
import { itemsOf } from '../skills/holders.ts';
import { gameSecondsToFrames } from '../time.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { fixedSlot, fixedTeam, rangeEnemyWithEvents } from './teamHelpers.ts';

const EH = 113;
const ironEnemy = rangeEnemyWithEvents({ element: 'Iron' });

function rangeTeam(ids: readonly number[], controlledSlot: number): TeamInput {
  const slots = ids.map((id): TeamSlotInput => fixedSlot(id, { conditionMode: 'auto' }));
  return fixedTeam(slots, controlledSlot, { enemy: ironEnemy });
}

type Case = { input: TeamInput; eh: number };
const CASES: Record<string, Case> = {
  '撮影 A（ココア + ソルジャーF.A. + E.H.）': { input: rangeTeam([311, 301, EH], 2), eh: 2 },
  '実戦寄り（リター + クラウン + E.H. + 紅蓮 + ソルジャーF.A.）': {
    input: rangeTeam([82, 330, EH, 222, 301], 2),
    eh: 2,
  },
};

describe.each(Object.entries(CASES))('編成: %s', (_name, { input, eh: E }) => {
  const plan = planTeamRun(input);
  const countersOf = (counter: string) =>
    plan.history.counters.filter((r) => r.slotIndex === E && r.counter === counter).map((r) => [r.frame, r.value]);
  const windows = (filter: Parameters<typeof itemsOf>[1]) => itemsOf(plan.history, { sourceSlotIndex: E, ...filter });
  const shots = plan.shots[E]!.frames;
  const lastShot = shots.at(-1)!;

  it('collects 10 Scraps at the start of battle and turns them into one homemade magazine on the next frame', () => {
    expect(countersOf('scrap')).toEqual([
      [0, 10],
      [1, 0],
    ]);
    expect(countersOf('homemadeMagazine')).toEqual([[1, 1]]);
  });

  it('keeps the one-magazine ATK buff from the frame after the magazine is crafted', () => {
    const buff = windows({ holder: E, kind: 'while', skill: 'skill1', stat: 'attack' });
    expect(buff).toHaveLength(1);
    expect(buff[0]!.start).toBe(2);
    expect(buff[0]!.end).toBeGreaterThan(lastShot);
  });

  it('applies the Elemental Advantage Attack Damage buff for 15 s from the start of battle', () => {
    const buff = windows({ holder: E, kind: 'timed', skill: 'skill2', stat: 'elementDamage' });
    expect(buff.map((w) => [w.start, w.end])).toEqual([[0, gameSecondsToFrames(15)]]);
  });

  it('fires exactly one changed-weapon shot per Burst and returns to the SMG', () => {
    const uses = plan.schedule!.activations.filter((a) => a.slotIndex === E).map(effectFrameOf);
    const weapon = windows({ holder: E, kind: 'timed', skill: 'burst', stat: 'weapon' });
    expect(uses.length).toBeGreaterThan(0);
    expect(weapon).toHaveLength(uses.length);
    expect(weapon.filter((w) => w.end <= lastShot).length).toBeGreaterThan(0);
    for (const w of weapon) {
      // 戦闘の終わりの直前の回は、撃つ前に戦闘が終わる
      if (w.end > lastShot) continue;
      expect(shots.filter((f) => f >= w.start && f < w.end)).toHaveLength(1);
      // 撃ち切った後も SMG で撃ち続ける
      expect(shots.some((f) => f > w.end)).toBe(true);
    }
  });

  it('buffs ATK for 10 s at every Burst use', () => {
    const uses = plan.schedule!.activations.filter((a) => a.slotIndex === E).map(effectFrameOf);
    const buff = windows({ holder: E, kind: 'timed', skill: 'burst', stat: 'attack' });
    expect(buff.map((w) => w.start)).toEqual(uses);
    // 戦闘の終わりで切れる回のほかは 10 秒
    for (const w of buff) if (w.end <= lastShot) expect(w.end - w.start).toBe(gameSecondsToFrames(10));
  });
});
