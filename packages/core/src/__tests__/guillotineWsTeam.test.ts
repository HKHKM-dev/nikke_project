// ギロチン：ウィンタースレイヤー編（plan/design-guillotine-ws.md）: ウィンタースレイヤー（182）を含む編成で、S2 の経験値（コアでない命中
// 6 回ごと・コアの命中 3 回ごと）、S1 の勇者レベル（1 から始まり、経験値 10 スタックごとに上がる・最大 11）と勇者レベルアップの効果（弾丸チャージ・
// 水冷の味方への値 × 勇者レベルの▲の上書き）、S2 の勇者レベル 2 以上の▲、バーストの勇者レベル数分の持続ダメージが意図どおりに出るか
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { effectFrameOf } from '../burst/schedule.ts';
import { planTeamRun } from '../frame/plan.ts';
import { itemsOf } from '../skills/holders.ts';
import { counterEffectiveFrom } from '../skills/holders/types.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { describeEveryShotInOneGroup, fixedSlot, fixedTeam, rangeEnemyWithEvents } from './teamHelpers.ts';

const WS = 182;
const rangeEnemy: EnemyInput = { ...rangeEnemyWithEvents(), element: 'Fire' };

/** 撮影の編成（射撃場の敵・灼熱）。ウィンタースレイヤーは操作枠 */
function rangeTeam(ids: readonly number[], controlled: number, extra: Partial<TeamInput> = {}): TeamInput {
  const slots = ids.map((id): TeamSlotInput => fixedSlot(id, { conditionMode: 'auto' }));
  return fixedTeam(slots, controlled, { enemy: rangeEnemy, ...extra });
}

const CASES: Record<string, TeamInput> = {
  '撮影 A（ウィンタースレイヤー単騎）': rangeTeam([WS], 0, { burst: false }),
  '撮影 B（ルドミラ + デルタ + ウィンタースレイヤー）': rangeTeam([190, 20, WS], 2),
  '実戦寄り（トーブ + マスト：ロマンチックメイド + ウィンタースレイヤー + ヘルム + プリバティ）': fixedTeam(
    [192, 354, WS, 352, 170],
    2,
  ),
};

describe.each(Object.entries(CASES))('編成: %s', (_name, input) => {
  const W = input.slots.findIndex((s) => s?.character.resourceId === WS);
  const plan = planTeamRun(input);
  const levels = plan.history.counters.filter((r) => r.slotIndex === W && r.counter === 'heroLevel');
  const ups = levels.filter((r) => r.battleStart !== true);
  /** フレーム f の前のフレームの終わりの勇者レベル（条件 selfCounter・perCount と同じ見え方） */
  const levelBefore = (f: number) => levels.filter((r) => counterEffectiveFrom(r) <= f).at(-1)?.value ?? 0;
  const expStacksAt = (f: number) =>
    itemsOf(plan.history, { sourceSlotIndex: W, holder: W, kind: 'state', skill: 'skill2' })
      .filter((w) => w.start <= f && f < w.end)
      .reduce((m, w) => Math.max(m, w.stack ?? 1), 0);

  it('starts Hero Level at 1 and raises it by 1 up to 11', () => {
    expect(levels[0]).toMatchObject({ frame: 0, value: 1, battleStart: true });
    expect(ups.map((r) => r.value)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11].slice(0, ups.length));
    expect(ups.length).toBeGreaterThan(5);
  });

  it('raises Hero Level at the frame EXP passes a multiple of 10 stacks', () => {
    for (const r of ups) {
      const level = expStacksAt(r.frame);
      expect(level).toBeGreaterThanOrEqual((r.value - 1) * 10);
      expect(expStacksAt(r.frame - 1)).toBeLessThan((r.value - 1) * 10);
    }
  });

  it('refills 6 rounds of own ammo on the frame after each level up (or less with a nearly full magazine)', () => {
    const refills = plan.instants.filter((i) => i.slotIndex === W && i.effect.kind === 'ammoRefill');
    expect(refills.map((i) => i.frame)).toEqual(ups.map((r) => r.frame + 1));
    for (const i of refills) expect(i.amount).toBeLessThanOrEqual(6);
    expect(refills.some((i) => i.amount === 6)).toBe(true);
  });

  it('re-applies the S1 buffs to Water allies as value × the new Hero Level at each level up (replacing)', () => {
    const water = input.slots.flatMap((s, i) => (s?.character.element === 'Water' ? [i] : []));
    expect(water).toContain(W);
    for (const stat of ['elementDamage', 'attack'] as const) {
      const windows = itemsOf(plan.history, { sourceSlotIndex: W, kind: 'timed', skill: 'skill1', stat });
      expect([...new Set(windows.map((w) => w.holder))].sort()).toEqual(water);
      for (const holder of water) {
        const own = windows.filter((w) => w.holder === holder);
        expect(own.map((w) => w.start)).toEqual(ups.map((r) => r.frame + 1));
        own.forEach((w, k) => {
          expect(w.scale).toBe(ups[k]!.value);
          expect(w.end).toBe(own[k + 1]?.start ?? plan.frames);
        });
      }
    }
  });

  it.skipIf(input.burst === false)('ticks the burst DoT with the Hero Level at the Burst use', () => {
    const uses = (plan.schedule?.activations ?? []).filter((a) => a.slotIndex === W).map(effectFrameOf);
    const ticks = plan.skillHits.filter((h) => h.slotIndex === W && h.effect.dot !== undefined);
    expect(uses.length).toBeGreaterThan(1);
    for (const f of uses) {
      const own = ticks.filter((h) => h.frame >= f && h.frame < f + 11 * 60);
      expect(own.length).toBeGreaterThan(0);
      for (const h of own) expect(h.stacks).toBe(levelBefore(f));
    }
    // 付くのはバーストを使った 5f 後（III の 00.00 の 1f 前。C-0101 の刻みで 1.5 秒後から 1 秒ごとの計 10 tick）
    const second = ticks
      .filter((h) => h.frame >= uses[1]! && h.frame < uses[1]! + 11 * 60)
      .map((h) => h.frame - uses[1]!);
    expect(second.slice(0, 3)).toEqual([5, 93, 152]);
    expect(second).toHaveLength(10);
    // 1 回目は勇者レベルが上がっている途中、2 回目からは 11
    expect(levelBefore(uses[0]!)).toBeLessThan(11);
    expect(levelBefore(uses[1]!)).toBe(11);
  });
});

describeEveryShotInOneGroup(CASES);
