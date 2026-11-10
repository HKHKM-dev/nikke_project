// ブリッド：サイレントトラック（73。V-0711）を含む編成で、S1（フルバーストの始まりの受けるダメージ▲と倍率ダメージ）・S2（10 回攻撃
// ごとの受けるダメージ▲・5 回攻撃ごとの倍率ダメージ）・バースト（自分を除く味方の攻撃力▲）が意図どおりに出るか。受けるダメージ▲は
// 風圧の敵のときだけ付く
import { describe, expect, it } from 'vitest';
import { planTeamRun } from '../frame/plan.ts';
import { runSimulation } from '../sim/engine.ts';
import { itemsOf } from '../skills/holders.ts';
import type { SkillSlot } from '../types.ts';
import type { TeamInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import { describeEveryShotInOneGroup, fixedTeam, SHOOTING_RANGE_ENEMY } from './teamHelpers.ts';

const BRID = 73;
const LITER = 82;
const SUN = 308;

const wind = { ...SHOOTING_RANGE_ENEMY, element: 'Wind' as const };
const fire = { ...SHOOTING_RANGE_ENEMY, element: 'Fire' as const };

const TEAMS: Record<string, { input: TeamInput; brid: number; windEnemy: boolean }> = {
  '撮影 A（単騎・風圧）': { input: fixedTeam([BRID], 0, { enemy: wind, burst: false }), brid: 0, windEnemy: true },
  '撮影 A（単騎・灼熱）': { input: fixedTeam([BRID], 0, { enemy: fire, burst: false }), brid: 0, windEnemy: false },
  '撮影 B（リター・I-DOLL・サン・ブリッド：サイレントトラック。風圧）': {
    input: fixedTeam([LITER, SUN, BRID], 2, { enemy: wind }),
    brid: 2,
    windEnemy: true,
  },
  '撮影 B の編成で灼熱': { input: fixedTeam([LITER, SUN, BRID], 2, { enemy: fire }), brid: 2, windEnemy: false },
};

describe.each(Object.entries(TEAMS))('編成: %s', (_name, { input, brid, windEnemy }) => {
  const plan = planTeamRun(input);
  const sim = runSimulation(input);
  const windows = plan.schedule?.fullBurstWindows ?? [];
  const shots = plan.shots[brid]!.frames;
  const hits = (skill: string) =>
    plan.skillHits.filter((h) => h.slotIndex === brid && h.effect.source.skill === skill).map((h) => h.frame);
  const damageTaken = (skill: SkillSlot) =>
    itemsOf(plan.history, { sourceSlotIndex: brid, kind: 'timed', skill, stat: 'damageTaken' });

  it('hits with S2 6 frames after every 5th normal attack, with the Damage Taken up from the 2nd hit only against a Wind enemy', () => {
    const fifth = shots.filter((_, i) => (i + 1) % 5 === 0);
    expect(hits('skill2')).toEqual(fifth.map((f) => f + 6).filter((f) => f < plan.frames));
    // 10 発目のきっかけのヒットは 6f 後なので、同じ発で付いた受けるダメージ▲が乗る（C-1039）
    const taken = sim.skillHits
      .filter((h) => h.slotIndex === brid && h.effect.source.skill === 'skill2')
      .map((h) => h.hit.damageTakenMultiplier);
    expect(taken[0]).toBe(1);
    expect(taken[1]! > 1).toBe(windEnemy);
  });

  it('gives the S2 Damage Taken up on every 10th normal attack only against a Wind enemy', () => {
    const tenth = shots.filter((_, i) => (i + 1) % 10 === 0);
    const items = damageTaken('skill2');
    if (!windEnemy) expect(items).toEqual([]);
    else {
      // 10 秒のうちに次の 10 回目が来るので、付け直して 1 つの窓につながる。きっかけの発の次のフレームから、最後の付け直しの 10 秒後まで
      expect(items.map((i) => [i.start, i.end])).toEqual([
        [tenth[0]! + 1, Math.min(tenth.at(-1)! + 1 + gameSecondsToFrames(10), plan.frames)],
      ]);
    }
  });

  it('hits with S1 at every Full Burst start, with Damage Taken up only against a Wind enemy', () => {
    expect(hits('skill1')).toEqual(windows.map((w) => w.start));
    const starts = [...new Set(damageTaken('skill1').map((i) => i.start))];
    expect(starts.length).toBe(windEnemy ? windows.length : 0);
  });

  it('gives the Burst ATK up to the allies but not to herself', () => {
    const items = itemsOf(plan.history, { sourceSlotIndex: brid, kind: 'timed', skill: 'burst', stat: 'attack' });
    const holders = new Set(items.map((i) => i.holder));
    expect(holders.has(brid)).toBe(false);
    expect(holders).toEqual(new Set(input.slots.map((_, i) => i).filter((i) => i !== brid)));
  });
});

describeEveryShotInOneGroup(Object.fromEntries(Object.entries(TEAMS).map(([name, t]) => [name, t.input])));
