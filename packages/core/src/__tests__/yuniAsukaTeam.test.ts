// ユニ（160）を含む編成: S2 の吸収回復（維持時間のある heal）は、付き直しでは healed を起こさない
// （plan/design-heal-window.md 1.1 節。V-0024・C-0082）。録画 078 の編成と、実戦寄りの編成で sim と calc の整合を見る。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { runSimulation, simGroupTotals } from '../sim/engine.ts';
import { itemsOf } from '../skills/holders.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import { computeTeamDamage, countShotsInRanges } from '../calc/model.ts';
import { planTeamRun } from '../frame/plan.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import type { CharacterData } from '../types.ts';
import { gameSecondsToFrames } from '../time.ts';
import { healsOf, piecesOf } from './historyHelpers.ts';

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

const REC078 = team([fixedSlot(160), fixedSlot(830)], 1);
// アスカのバーストの吸収回復が、ユニの吸収回復の付いている間に付く（出どころが違うので別の窓。論点 1 の仮置き）。
// アリスの S1（topAttack）が順位を見るので、1 パス目のループの回復も通る
const PRACTICAL = team([fixedSlot(82), fixedSlot(160), fixedSlot(830), fixedSlot(191), fixedSlot(330)], 2);
const TEAMS: Record<string, TeamInput> = {
  '録画 078 の編成（ユニ + アスカ）': REC078,
  '実戦寄り（リター + ユニ + アスカ + アリス + クラウン）': PRACTICAL,
};

const YUNI = 0;
const S1 = gameSecondsToFrames(25);

describe('録画 078 の編成（V-0024）', () => {
  const plan = planTeamRun(REC078);
  const ASUKA = 1;

  // 回復はユニ自身には次のフレーム、後ろの枠のアスカには同じフレーム（V-0490、C-0628）
  it('heals each slot once, on the first full charge shot (refreshes do not count)', () => {
    const first = plan.shots[YUNI]!.frames[0]!;
    expect(plan.shots[YUNI]!.frames.length).toBeGreaterThan(50);
    expect(healsOf(plan)).toEqual([
      { frame: first, sourceSlotIndex: YUNI, slotIndex: ASUKA },
      { frame: first + 1, sourceSlotIndex: YUNI, slotIndex: YUNI },
    ]);
  });

  it('gives Asuka S1 for 25 s from the first full charge shot, and never again', () => {
    const start = plan.shots[YUNI]!.frames[0]!;
    const s1 = piecesOf(plan)
      .filter((w) => w.slotIndex === ASUKA && w.effect.stat === 'attack')
      .map((w) => ({ start: w.start, end: w.end }));
    expect(s1).toEqual([{ start, end: start + S1 }]);
  });
});

describe('実戦寄りの編成', () => {
  const plan = planTeamRun(PRACTICAL);
  const ASUKA = 2;

  it('heals Asuka on her burst uses as a separate window from Yuni (placeholder of point 1)', () => {
    const uses = plan.schedule!.activations.filter((a) => a.slotIndex === ASUKA).map((a) => a.frame);
    expect(uses.length).toBeGreaterThan(0);
    const own = healsOf(plan)
      .filter((h) => h.sourceSlotIndex === ASUKA)
      .map((h) => h.frame);
    expect(own).toEqual(uses);
    const fromYuni = healsOf(plan).filter((h) => h.sourceSlotIndex === 1 && h.slotIndex === ASUKA);
    expect(fromYuni).toHaveLength(1);
  });

  it('gives the S1 attack items on every heal of the loop (own burst and Yuni), at the stage the ranking reads', () => {
    const items = itemsOf(plan.history, { kind: 'timed', skill: 'skill1', stat: 'attack' }).filter(
      (i) => i.origin.kind === 'timed' && i.origin.effect.source.resourceId === 830,
    );
    expect(items.length).toBeGreaterThan(0);
    const healed = plan.history.heals.filter((h) => h.slotIndex === ASUKA).map((h) => h.frame);
    for (const i of items) expect(healed).toContain(i.start);
    for (const f of healed) expect(items.some((i) => i.start <= f && f < i.end)).toBe(true);
    expect(items.every((i) => i.holder === ASUKA && i.stage === 1)).toBe(true);
  });
});

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
