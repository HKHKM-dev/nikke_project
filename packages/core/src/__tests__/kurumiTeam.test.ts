// クルミ（862）を含む編成: S1 のハッキング（持続ダメージ dot。付いた 1 秒後から 1 秒ごと・付き直しで延びる）。
// sim と calc の整合と、ハッキングの tick（plan/design-kurumi.md）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { activationFramesOfSlot } from '../burst/schedule.ts';
import { runSimulation, simGroupTotals } from '../sim/engine.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import { computeTeamDamage, countShotsInRanges } from '../calc/model.ts';
import { dotTickFrames, planTeamRun } from '../frame/plan.ts';
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

const KURUMI = 862;
// 撮影の計画の編成（クルミ単騎。V-0052）と、クルミが I の実戦寄りの 5 人
const TEAMS: Record<string, { input: TeamInput; kurumi: number }> = {
  '撮影の計画の編成（クルミ単騎）': { input: team([fixedSlot(KURUMI)], 0), kurumi: 0 },
  '実戦寄り（クルミ + クラウン + ドレイク + アリス + リター）': {
    input: team([fixedSlot(KURUMI), fixedSlot(330), fixedSlot(101), fixedSlot(191), fixedSlot(82)], 0),
    kurumi: 0,
  },
};

describe('クルミの定義', () => {
  it('supports S1 (two hackings); S2 and the burst are notes', () => {
    const def = parseSkillDefinition(readJson<unknown>(`../../data/skills/${KURUMI}.json`));
    expect(def.skills.skill1.support).toBe('supported');
    expect(def.skills.skill1.effects.map((e) => e.kind)).toEqual(['dot', 'dot']);
    expect(def.skills.skill2.support).toBe('unsupported');
    expect(def.skills.burst.support).toBe('unsupported');
  });
});

describe.each(Object.entries(TEAMS))('sim vs calc: %s', (_name, { input, kurumi }) => {
  const sim = runSimulation(input);
  const calc = computeTeamDamage(input);
  const plan = planTeamRun(input);
  const ticks = plan.skillHits.filter((h) => h.slotIndex === kurumi && h.effect.dot !== undefined);

  it('hacks on every 36th hit and on each burst as one hacking: from 1 s after, every second, extended by re-applying (C-0129, C-0130, C-0136)', () => {
    const shots = plan.shots[kurumi]!.frames;
    const hits = shots.filter((_, j) => (j + 1) % 36 === 0);
    const uses = activationFramesOfSlot(plan.schedule!, kurumi);
    expect(hits.length).toBeGreaterThan(10);
    expect(uses.length).toBeGreaterThan(0);
    const fires = [...hits, ...uses].sort((a, b) => a - b);
    expect(ticks.map((h) => h.frame)).toEqual(dotTickFrames(fires, 1, 5, plan.frames, 'afterInterval'));
    // 付いたフレームには tick が出ない（重ならないので、同じフレームに 2 つの tick も出ない）
    const frames = ticks.map((h) => h.frame);
    expect(new Set(frames).size).toBe(frames.length);
    for (const f of hits) expect(frames).not.toContain(f);
  });

  it('attributes each tick to the effect that applied the hacking last', () => {
    const uses = activationFramesOfSlot(plan.schedule!, kurumi);
    for (const u of uses) {
      const next = ticks.find((h) => h.frame > u);
      if (next === undefined) continue;
      const hitFiresBetween = plan.shots[kurumi]!.frames.filter(
        (f, j) => (j + 1) % 36 === 0 && f > u && f <= next.frame,
      );
      if (hitFiresBetween.length === 0) expect(next.effect.effectIndex).toBe(1);
    }
  });

  it('uses 52.24% per tick at skill Lv10', () => {
    for (const h of plan.skillHits.filter((x) => x.slotIndex === kurumi)) {
      expect(h.effect.multiplier).toBeCloseTo(0.5224, 10);
    }
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
