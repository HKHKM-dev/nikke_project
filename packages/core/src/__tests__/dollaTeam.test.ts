// ドラー（202。V-0771）を含む編成で、S2 のフルバーストの開始回数別の CT▼（下位効果のスタック適用）と、自分のバースト使用回数別の
// 味方全体の攻撃力▲・クリティカル確率▲・クリティカルダメージ▲（下位効果のスタック適用・5 秒）、バーストのバーストスキルダメージが
// 意図どおりに出るか
import { describe, expect, it } from 'vitest';
import { runSimulation } from '../sim/engine.ts';
import { activeItemsAt } from '../skills/holders.ts';
import type { TeamInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import { describeEveryShotInOneGroup, fixedTeam, fullBurstCooldownCuts } from './teamHelpers.ts';

const DOLLA = 202;
const WINDOW = gameSecondsToFrames(5);
// 使用回数の段（1 回・2 回・3 回）ごとの stat
const STATS_BY_USE = ['attack', 'critRate', 'critDamage'] as const;

const TEAMS: Record<string, TeamInput> = {
  '撮影 B の編成（ココア + ドラー + I-DOLL・サン）': fixedTeam([311, DOLLA, 308], 2),
  '実戦寄り（リター + ドラー + クラウン + アリス + ドレイク）': fixedTeam([82, DOLLA, 330, 191, 101], 3),
};

describe('編成: 撮影 A の編成（ドラー単騎）', () => {
  const sim = runSimulation(fixedTeam([DOLLA], 0));

  it('never uses her Burst (a lone Burst II), so neither S2 nor the Burst fires', () => {
    expect(sim.schedule!.activations).toEqual([]);
    expect(sim.slots[0]!.burst.hits).toEqual([]);
    expect(activeItemsAt(sim.history, 0, 3000, { sourceSlotIndex: 0, skill: 'skill2' })).toEqual([]);
  });
});

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const dolla = input.slots.findIndex((s) => s?.character.resourceId === DOLLA);
  const sim = runSimulation(input);
  const schedule = sim.schedule!;
  const uses = schedule.activations.filter((a) => a.slotIndex === dolla).map((a) => a.frame);
  const allies = input.slots.map((_, i) => i);
  const upsAt = (holder: number, frame: number, stat: string) =>
    activeItemsAt(sim.history, holder, frame, { sourceSlotIndex: dolla, skill: 'skill2', stat }).length;

  it('uses her Burst more than three times, each with one Burst Skill damage hit', () => {
    expect(uses.length).toBeGreaterThan(3);
    expect(sim.slots[dolla]!.burst.hits).toHaveLength(uses.length);
  });

  it('gives every ally the ATK, crit rate and crit damage ups of the 1st to k-th use (up to 3) for 5 s from each use', () => {
    uses.forEach((frame, k) => {
      STATS_BY_USE.forEach((stat, step) => {
        const ups = k >= step ? 1 : 0;
        for (const holder of allies) {
          expect(upsAt(holder, frame, stat)).toBe(ups);
          expect(upsAt(holder, frame + WINDOW - 1, stat)).toBe(ups);
          expect(upsAt(holder, frame + WINDOW, stat)).toBe(0);
        }
      });
    });
  });

  it('cuts the running Burst Skill cooldowns at each Full Burst by 1.82 s, then 4.02 s, then 6.62 s', () => {
    expect(schedule.fullBurstWindows.length).toBeGreaterThan(2);
    // 秒をフレームに切り捨てて効果ごとに引く（107・129・152f の和。ボリュームの S2 と同じ。C-1171）
    const expected = [107, 236, 388];
    expect(fullBurstCooldownCuts(schedule, dolla)).toEqual(
      schedule.fullBurstWindows.map((_, n) => expected[Math.min(n, 2)]),
    );
  });
});

describeEveryShotInOneGroup(TEAMS);
