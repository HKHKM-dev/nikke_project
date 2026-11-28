// 最終攻撃力が一番低い味方（plan/design-lowest-attack.md）: リバーレリオの S1 の「最終攻撃力が一番低い基本バースト段階 III の味方 1 機に、
// スキル発動者基準でチャージ速度 12.74%▲（10 秒）」が、自分より最終攻撃力の低い III の味方に付き、III が自分だけなら自分に付いて
// S2 の無効で効かないか。編成は撮影（V-0883。C-1578）と同じ。射撃場の 3 分モード（条件は自動）で見る
import { describe, expect, it } from 'vitest';
import { planTeamRun } from '../frame/plan.ts';
import type { TeamInput } from '../team.ts';
import { fixedSlot, rawDefinition, rangeEnemyWithEvents } from './teamHelpers.ts';

const COCOA = 311;
const SOLDIER_FA = 301;
const LIBERALIO = 262;
const DIESEL_WS = 75;

type Raw = { skills: Record<string, { effects: Record<string, unknown>[] }> };

/** S1 の最終攻撃力が一番低い味方へのチャージ速度▲を外した定義 */
function withoutLowest(): unknown {
  const copy = structuredClone(rawDefinition<Raw>(LIBERALIO));
  copy.skills.skill1!.effects = copy.skills.skill1!.effects.filter((e) => e.target !== 'lowestAttack');
  return copy;
}

function team(ids: number[], controlledSlot: number, withoutEffect = false): TeamInput {
  return {
    slots: ids.map((id) => ({
      ...fixedSlot(id, { definition: withoutEffect && id === LIBERALIO ? withoutLowest() : undefined }),
      conditionMode: 'auto' as const,
    })),
    enemy: rangeEnemyWithEvents(),
    durationSeconds: 180,
    burst: true,
    controlledSlot,
  };
}

/** 枠 s の、フルバーストの始まりから 10 秒の間（inside）か、どの窓にも入らない間の、マガジンの中の発の間 */
function intervals(input: TeamInput, s: number, inside: boolean): number[] {
  const plan = planTeamRun(input);
  const log = plan.shots[s]!;
  const last = new Set(log.lastShotFrames ?? []);
  const windows = plan.schedule?.fullBurstWindows ?? [];
  const inWindow = (f: number) => windows.some((w) => w.start <= f && f < w.start + 600);
  return log.frames.slice(1).flatMap((f, i) => {
    const prev = log.frames[i]!;
    if (last.has(prev) || inWindow(prev) !== inside || inWindow(f) !== inside) return [];
    return [f - prev];
  });
}

const mode = (xs: number[]): number => {
  const counts = new Map<number, number>();
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]![0];
};

describe('リバーレリオの S1 の最終攻撃力が一番低い III の味方へのチャージ速度▲', () => {
  const ids = [COCOA, SOLDIER_FA, LIBERALIO, DIESEL_WS];

  it('targets Diesel: Winter Sweets (the lower final ATK of the two Burst III) at every Full Burst', () => {
    const plan = planTeamRun(team(ids, 3));
    const rankings = plan.history.rankings.filter((r) => r.sourceSlotIndex === 2);
    expect(rankings.length).toBeGreaterThan(3);
    for (const r of rankings) {
      expect(r.targets).toEqual([3]);
      expect(r.tied).toBe(false);
    }
  });

  it('shortens Diesel: Winter Sweets’ charge by 1.5 s × 12.74% inside the 10 s (82 f → 71 f)', () => {
    expect(mode(intervals(team(ids, 3), 3, false))).toBe(82);
    expect(mode(intervals(team(ids, 3), 3, true))).toBe(71);
    // 外せば窓の中も 82f
    expect(mode(intervals(team(ids, 3, true), 3, true))).toBe(82);
  });

  it('does not change Liberalio’s own intervals (89 f)', () => {
    expect(mode(intervals(team(ids, 3), 2, true))).toBe(89);
  });

  it('targets Liberalio herself when she is the only Burst III, and the S2 immunity cancels it (C-1242)', () => {
    const solo = [COCOA, SOLDIER_FA, LIBERALIO];
    const plan = planTeamRun(team(solo, 2));
    const rankings = plan.history.rankings.filter((r) => r.sourceSlotIndex === 2);
    expect(rankings.length).toBeGreaterThan(3);
    for (const r of rankings) expect(r.targets).toEqual([2]);
    expect(intervals(team(solo, 2), 2, true)).toEqual(intervals(team(solo, 2, true), 2, true));
  });
});
