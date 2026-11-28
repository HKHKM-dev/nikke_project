// マクスウェル（102）のバーストの変更後の 1 発（plan/design-maxwell-swap.md）: 持ち替えは変更の始まり（窓の始まりの 5f 前。録画では
// III のタイマーの 00.00 の 4〜5f 前）で、基礎の SR が構え解除の途中なら構え解除の終わりから、構えたままでも持ち替えから 119f（C-1598）。
// 窓の始まりからは、構え解除の明けた持ち替えなら 114f（動画では入りの止まり 22f を足して 136f。C-1433）、最後の発が窓の始まりの d f 前
// （d < 18）なら 114 + (18 − d) f（動画では 149 − d + 5。1300-22・1301-22・1428-08 の構え解除の途中の回と同じ形）
import { describe, expect, it } from 'vitest';
import { planTeamRun } from '../frame/plan.ts';
import type { TeamInput } from '../team.ts';
import { fixedSlot, fixedTeam, rangeEnemyWithEvents } from './teamHelpers.ts';

const MAXWELL = 102;

function rangeTeam(ids: readonly number[], controlled: number): TeamInput {
  return fixedTeam(
    ids.map((id) => fixedSlot(id, { conditionMode: 'auto' })),
    controlled,
    { enemy: rangeEnemyWithEvents() },
  );
}

const TEAMS: Record<string, TeamInput> = {
  // 撮影の編成（V-0824・V-0888）。モデルの 2 回目は、最後の発が窓の始まりの 6f 前（構え解除の途中）
  '撮影の編成（ココア + ソルジャーF.A. + マクスウェル + レイヴン）': rangeTeam([311, 301, MAXWELL, 851], 2),
  'リター + デルタ + マクスウェル': rangeTeam([82, 20, MAXWELL], 0),
};

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const d = input.slots.findIndex((s) => s?.character.resourceId === MAXWELL);
  const plan = planTeamRun(input);
  const log = plan.shots[d]!;
  const changed = log.weaponChangeShotFrames ?? [];
  const rounds = plan
    .schedule!.fullBurstWindows.map((w) => {
      const first = changed.find((f) => f >= w.start && f < w.end);
      if (first === undefined) return null;
      const last = log.frames.filter((f) => f < w.start && !changed.includes(f)).at(-1)!;
      return { sinceLast: w.start - last, first: first - w.start };
    })
    .filter((r) => r !== null);

  it('counts the first changed shot from the end of the base SR aim-out, or from the swap even when aimed', () => {
    expect(rounds.length).toBeGreaterThanOrEqual(3);
    expect(rounds.some((r) => r.sinceLast < 18)).toBe(true);
    expect(rounds.some((r) => r.sinceLast >= 18)).toBe(true);
    for (const r of rounds) expect(r.first).toBe(114 + Math.max(0, 18 - r.sinceLast));
  });
});
