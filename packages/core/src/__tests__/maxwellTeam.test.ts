// マクスウェル編（V-0824）: マクスウェル（102）を含む編成で、S1 のフルバースト開始時の最終攻撃力の上位 2 機へのチャージ速度▲・攻撃力▲
// （10 秒）と、バーストの使用武器の変更（チャージ 2 秒・フルチャージ 300% の 1 発で撃ち切り、基礎の SR に戻る）が意図どおりに出るか
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { planTeamRun } from '../frame/plan.ts';
import { itemsOf } from '../skills/holders.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import { describeEveryShotInOneGroup, fixedSlot, fixedTeam, rangeEnemyWithEvents } from './teamHelpers.ts';

const MAXWELL = 102;
const COCOA = 311;
const SOLDIER_FA = 301;
const RAVEN = 851;
const rangeEnemy: EnemyInput = rangeEnemyWithEvents({ defence: 100 });
const autoSlot = (id: number): TeamSlotInput => fixedSlot(id, { conditionMode: 'auto' });

/** 編成・マクスウェルの枠・S1 の対象の枠（どの回も同じ 2 機） */
const CASES: Record<string, { input: TeamInput; maxwell: number; targets: number[] }> = {
  '撮影の編成（ココア + ソルジャーF.A. + マクスウェル（操作）+ レイヴン。V-0824）': {
    input: fixedTeam([COCOA, SOLDIER_FA, MAXWELL, RAVEN].map(autoSlot), 2, { enemy: rangeEnemy }),
    maxwell: 2,
    // レイヴンは自分の S1 のフルバースト開始時の攻撃力▲で 1 位、マクスウェル（火力型）が 2 位、ココア（支援型）は 3 位
    targets: [2, 3],
  },
};
const TEAMS = Object.fromEntries(Object.entries(CASES).map(([name, c]) => [name, c.input]));

describe.each(Object.entries(CASES))('編成: %s', (_name, { input, maxwell, targets }) => {
  const plan = planTeamRun(input);
  const shots = plan.shots[maxwell]!.frames;
  const fullBursts = plan.schedule!.fullBurstWindows;

  it('gives Charge Speed and ATK up to the top 2 allies by final ATK at every Full Burst start, for 10 s', () => {
    expect(fullBursts.length).toBeGreaterThan(5);
    for (const stat of ['chargeSpeed', 'attack'] as const) {
      for (const holder of input.slots.keys()) {
        const items = itemsOf(plan.history, { sourceSlotIndex: maxwell, holder, kind: 'timed', skill: 'skill1', stat });
        if (!targets.includes(holder)) {
          expect(items).toEqual([]);
          continue;
        }
        expect(items.map((w) => w.start)).toEqual(fullBursts.map((w) => w.start));
        for (const w of items) expect(w.end - w.start).toBe(gameSecondsToFrames(10));
      }
    }
  });

  it('fires exactly one fully charged changed-weapon shot per own Burst and returns to the SR', () => {
    const weapon = itemsOf(plan.history, {
      sourceSlotIndex: maxwell,
      holder: maxwell,
      kind: 'timed',
      skill: 'burst',
      stat: 'weapon',
    });
    const own = plan.schedule!.activations.filter((a) => a.slotIndex === maxwell);
    expect(weapon.length).toBe(own.length);
    expect(weapon.length).toBeGreaterThanOrEqual(3);
    const partial = new Set((plan.shots[maxwell]!.partialShots ?? []).map((p) => p.frame));
    weapon.forEach((w, n) => {
      const changed = shots.filter((f) => f >= w.start && f < w.end);
      expect(changed).toHaveLength(1);
      expect(partial.has(changed[0]!)).toBe(false);
      // 撃ち切りの後、次の変更の窓（無ければ戦闘の終わり）までに基礎の SR が撃つ
      const next = weapon[n + 1]?.start ?? plan.frames;
      expect(shots.some((f) => f >= w.end && f < next)).toBe(true);
    });
  });
});

describeEveryShotInOneGroup(TEAMS);
