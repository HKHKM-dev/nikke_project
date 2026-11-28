// クラスト（521）を含む編成（plan/design-crust.md）。語彙は skills/__tests__/crust.test.ts。ここでは射撃場 3 分モード（敵のジャンプあり）で:
// 敵のジャンプの始まりの部分チャージの発の 3 回目の次のフレームに、味方全体にメイラードが付き、フルチャージの発の延長で戦闘の終わりまで続く。
// メイラードの後のフルバースト発動時だけ、メイラードの味方に攻撃力▲が付き、バーストの分配ダメージ▲もメイラードの時だけ付く。
// ジャンプの無い敵では部分チャージの発が無く、メイラードは付かない。射撃の列のグループ分け。
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { planTeamRun } from '../frame/plan.ts';
import { itemsOf } from '../skills/holders.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { describeEveryShotInOneGroup, fixedSlot, fixedTeam, rangeEnemyWithEvents } from './teamHelpers.ts';

const CRUST = 521;
const I_DOLL_FLOWER = 304;
const GUILLOTINE = 180;
const BREADY = 520;
const SCARLET = 222;
const rangeEnemy: EnemyInput = rangeEnemyWithEvents();

const autoSlot = (id: number): TeamSlotInput => fixedSlot(id, { conditionMode: 'auto' });
const team = (ids: number[], controlledSlot: number): TeamInput =>
  fixedTeam(ids.map(autoSlot), controlledSlot, { enemy: rangeEnemy });

const TEAMS: Record<string, TeamInput> = {
  'クラスト単騎（撮影 A）': team([CRUST], 0),
  'I-DOLL・フラワー + ギロチン + クラスト（操作。撮影 B）': team([I_DOLL_FLOWER, GUILLOTINE, CRUST], 2),
  '実戦寄り（I-DOLL・フラワー + クラスト（操作）+ ブレッディ + 紅蓮）': team(
    [I_DOLL_FLOWER, CRUST, BREADY, SCARLET],
    1,
  ),
};

const inAny = (items: readonly { start: number; end: number }[], f: number) =>
  items.some((w) => w.start <= f && f < w.end);

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const c = input.slots.findIndex((s) => s?.character.resourceId === CRUST);
  const plan = planTeamRun(input);
  const frames = Math.round(input.durationSeconds / 0.017);
  const partial = (plan.shots[c]!.partialShots ?? []).filter((p) => p.progress < 1).map((p) => p.frame);
  const members = input.slots.flatMap((s, i) => (s === null ? [] : [i]));
  const maillardOf = (holder: number) => itemsOf(plan.history, { holder, state: 'maillard' });

  it('applies Maillard to all allies the frame after every 3rd partial charge shot', () => {
    expect(partial.length).toBeGreaterThanOrEqual(3);
    for (const holder of members) {
      const maillard = maillardOf(holder);
      expect(maillard[0]!.start).toBe(partial[2]! + 1);
      expect(inAny(maillard, partial[2]!)).toBe(false);
    }
  });

  // スキル Lv10 では、フルチャージの発（約 82f ごと）のたびに 2.5 秒延びるので、付いた後は切れない
  it('keeps Maillard to the end of the battle by extending it on full charge shots', () => {
    for (const holder of members) {
      const maillard = maillardOf(holder);
      expect(Math.max(...maillard.map((w) => w.end))).toBeGreaterThanOrEqual(frames - 1);
      const start = maillard[0]!.start;
      for (let f = start; f < frames - 1; f += 30) expect(inAny(maillard, f)).toBe(true);
    }
  });

  it('gives the Full Burst ATK up only at Full Bursts in Maillard, and Distributed Damage only on bursts in Maillard', () => {
    const maillard = maillardOf(c);
    const fullBurstUps = itemsOf(plan.history, { sourceSlotIndex: c, kind: 'timed', skill: 'skill2', holder: c });
    const fullBurstStarts = plan.schedule?.fullBurstWindows.map((w) => w.start) ?? [];
    expect(fullBurstUps.map((u) => u.start)).toEqual(fullBurstStarts.filter((f) => inAny(maillard, f)));
    const distributed = itemsOf(plan.history, { sourceSlotIndex: c, holder: c, stat: 'distributedDamage' });
    const attackDamage = itemsOf(plan.history, { sourceSlotIndex: c, holder: c, stat: 'attackDamage' });
    expect(distributed.map((d) => d.start)).toEqual(attackDamage.map((a) => a.start).filter((f) => inAny(maillard, f)));
    // 撮影 B の編成では、メイラードの前のフルバーストが 3 回、後が 1 回ある（ジャンプの時刻は録画で揺れる）
    if (input.slots.length === 3) {
      expect(fullBurstUps).toHaveLength(1);
      expect(fullBurstStarts.length - fullBurstUps.length).toBe(3);
    }
  });
});

describe('ジャンプの無い敵', () => {
  const plan = planTeamRun(fixedTeam([I_DOLL_FLOWER, GUILLOTINE, CRUST].map(autoSlot), 2));
  it('has no partial charge shot and never applies Maillard', () => {
    expect(plan.shots[2]!.partialShots ?? []).toEqual([]);
    expect(itemsOf(plan.history, { state: 'maillard' })).toEqual([]);
    expect(itemsOf(plan.history, { sourceSlotIndex: 2, stat: 'attackDamage' }).length).toBeGreaterThan(0);
  });
});

describeEveryShotInOneGroup(TEAMS);
