// I-DOLL・オーシャン（305）を含む編成: バーストの味方全体への 1 回の回復（heal・burstUse）は、
// 使うたびに全員に healed を起こす（plan/design-heal-vocabulary.md 1 節の表の 4。C-0554 は仮説）。
// 受け手のアスカの S1 の窓と、実戦寄りの編成での sim と calc の整合を見る。
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

// オーシャン（I）+ クラウン（II）+ アスカ・アリス（III）+ ユニ（II）。オーシャンのバーストは I の枠で撃つ
const PRACTICAL: TeamInput = {
  slots: [fixedSlot(305), fixedSlot(330), fixedSlot(830), fixedSlot(191), fixedSlot(160)],
  enemy,
  durationSeconds: 180,
  burst: true,
  controlledSlot: 2,
};

const OCEAN = 0;
const ASUKA = 2;

describe('実戦寄りの編成（オーシャン + クラウン + アスカ + アリス + ユニ）', () => {
  const plan = planTeamRun(PRACTICAL);

  it('heals every slot on each Ocean burst use', () => {
    const uses = plan.schedule!.activations.filter((a) => a.slotIndex === OCEAN).map((a) => a.frame);
    expect(uses.length).toBeGreaterThan(0);
    const fromOcean = healsOf(plan).filter((h) => h.sourceSlotIndex === OCEAN);
    expect(fromOcean).toEqual(
      uses.flatMap((frame) => PRACTICAL.slots.map((_, slotIndex) => ({ frame, sourceSlotIndex: OCEAN, slotIndex }))),
    );
  });

  it('starts or extends an Asuka S1 window at each Ocean burst use', () => {
    const uses = plan.schedule!.activations.filter((a) => a.slotIndex === OCEAN).map((a) => a.frame);
    const s1 = piecesOf(plan).filter(
      (w) => w.slotIndex === ASUKA && w.effect.source.resourceId === 830 && w.effect.stat === 'attack',
    );
    for (const frame of uses) {
      expect(s1.some((w) => w.start <= frame && frame < w.end)).toBe(true);
    }
  });
});

describe('sim vs calc: 実戦寄りの編成', () => {
  const sim = runSimulation(PRACTICAL);
  const calc = computeTeamDamage(PRACTICAL);
  const plan = planTeamRun(PRACTICAL);

  it('agree exactly on the schedule, the instants and the shot-counted groups', () => {
    expect(sim.schedule).toEqual(calc.schedule);
    expect(sim.instants).toEqual(plan.instants);
    PRACTICAL.slots.forEach((_, i) => {
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
    PRACTICAL.slots.forEach((_, i) => {
      const frames = plan.shots[i]!.frames;
      const total = calc.slots[i]!.segments.reduce((sum, g) => sum + countShotsInRanges(frames, g.ranges), 0);
      expect(total).toBe(frames.length);
    });
  });

  it('stays within 5% per slot and 3% for the team', () => {
    expect(Math.abs(sim.totalDamage - calc.totalDamage) / calc.totalDamage).toBeLessThan(0.03);
    PRACTICAL.slots.forEach((_, i) => {
      const s = sim.slots[i]!.totalDamage;
      const c = calc.slots[i]!.totalDamage;
      expect(Math.abs(s - c) / c).toBeLessThan(0.05);
    });
  });
});
