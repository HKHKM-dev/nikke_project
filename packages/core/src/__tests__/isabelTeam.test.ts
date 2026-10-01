// イサベル（231）を含む編成: バーストの段階 1 の受けるダメージ▲（2 回目の発動から 5 秒。V-0075）。
// sim と calc の整合と、▲の窓・掛かる先（C-0160〜C-0163）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { activationFramesOfSlot } from '../burst/schedule.ts';
import { runSimulation, simGroupTotals } from '../sim/engine.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import { computeTeamDamage, countShotsInRanges } from '../calc/model.ts';
import { planTeamRun } from '../frame/plan.ts';
import { gameSecondsToFrame } from '../time.ts';
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

function team(ids: number[], controlledSlot: number): TeamInput {
  return { slots: ids.map(fixedSlot), enemy, durationSeconds: 180, burst: true, controlledSlot };
}

const ISABEL = 231;
// 録画 038 の編成と、イサベルが III の実戦寄りの 5 人（Stage 8 の編成）
const TEAMS: Record<string, { input: TeamInput; isabel: number }> = {
  '録画 038 の編成（ラム + デルタ + イサベル）': { input: team([822, 20, ISABEL], 2), isabel: 2 },
  '実戦寄り（エーテル + デルタ + イサベル + ドレイク + クイーン（真））': {
    input: team([291, 20, ISABEL, 101, 870], 2),
    isabel: 2,
  },
};

describe('イサベルの定義', () => {
  it('has the burst skill damage, the tier 1 damage taken up from the 2nd use and the tier 2 / 3 damage', () => {
    const def = parseSkillDefinition(readJson<unknown>(`../../data/skills/${ISABEL}.json`));
    expect(def.skills.burst.support).toBe('partial');
    expect(def.skills.burst.effects).toMatchObject([
      { kind: 'burstDamage' },
      { kind: 'timed', trigger: { count: 'burstUse', atLeast: 2 }, target: 'allies', stat: 'damageTaken' },
      { kind: 'damage', trigger: { count: 'burstUse', atLeast: 3 } },
      { kind: 'damage', trigger: { count: 'burstUse', atLeast: 4 } },
    ]);
  });
});

describe.each(Object.entries(TEAMS))('sim vs calc: %s', (_name, { input, isabel }) => {
  const sim = runSimulation(input);
  const calc = computeTeamDamage(input);
  const plan = planTeamRun(input);
  const uses = activationFramesOfSlot(plan.schedule!, isabel);
  const windows = plan.timeline.windows.filter((w) => w.effect.stat === 'damageTaken');

  it('raises the damage taken by 39.96% for 5 s from the 2nd use of Isabel, for every slot (C-0160, C-0161)', () => {
    expect(uses.length).toBeGreaterThan(2);
    expect(new Set(windows.map((w) => w.start))).toEqual(new Set(uses.slice(1)));
    for (const w of windows) {
      expect(w.effect.value).toBeCloseTo(0.3996, 10);
      expect(w.end - w.start).toBe(gameSecondsToFrame(5));
    }
    for (const segment of plan.timeline.segments) {
      const inside = windows.some((w) => w.start <= segment.start && segment.start < w.end);
      for (const state of segment.slots) expect(state?.buffs.damageTaken ?? 0).toBeCloseTo(inside ? 0.3996 : 0, 10);
    }
  });

  it('does not put the damage taken up on the same use: burst skill damage (C-0161) and, not yet, tier 2 / 3 damage (C-0163)', () => {
    const burstHits = sim.slots[isabel]!.burst.hits;
    expect(burstHits).toHaveLength(uses.length);
    for (const h of burstHits) expect(h.damageTakenMultiplier).toBe(1);
    const tierHits = plan.skillHits.filter((h) => h.slotIndex === isabel);
    expect(tierHits.length).toBeGreaterThan(0);
    for (const h of tierHits) {
      expect(uses).toContain(h.frame);
      expect(h.hit.damageTakenMultiplier).toBe(1);
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
