// ボリューム（431。V-0757）を含む編成で、S2 のフルバーストの開始回数別の CT▼（下位効果のスタック適用）と、自分のバースト使用回数別の
// 味方全体のクリティカルダメージ▲（下位効果のスタック適用・5 秒）、バーストの味方全体のクリティカル確率▲（5 秒）が意図どおりに出るか
import { describe, expect, it } from 'vitest';
import { runSimulation } from '../sim/engine.ts';
import { activeItemsAt } from '../skills/holders.ts';
import type { TeamInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import {
  describeEveryShotInOneGroup,
  effectWindows,
  fixedTeam,
  fullBurstCooldownCuts,
  windowsFrom,
} from './teamHelpers.ts';

const VOLUME = 431;
const WINDOW = gameSecondsToFrames(5);

const TEAMS: Record<string, TeamInput> = {
  '撮影 A の編成（ボリューム単騎・オートバースト ON）': fixedTeam([VOLUME], 0),
  '撮影 B の編成（ボリューム + デルタ + I-DOLL・サン）': fixedTeam([VOLUME, 20, 308], 2),
  '実戦寄り（ボリューム + リター + クラウン + アリス + ドレイク）': fixedTeam([VOLUME, 82, 330, 191, 101], 3),
};

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const volume = input.slots.findIndex((s) => s?.character.resourceId === VOLUME);
  const sim = runSimulation(input);
  const schedule = sim.schedule!;
  const uses = schedule.activations.filter((a) => a.slotIndex === volume).map((a) => a.frame);
  const allies = input.slots.map((_, i) => i);
  const critDamageUpsAt = (holder: number, frame: number) =>
    activeItemsAt(sim.history, holder, frame, { sourceSlotIndex: volume, skill: 'skill2', stat: 'critDamage' }).length;

  it('uses her Burst more than three times', () => {
    expect(uses.length).toBeGreaterThan(3);
  });

  it('gives every ally the crit damage ups of the 1st to k-th use (up to 3) for 5 s from each use', () => {
    uses.forEach((frame, k) => {
      const ups = Math.min(k + 1, 3);
      for (const holder of allies) {
        expect(critDamageUpsAt(holder, frame)).toBe(ups);
        expect(critDamageUpsAt(holder, frame + WINDOW - 1)).toBe(ups);
        expect(critDamageUpsAt(holder, frame + WINDOW)).toBe(0);
      }
    });
  });

  it('gives every ally the Burst crit rate up for 5 s from each use', () => {
    for (const holder of allies)
      expect(effectWindows(sim, holder, { resourceId: VOLUME, skill: 'burst', stat: 'critRate' })).toEqual(
        windowsFrom(uses, 5, sim.frames),
      );
  });

  it('cuts the running Burst Skill cooldowns at each Full Burst by 2.34 s, then 5.04 s, then 8.21 s', () => {
    if (input.slots.length === 1) {
      // 単騎はフルバーストに入らないので起きない
      expect(schedule.fullBurstWindows).toEqual([]);
      expect(schedule.cooldownReductions.filter((r) => r.sourceSlotIndex === volume)).toEqual([]);
      return;
    }
    expect(schedule.fullBurstWindows.length).toBeGreaterThan(2);
    // 秒をフレームに切り捨てて効果ごとに引く（137・158・186f の和。リターの S1 と同じ。C-0460）
    const expected = [137, 295, 481];
    expect(fullBurstCooldownCuts(schedule, volume)).toEqual(
      schedule.fullBurstWindows.map((_, n) => expected[Math.min(n, 2)]),
    );
  });
});

describeEveryShotInOneGroup(TEAMS);
