// ボリューム（431。V-0757）を含む編成で、S2 のフルバーストの開始回数別の CT▼（下位効果のスタック適用）と、自分のバースト使用回数別の
// 味方全体のクリティカルダメージ▲（下位効果のスタック適用・5 秒）、バーストの味方全体のクリティカル確率▲（5 秒）が意図どおりに出るか
import { describe, expect, it } from 'vitest';
import { runSimulation } from '../sim/engine.ts';
import { activeItemsAt } from '../skills/holders.ts';
import type { TeamInput } from '../team.ts';
import { describeEveryShotInOneGroup, fixedTeam } from './teamHelpers.ts';

const VOLUME = 431;
/** 5 秒（ゲーム内の時計） */
const WINDOW = 294;

const TEAMS: Record<string, TeamInput> = {
  '撮影 A の編成（ボリューム単騎・オートバースト ON）': fixedTeam([VOLUME], 0),
  '撮影 B の編成（ボリューム + デルタ + I-DOLL・サン）': fixedTeam([VOLUME, 20, 308], 2),
  '実戦寄り（ボリューム + リター + クラウン + アリス + ドレイク）': fixedTeam([VOLUME, 82, 330, 191, 101], 3),
};

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const volume = input.slots.findIndex((s) => s?.character.resourceId === VOLUME);
  const sim = runSimulation(input);
  const uses = sim.schedule!.activations.filter((a) => a.slotIndex === volume).map((a) => a.frame);
  const allies = input.slots.map((_, i) => i);
  const countAt = (holder: number, frame: number, skill: string, stat: string) =>
    activeItemsAt(sim.history, holder, frame, { sourceSlotIndex: volume, skill, stat }).length;

  it('uses her Burst more than three times', () => {
    expect(uses.length).toBeGreaterThan(3);
  });

  it('gives every ally the crit damage ups of the 1st to k-th use (up to 3) for 5 s from each use', () => {
    uses.forEach((frame, k) => {
      for (const holder of allies) {
        expect(countAt(holder, frame, 'skill2', 'critDamage')).toBe(Math.min(k + 1, 3));
        expect(countAt(holder, frame + WINDOW - 1, 'skill2', 'critDamage')).toBe(Math.min(k + 1, 3));
        expect(countAt(holder, frame + WINDOW, 'skill2', 'critDamage')).toBe(0);
      }
    });
  });

  it('gives every ally the Burst crit rate up for 5 s from each use', () => {
    for (const frame of uses)
      for (const holder of allies) {
        expect(countAt(holder, frame, 'burst', 'critRate')).toBe(1);
        expect(countAt(holder, frame + WINDOW, 'burst', 'critRate')).toBe(0);
      }
  });

  it('cuts the running Burst Skill cooldowns at each Full Burst by 2.34 s, then 5.04 s, then 8.21 s', () => {
    const schedule = sim.schedule!;
    if (input.slots.length === 1) {
      // 単騎はフルバーストに入らないので起きない
      expect(schedule.fullBurstWindows).toEqual([]);
      expect(schedule.cooldownReductions.filter((r) => r.sourceSlotIndex === volume)).toEqual([]);
      return;
    }
    expect(schedule.fullBurstWindows.length).toBeGreaterThan(2);
    // 秒をフレームに切り捨てて効果ごとに引く（137・158・186f の和。リターの S1 と同じ。C-0460）
    const expected = [137, 295, 481];
    schedule.fullBurstWindows.forEach((w, n) => {
      const cut = new Map<number, number>();
      for (const r of schedule.cooldownReductions)
        if (r.frame === w.start && r.sourceSlotIndex === volume)
          cut.set(r.slotIndex, (cut.get(r.slotIndex) ?? 0) + r.applied);
      // CT の残りが縮める量より長い枠（III など）は、縮める量だけ縮む（ほかの枠は CT の残りまで）
      expect(Math.max(...cut.values())).toBe(expected[Math.min(n, 2)]);
    });
  });
});

describeEveryShotInOneGroup(TEAMS);
