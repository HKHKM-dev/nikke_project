// ロザンナ：シックオーシャン（283。V-0760）を含む編成で、バーストの味方全体の持続ダメージ▲と敵全体の受けるダメージ▲（10 秒）が
// 発動ごとに付き、窓の中の持続ダメージの tick に乗るか。S2 の持続ダメージが 30 秒ごとの発動の 8f 後から 15 tick ずつ出るか
import { describe, expect, it } from 'vitest';
import { runSimulation } from '../sim/engine.ts';
import { itemsOf } from '../skills/holders.ts';
import type { TeamInput } from '../team.ts';
import { gameSecondsToFirstFrame, gameSecondsToFrames } from '../time.ts';
import { describeEveryShotInOneGroup, fixedTeam } from './teamHelpers.ts';

const ROSANNA_CO = 283;
const WINDOW = gameSecondsToFrames(10);

const TEAMS: Record<string, TeamInput> = {
  '撮影 B の編成（I-DOLL・フラワー + ロザンナ：CO + I-DOLL・サン）': fixedTeam([304, ROSANNA_CO, 308], 2),
  '実戦寄り（クルミ + ロザンナ：CO + マナ + アリス + ドレイク）': fixedTeam([862, ROSANNA_CO, 290, 191, 101], 2),
};

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const rosanna = input.slots.findIndex((s) => s?.character.resourceId === ROSANNA_CO);
  const allies = input.slots.flatMap((s, i) => (s ? [i] : []));
  const sim = runSimulation(input);
  const activations = (sim.schedule?.activations ?? []).filter((a) => a.slotIndex === rosanna).map((a) => a.frame);
  // 窓は戦闘の終わりで切れる
  const battleEnd = gameSecondsToFirstFrame(input.durationSeconds);
  const windows = activations.map((frame) => ({ start: frame, end: Math.min(frame + WINDOW, battleEnd) }));

  it('uses the Burst several times', () => {
    expect(activations.length).toBeGreaterThan(3);
  });

  it('gives every ally sustained damage up for 10 s from each Burst activation', () => {
    const items = itemsOf(sim.history, { sourceSlotIndex: rosanna, skill: 'burst', stat: 'sustainedDamage' });
    for (const holder of allies)
      expect(items.filter((i) => i.holder === holder).map((i) => ({ start: i.start, end: i.end }))).toEqual(windows);
  });

  it('gives the enemy damage taken up for 10 s from each Burst activation', () => {
    const items = itemsOf(sim.history, { sourceSlotIndex: rosanna, skill: 'burst', stat: 'damageTaken' });
    expect(items.every((i) => i.holder === -1)).toBe(true);
    expect(items.map((i) => ({ start: i.start, end: i.end }))).toEqual(windows);
  });

  it('applies both to the allies’ sustained damage ticks inside a window', () => {
    const inWindow = sim.skillHits.filter(
      (h) => h.effect.dot !== undefined && windows.some((w) => w.start <= h.frame && h.frame < w.end),
    );
    expect(inWindow.length).toBeGreaterThan(10);
    for (const h of inWindow) {
      expect(h.hit.sustainedDamageMultiplier).toBeGreaterThanOrEqual(1.2032 - 1e-9);
      expect(h.hit.damageTakenMultiplier).toBeGreaterThanOrEqual(1.3223 - 1e-9);
    }
  });

  it('deals the S2 sustained damage every 1765 frames (30 s), 15 ticks from 8 frames after each activation', () => {
    const ticks = sim.skillHits.filter((h) => h.slotIndex === rosanna).map((h) => h.frame);
    expect(sim.skillHits.filter((h) => h.slotIndex === rosanna).every((h) => h.effect.source.skill === 'skill2')).toBe(
      true,
    );
    // 1 秒を超えて離れた所でまとまりを分ける
    const groups: number[][] = [];
    for (const f of ticks) {
      const last = groups.at(-1);
      if (last !== undefined && f - last.at(-1)! < 100) last.push(f);
      else groups.push([f]);
    }
    expect(groups.map((g) => g[0])).toEqual([1, 2, 3, 4, 5].map((k) => 1765 * k + 8));
    for (const g of groups) expect(g).toHaveLength(15);
  });
});

describeEveryShotInOneGroup(TEAMS);
