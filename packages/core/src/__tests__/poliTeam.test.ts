// ポリ（30）を含む編成（V-0770）: S1 は 5 発ごとに味方全体へ攻撃力▲（10 秒・付くたびに付け直し）、バーストは使用時に味方全体へ
// 攻撃力▲（10 秒）。基礎版と宝物版（段階 3）で、与ダメージに効く効果は同じ。ほかの行（防御力▲・均等分配・バリア・不屈・持続回復）は notes
import { describe, expect, it } from 'vitest';
import { planTeamRun } from '../frame/plan.ts';
import type { TreasurePhase } from '../skills/treasure.ts';
import type { TeamInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import { describeEveryShotInOneGroup, effectWindows, fixedTeam, skillValueOf } from './teamHelpers.ts';

const POLI = 30;
const LITER = 82;

function team(ids: number[], controlled: number, poli: number, phase: TreasurePhase): TeamInput {
  const input = fixedTeam(ids, controlled);
  input.slots[poli]!.skills!.treasurePhase = phase;
  return input;
}

const TEAMS = {
  'リター + ポリ（宝物の段階 3）': team([LITER, POLI], 1, 1, 3),
  'リター + ポリ（基礎版）': team([LITER, POLI], 1, 1, 0),
};

describe.each(Object.entries(TEAMS))('%s', (_name, input) => {
  const p = 1;
  const plan = planTeamRun(input);
  const shots = plan.shots[p]!.frames;

  it('gives the S1 attack up to all allies from the frame after her 5th shot, one 10 s window refreshed every 5 shots', () => {
    const every = skillValueOf(POLI, 'skill1', 1);
    const duration = gameSecondsToFrames(skillValueOf(POLI, 'skill1', 3));
    const fires = shots.filter((_, k) => (k + 1) % every === 0).map((f) => f + 1);
    const own = effectWindows(plan, p, { resourceId: POLI, skill: 'skill1', stat: 'attack' });
    expect(own.length).toBeGreaterThan(0);
    expect(own[0]!.start).toBe(fires[0]);
    // 付け直しで窓はまとまり、どの窓も最後の付与から 10 秒で切れる（撃ち続けるあいだは切れない）
    for (const w of own) {
      const last = fires.filter((f) => f < w.end).at(-1)!;
      expect(Math.min(last + duration, plan.frames)).toBe(w.end);
    }
    input.slots.forEach((_, i) =>
      expect(effectWindows(plan, i, { resourceId: POLI, skill: 'skill1', stat: 'attack' })).toEqual(own),
    );
  });

  it('gives the burst attack up to all allies for 10 s from each of her bursts', () => {
    const bursts = plan.schedule!.activations.filter((a) => a.slotIndex === p);
    const duration = gameSecondsToFrames(skillValueOf(POLI, 'burst', 4));
    expect(bursts.length).toBeGreaterThan(1);
    input.slots.forEach((_, i) => {
      const windows = effectWindows(plan, i, { resourceId: POLI, skill: 'burst', stat: 'attack' });
      expect(windows.length).toBe(bursts.length);
      windows.forEach((w) => expect(w.end - w.start).toBe(duration));
    });
  });
});

describeEveryShotInOneGroup(TEAMS);
