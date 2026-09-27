// デルタ（20）を含む編成: 定義はダメージに効く効果を持たない（全スロット unsupported）。sim と calc の整合（V-0027、C-0081）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { runSimulation, simGroupTotals } from '../sim/engine.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import { computeTeamDamage, countShotsInRanges } from '../calc/model.ts';
import { planTeamRun } from '../frame/plan.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import type { CharacterData } from '../types.ts';

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

const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: null, hasCore: true };

function team(slots: TeamSlotInput[], controlledSlot: number): TeamInput {
  return { slots, enemy, durationSeconds: 180, burst: true, controlledSlot };
}

const DELTA = 20;
// 録画 063 の編成（フラワー + デルタ + アスカ）と、デルタが II の実戦寄りの 5 人
const TEAMS: Record<string, { input: TeamInput; delta: number }> = {
  '録画 063 の編成（フラワー + デルタ + アスカ）': {
    input: team([fixedSlot(304), fixedSlot(DELTA), fixedSlot(830)], 2),
    delta: 1,
  },
  '実戦寄り（リター + デルタ + ドレイク + アリス + クラウン）': {
    input: team([fixedSlot(82), fixedSlot(DELTA), fixedSlot(101), fixedSlot(191), fixedSlot(330)], 2),
    delta: 1,
  },
};

describe('デルタの定義', () => {
  it('is defined with notes only (no effects in any slot)', () => {
    const def = parseSkillDefinition(readJson<unknown>(`../../data/skills/${DELTA}.json`));
    for (const slot of ['skill1', 'skill2', 'burst'] as const) {
      expect(def.skills[slot].support).toBe('unsupported');
      expect(def.skills[slot].effects).toEqual([]);
    }
  });
});

describe.each(Object.entries(TEAMS))('sim vs calc: %s', (_name, { input, delta }) => {
  const sim = runSimulation(input);
  const calc = computeTeamDamage(input);
  const plan = planTeamRun(input);

  it('gives no buff windows or instants from Delta (C-0081)', () => {
    expect(plan.timeline.windows.filter((w) => w.sourceSlotIndex === delta)).toEqual([]);
    expect(plan.instants.filter((e) => e.sourceSlotIndex === delta)).toEqual([]);
  });

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
