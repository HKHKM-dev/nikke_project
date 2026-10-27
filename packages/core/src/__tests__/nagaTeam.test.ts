// ナガ（450）を含む編成: S2 の 1 つめ（通常攻撃 5 発ごとに、最終攻撃力の高い味方 2 機へコアダメージ▲ 5 秒。C-0592・C-0593）。
// sim と calc の整合と、コアダメージ▲の付く先が 2 機であること。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { runSimulation, simGroupTotals } from '../sim/engine.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import { runTeam } from './runTeam.ts';
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

function team(slots: TeamSlotInput[], controlledSlot: number, burst: boolean): TeamInput {
  return { slots, enemy, durationSeconds: 180, burst, controlledSlot };
}

const NAGA = 450;
// S2 のコアダメージ▲（Lv10）
const CORE_DAMAGE = 0.4007;
// 撮影の編成（単騎。V-0454）、アニス：スター + ナガ（V-0455 の編成）、実戦寄りの 5 人
const TEAMS: Record<string, { input: TeamInput; naga: number }> = {
  '撮影の編成（ナガ単騎）': { input: team([fixedSlot(NAGA)], 0, false), naga: 0 },
  'アニス：スター + ナガ': { input: team([fixedSlot(17), fixedSlot(NAGA)], 0, true), naga: 1 },
  '実戦寄り（デルタ + ナガ + アリス + ドレイク + モダニア）': {
    input: team([fixedSlot(20), fixedSlot(NAGA), fixedSlot(191), fixedSlot(101), fixedSlot(260)], 2, true),
    naga: 1,
  },
};

describe.each(Object.entries(TEAMS))('sim vs calc: %s', (_name, { input, naga }) => {
  const sim = runSimulation(input);
  const calc = runTeam(input);
  const plan = planTeamRun(input);

  it('gives core damage up to min(2, team size) slots 6 frames after the 5th shot (C-0592・C-0593・C-0653)', () => {
    const fifth = plan.shots[naga]!.frames[4]!;
    const segmentAt = (frame: number) => sim.timeline.segments.find((s) => s.start <= frame && frame < s.end)!;
    // 5 発目の 5f 後までは誰にも付いていない。付くのは 6f 後から（delayFrames。枠の順に依らない）
    for (const slot of segmentAt(fifth + 5).slots) expect(slot?.buffs.coreDamage ?? 0).toBe(0);
    const after = segmentAt(fifth + 6);
    const buffed = after.slots.filter((slot) => slot !== null && Math.abs(slot.buffs.coreDamage - CORE_DAMAGE) < 1e-9);
    expect(buffed.length).toBe(Math.min(2, input.slots.length));
  });

  it('agree exactly on the schedule and the shot-counted groups', () => {
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

  it('stays within 5% per slot and 3% for the team', () => {
    expect(Math.abs(sim.totalDamage - calc.totalDamage) / calc.totalDamage).toBeLessThan(0.03);
    input.slots.forEach((_, i) => {
      const s = sim.slots[i]!.totalDamage;
      const c = calc.slots[i]!.totalDamage;
      expect(Math.abs(s - c) / c).toBeLessThan(0.05);
    });
  });
});
