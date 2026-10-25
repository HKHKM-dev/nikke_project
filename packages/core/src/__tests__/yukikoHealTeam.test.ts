// 雪子（871）の S1 のペルソナ - コノハナサクヤの味方全体の回復（メディア）は、戦闘開始から 3 秒ごと（0 秒には起きない）に
// 1 回ずつ起きる（C-0647）。S2 の真紅の華の回復（メディラマ）は同じフレームに重なるので、別に定義しない（C-0648）。
// 回復を受けた時の効果を持つ味方（アスカの S1・クラウンの S2）の発動と、sim と calc の整合
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { runSimulation, simGroupTotals } from '../sim/engine.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import { computeTeamDamage, countShotsInRanges } from '../calc/model.ts';
import { planTeamRun } from '../frame/plan.ts';
import { timerFrames } from '../skills/timeline.ts';
import { gameSecondsToFirstFrame, gameSecondsToFrames } from '../time.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import type { CharacterData } from '../types.ts';
import { piecesOf } from './historyHelpers.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const DEFINED = new Set(readJson<{ resourceIds: number[] }>('../../data/skills/index.json').resourceIds);
const character = (id: number) => readJson<CharacterData>(`../../data/characters/${id}.json`);

function fixedSlot(id: number): TeamSlotInput {
  const c = character(id);
  const fixed = computeFixedSpecAttack(c);
  const slot: TeamSlotInput = {
    character: c,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true },
  };
  if (DEFINED.has(id)) {
    slot.skills = {
      definition: parseSkillDefinition(readJson<unknown>(`../../data/skills/${id}.json`)),
      levels: MAX_SKILL_LEVELS,
    };
  }
  return slot;
}

const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: 'Wind', hasCore: true };

function team(slots: TeamSlotInput[], controlledSlot: number, burst = true): TeamInput {
  return { slots, enemy, durationSeconds: 180, burst, controlledSlot };
}

const YUKIKO = 871;
const RAM = 822;
const DELTA = 20;
const ASUKA = 830;
const CROWN = 330;

const period = gameSecondsToFirstFrame(3);

describe('ペルソナ - コノハナサクヤのメディア（C-0647）', () => {
  it('heals every ally every 3 s from battle start, not at 0 s, also through Full Burst (録画 0258・0260・0538・0539 の編成)', () => {
    const plan = planTeamRun(team([fixedSlot(RAM), fixedSlot(DELTA), fixedSlot(YUKIKO)], 2));
    expect(plan.schedule?.fullBurstWindows.length).toBeGreaterThan(0);
    // 周期は発動のたびに数え直す（k × ceil(3 ÷ 0.017)。C-0502）。1 回目は 3 秒で、0 秒には起きない
    const expected = timerFrames(3, plan.frames);
    expect(expected.slice(0, 3)).toEqual([period, 2 * period, 3 * period]);
    for (const slot of [0, 1, 2]) {
      const heals = plan.history.heals.filter((h) => h.slotIndex === slot);
      expect(heals.map((h) => h.frame)).toEqual(expected);
      expect(heals.every((h) => h.sourceSlotIndex === 2)).toBe(true);
    }
  });

  it("opens Asuka's S1 from the first heal (3 s) and keeps it on to the end of battle", () => {
    const plan = planTeamRun(team([fixedSlot(YUKIKO), fixedSlot(ASUKA)], 1, false));
    const s1 = piecesOf(plan).filter(
      (w) => w.slotIndex === 1 && w.effect.source.resourceId === ASUKA && w.effect.source.skill === 'skill1',
    );
    expect(s1[0]!.start).toBe(period);
    // 25 秒の窓は 3 秒ごとの回復で延び続け、切れ目が無い（C-0087 の上書き延長）
    for (let i = 1; i < s1.length; i++) expect(s1[i]!.start).toBeLessThanOrEqual(s1[i - 1]!.end);
    expect(s1.at(-1)!.end).toBeGreaterThanOrEqual(plan.frames - 1);
  });

  it("does not open Asuka's S1 before the first heal (0 s には回復が起きない)", () => {
    const plan = planTeamRun(team([fixedSlot(YUKIKO), fixedSlot(ASUKA)], 1, false));
    const shots = plan.shots[1]!.frames;
    const s1 = piecesOf(plan).filter(
      (w) => w.slotIndex === 1 && w.effect.source.resourceId === ASUKA && w.effect.source.skill === 'skill1',
    );
    expect(shots.some((f) => f < period)).toBe(true);
    expect(s1.every((w) => w.start >= period && w.end > period + gameSecondsToFrames(3))).toBe(true);
  });
});

const TEAMS: Record<string, TeamInput> = {
  '録画 0538 の編成（ラム + デルタ + 雪子）': team([fixedSlot(RAM), fixedSlot(DELTA), fixedSlot(YUKIKO)], 2),
  '雪子 + アスカ・バーストなし': team([fixedSlot(YUKIKO), fixedSlot(ASUKA)], 1, false),
  '実戦寄り（ラム + デルタ + 雪子 + クラウン + アスカ）': team(
    [fixedSlot(RAM), fixedSlot(DELTA), fixedSlot(YUKIKO), fixedSlot(CROWN), fixedSlot(ASUKA)],
    4,
  ),
};

describe.each(Object.entries(TEAMS))('sim vs calc: %s', (_name, input) => {
  const sim = runSimulation(input);
  const calc = computeTeamDamage(input);
  const plan = planTeamRun(input);

  it('agree exactly on the schedule, the instants and the shot-counted groups', () => {
    expect(sim.schedule).toEqual(calc.schedule);
    expect(sim.instants).toEqual(plan.instants);
    input.slots.forEach((_, i) => {
      const s = sim.slots[i]!;
      const c = calc.slots[i]!;
      expect(s.skillHits.damage).toBe(c.skillHits.totalDamage);
      expect(s.burst.damage).toBe(c.burst.totalDamage);
      const groups = simGroupTotals(sim, i);
      c.segments.forEach((g, j) => {
        if (g.triggerSource !== 'shots') return;
        expect(g.triggers).toBe(groups[j]!.triggers);
        expect(g.damage).toBeCloseTo(groups[j]!.damage, 3);
      });
    });
  });

  it('partitions every shot into exactly one group (start ≤ shot < end)', () => {
    input.slots.forEach((_, i) => {
      const frames = plan.shots[i]!.frames;
      const total = calc.slots[i]!.segments.reduce((sum, g) => sum + countShotsInRanges(frames, g.ranges), 0);
      expect(total).toBe(frames.length);
    });
  });

  it('stays within 5% per slot and 3% for the team', () => {
    expect(Math.abs(sim.totalDamage - calc.totalDamage) / calc.totalDamage).toBeLessThan(0.03);
    input.slots.forEach((_, i) => {
      const s = sim.slots[i]!.totalDamage;
      const c = calc.slots[i]!.totalDamage;
      expect(Math.abs(s - c) / c).toBeLessThan(0.05);
    });
  });
});
