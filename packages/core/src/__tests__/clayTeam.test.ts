// クレイ編（V-0893）: クレイ（551）を含む編成で、S1 のヴィクトリークライ（通常攻撃を戦闘の始めから数え、60 の倍数の発がフルバーストの中の
// ときだけ味方全体に 1 スタック。C-1602）、S2 のヴィクトリークライの間だけの味方全体への攻撃力▲（C-1603）、バーストの味方全体への
// 防御力無視ダメージ▲と自分の防御無視（C-1604）が意図どおりに出るか。射撃場の 3 分モード（条件は自動）で見る
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { effectFrameOf } from '../burst/schedule.ts';
import { planTeamRun } from '../frame/plan.ts';
import { itemsOf } from '../skills/holders.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { fixedSlot, fixedTeam, rangeEnemyWithEvents } from './teamHelpers.ts';

const CLAY = 551;
const rangeEnemy: EnemyInput = rangeEnemyWithEvents();

const autoSlot = (id: number): TeamSlotInput => fixedSlot(id, { conditionMode: 'auto' });

const TEAMS: Record<string, TeamInput> = {
  'ココア + ジル + クレイ（録画 1432 の編成）': fixedTeam([311, 841, CLAY].map(autoSlot), 2, { enemy: rangeEnemy }),
  // リター（I）・アリス（III）・ドレイク（III）
  '実戦寄り（リター + クレイ + ジル + アリス + ドレイク）': fixedTeam([82, CLAY, 841, 191, 101], 1),
};

/** 区間の和集合（[start, end) の重なり・接するものをつなぐ） */
function union(ranges: { start: number; end: number }[]): [number, number][] {
  const out: [number, number][] = [];
  for (const r of [...ranges].sort((a, b) => a.start - b.start)) {
    const last = out.at(-1);
    if (last !== undefined && r.start <= last[1]) last[1] = Math.max(last[1], r.end);
    else out.push([r.start, r.end]);
  }
  return out;
}

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const c = input.slots.findIndex((x) => x?.character.resourceId === CLAY);
  const allies = input.slots.flatMap((x, i) => (x === null || x === undefined ? [] : [i]));
  const plan = planTeamRun(input);
  const windows = plan.schedule!.fullBurstWindows;
  const inFullBurst = (f: number) => windows.some((w) => w.start <= f && f < w.end);
  const shots = plan.shots[c]!.frames;
  const cry = itemsOf(plan.history, { sourceSlotIndex: c, kind: 'state', state: 'victoriousBattleCry' });

  it('stacks Victorious Battle Cry on every ally on the frame after each 60th shot counted from the battle start, only inside Full Burst (C-1602)', () => {
    // 戦闘の始めから数えた 60 の倍数の発のうち、フルバーストの窓の中の発（付くのはその次のフレーム）
    const expected = shots
      .filter((f, k) => (k + 1) % 60 === 0 && inFullBurst(f) && f + 1 < plan.frames)
      .map((f) => f + 1);
    expect(expected.length).toBeGreaterThan(5);
    // 窓の外の 60 の倍数の発では付かない
    expect(shots.some((f, k) => (k + 1) % 60 === 0 && !inFullBurst(f))).toBe(true);
    expect(new Set(cry.map((w) => w.holder))).toEqual(new Set(allies));
    for (const h of allies) {
      const mine = cry.filter((w) => w.holder === h);
      // スタックが足された件の始まりは、どれもその発の次のフレーム（3 スタックの後の付き直しは、件を足さずに維持を延ばす）
      const starts = [...new Set(mine.map((w) => w.start))];
      expect(starts.every((f) => expected.includes(f))).toBe(true);
      // 付くたびに全スタックの維持を数え直すので、塊の終わりは、その塊で最後に付いたフレームから同じ長さ（6 秒）
      const blocks = union(mine).filter(([, e]) => e < plan.frames);
      expect(blocks.length).toBeGreaterThan(2);
      const lengths = blocks.map(([s, e]) => {
        const last = expected.filter((g) => s <= g && g < e).at(-1);
        expect(last).toBeDefined();
        return e - last!;
      });
      expect(new Set(lengths).size).toBe(1);
      for (const g of expected) expect(mine.some((w) => w.start <= g && g < w.end)).toBe(true);
    }
  });

  it('gives every ally the S2 attack increase exactly while Clay has Victorious Battle Cry (C-1603)', () => {
    const own = union(cry.filter((w) => w.holder === c));
    expect(own.length).toBeGreaterThan(2);
    for (const h of allies) {
      const attack = itemsOf(plan.history, { sourceSlotIndex: c, holder: h, skill: 'skill2', stat: 'attack' });
      expect(union(attack)).toEqual(own.map(([s, e]) => [s, Math.min(e, plan.frames)]));
    }
  });

  it('gives every ally true damage up at each Burst and makes only Clay normal attacks true damage (C-1604)', () => {
    const uses = plan
      .schedule!.activations.filter((a) => a.slotIndex === c)
      .map(effectFrameOf)
      .filter((f) => f < plan.frames);
    expect(uses.length).toBeGreaterThan(2);
    const up = itemsOf(plan.history, { sourceSlotIndex: c, kind: 'timed', skill: 'burst', stat: 'trueDamage' });
    expect(new Set(up.map((w) => w.holder))).toEqual(new Set(allies));
    const conversion = itemsOf(plan.history, {
      sourceSlotIndex: c,
      kind: 'timed',
      skill: 'burst',
      stat: 'trueDamageConversion',
    });
    expect(new Set(conversion.map((w) => w.holder))).toEqual(new Set([c]));
    expect(conversion.map((w) => w.start)).toEqual(uses);
  });
});
