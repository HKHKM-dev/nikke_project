// クイーン（真）（870）を含む編成: S1 の有利コードの攻撃ダメージ▲（持続。C-0296・V-0171）。
// 有利の敵（風圧）での sim と calc の整合と、▲が属性の倍率 1.1 に足されること（C-0119 と同じ elementDamage）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { elementMultiplier } from '../element.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { runSimulation, simGroupTotals } from '../sim/engine.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import { computeTeamDamage } from '../calc/model.ts';
import { planTeamRun } from '../frame/plan.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import type { CharacterData, Element } from '../types.ts';

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

function team(ids: number[], controlledSlot: number, element: Element): TeamInput {
  const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element, hasCore: true };
  return { slots: ids.map(fixedSlot), enemy, durationSeconds: 180, burst: true, controlledSlot };
}

const QUEEN = 870;
// クイーン（真）が III の実戦寄りの 5 人（Stage 8 の編成）を、クイーン（真）が有利の風圧の敵に当てる
const input = team([291, 20, 231, 101, QUEEN], 4, 'Wind');
const queen = 4;

describe('クイーン（真）の S1 の有利コードの攻撃ダメージ▲', () => {
  it('is a passive self elementDamage on skill1 (C-0296)', () => {
    const def = parseSkillDefinition(readJson<unknown>(`../../data/skills/${QUEEN}.json`));
    expect(def.skills.skill1.effects).toContainEqual(
      expect.objectContaining({ kind: 'passive', target: 'self', stat: 'elementDamage', claims: ['C-0296'] }),
    );
  });

  it('adds 13.59% to the 1.1 of the advantage for the whole battle, and nothing to the other slots', () => {
    const plan = planTeamRun(input);
    for (const segment of plan.timeline.segments) {
      segment.slots.forEach((state, i) => {
        expect(state?.buffs.elementDamage ?? 0).toBeCloseTo(i === queen ? 0.1359 : 0, 10);
      });
    }
    expect(elementMultiplier('Fire', 'Wind', 0.1359)).toBeCloseTo(1.2359, 10);
    expect(elementMultiplier('Fire', 'Fire', 0.1359)).toBe(1);
  });
});

describe('sim vs calc: エーテル + デルタ + イサベル + ドレイク + クイーン（真）・風圧の敵', () => {
  const sim = runSimulation(input);
  const calc = computeTeamDamage(input);

  it('agree exactly on the schedule and the shot-counted groups', () => {
    expect(sim.schedule).toEqual(calc.schedule);
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

  it('stays within 5% per slot and 3% for the team', () => {
    expect(Math.abs(sim.totalDamage - calc.totalDamage) / calc.totalDamage).toBeLessThan(0.03);
    input.slots.forEach((_, i) => {
      const s = sim.slots[i]!.totalDamage;
      const c = calc.slots[i]!.totalDamage;
      expect(Math.abs(s - c) / c).toBeLessThan(0.05);
    });
  });
});
