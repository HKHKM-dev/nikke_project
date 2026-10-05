// 対象の語彙編（plan/design-target-vocab.md）: エマ：TU・ウンファ：TU の S2 の「同じ部隊の味方全体に」（targetSquad。C-0266・C-0268）と、
// マナの S2 の「基本チャージ時間が一番長い味方 1 機にチャージ時間 0.18 秒▼」（longestChargeTime・chargeSpeed の flat。C-0267）を
// 含む編成。対象の枠と、sim と calc の整合
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

const EMMA = 93;
const EUNHWA = 95;
const MANA = 290;

/** 常時パッシブのうち、枠 from の効果が枠 to に足した stat の量 */
function passiveFrom(input: TeamInput, from: number, to: number, stat: string): number {
  const state = planTeamRun(input).timeline.passive[to]!;
  return state.passiveEffects
    .filter((e) => e.sourceSlotIndex === from && e.stat === stat)
    .reduce((sum, e) => sum + e.appliedAmount, 0);
}

describe('同じ部隊の味方全体に（targetSquad）', () => {
  it('gives Emma: TU S2 critical damage to herself but not to Delta (録画 022 の編成。C-0266)', () => {
    const input = team([fixedSlot(EMMA), fixedSlot(20)], 1);
    expect(passiveFrom(input, 0, 0, 'critDamage')).toBeCloseTo(0.2351, 6);
    expect(passiveFrom(input, 0, 1, 'critDamage')).toBe(0);
  });

  it('gives both S2 to the Absolute slots only (C-0266・C-0268)', () => {
    const input = team([fixedSlot(EMMA), fixedSlot(EUNHWA), fixedSlot(20), fixedSlot(225)], 3);
    for (const to of [0, 1]) {
      expect(passiveFrom(input, 0, to, 'critDamage')).toBeCloseTo(0.2351, 6);
      expect(passiveFrom(input, 1, to, 'critRate')).toBeCloseTo(0.0816, 6);
    }
    for (const to of [2, 3]) {
      expect(passiveFrom(input, 0, to, 'critDamage')).toBe(0);
      expect(passiveFrom(input, 1, to, 'critRate')).toBe(0);
    }
    // チャージダメージ▲（効果 2）は味方全体のまま
    expect(passiveFrom(input, 1, 3, 'chargeDamage')).toBeGreaterThan(0);
  });
});

describe('基本チャージ時間が一番長い味方（longestChargeTime）', () => {
  const chargeWindows = (input: TeamInput) =>
    planTeamRun(input).timeline.windows.filter(
      (w) => w.effect.source.resourceId === MANA && w.effect.stat === 'chargeSpeed',
    );

  it('cuts 0.18 s from Delta at every full burst start (録画 020 の編成。C-0267)', () => {
    const input = team([fixedSlot(291), fixedSlot(20), fixedSlot(MANA)], 2);
    const windows = chargeWindows(input);
    const sim = runSimulation(input);
    const starts = sim.schedule!.fullBurstWindows.map((w) => w.start);
    expect(windows.map((w) => w.start)).toEqual(starts);
    expect(windows.every((w) => w.slotIndex === 1 && w.effect.value === 0.18)).toBe(true);
  });

  it('picks the slot with the longest base charge time (録画 043 の編成: アリスの 1.5 秒)', () => {
    const input = team([fixedSlot(304), fixedSlot(330), fixedSlot(191), fixedSlot(MANA), fixedSlot(172)], 2);
    const windows = chargeWindows(input);
    expect(windows.length).toBeGreaterThan(0);
    expect(windows.every((w) => w.slotIndex === 2)).toBe(true);
  });
});

const TEAMS: Record<string, TeamInput> = {
  '録画 022 の編成（エマ：TU + デルタ）': team([fixedSlot(EMMA), fixedSlot(20)], 1),
  'エマ：TU + ウンファ：TU + デルタ + 紅蓮BS': team(
    [fixedSlot(EMMA), fixedSlot(EUNHWA), fixedSlot(20), fixedSlot(225)],
    3,
  ),
  '録画 020 の編成（エーテル + デルタ + マナ）': team([fixedSlot(291), fixedSlot(20), fixedSlot(MANA)], 2),
  '録画 043 の編成（フラワー + クラウン + アリス + マナ + アドミ）': team(
    [fixedSlot(304), fixedSlot(330), fixedSlot(191), fixedSlot(MANA), fixedSlot(172)],
    2,
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
