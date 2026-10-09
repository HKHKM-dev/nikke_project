// エマ：TU（93）の S1 の環境コントロール（敵全体の受けるダメージ▲。戦闘開始時と、そこから 30 秒ごと。C-0305）と、
// S2 のフォーメーションAS の再発動周期 20 秒▼（編成にウンファ：TU がいれば 10 秒ごと。C-0306）。窓の時刻と、sim と calc の整合
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { runSimulation, simGroupTotals } from '../sim/engine.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import { computeTeamDamage, countShotsInRanges } from '../calc/model.ts';
import { planTeamRun } from '../frame/plan.ts';
import { gameSecondsToFirstFrame, gameSecondsToFrame } from '../time.ts';
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

function team(slots: TeamSlotInput[], controlledSlot: number, burst = true): TeamInput {
  return { slots, enemy, durationSeconds: 180, burst, controlledSlot };
}

const EMMA = 93;
const EUNHWA = 95;

/** エマの環境コントロールの受けるダメージ▲の窓（枠 0 に付いた分） */
function environmentWindows(input: TeamInput) {
  return planTeamRun(input).timeline.windows.filter(
    (w) => w.slotIndex === 0 && w.effect.source.resourceId === EMMA && w.effect.stat === 'damageTaken',
  );
}

describe('環境コントロールの窓', () => {
  it('opens at battle start and every 30 s after, for 10 s each, without Eunhwa: TU (録画 226 の編成。C-0305)', () => {
    const windows = environmentWindows(team([fixedSlot(EMMA)], 0, false));
    expect(windows.map((w) => w.start)).toEqual(
      // 30 秒ごとの周期は発動のたびに数え直す（k × ceil(30 ÷ 0.017)。C-0502）
      [0, 1, 2, 3, 4, 5].map((k) => k * gameSecondsToFirstFrame(30)),
    );
    for (const w of windows) {
      expect(w.end - w.start).toBe(gameSecondsToFrame(10));
      expect(w.effect.value).toBeCloseTo(0.039, 10);
    }
  });

  it('opens every 10 s with Eunhwa: TU, so it covers the whole battle but for rounding gaps of 1 frame (録画 227 の編成。C-0306)', () => {
    const input = team([fixedSlot(EMMA), fixedSlot(EUNHWA)], 0, false);
    const windows = environmentWindows(input);
    expect(windows[0]!.start).toBe(0);
    expect(windows.at(-1)!.end).toBeGreaterThanOrEqual(planTeamRun(input).frames - 1);
    for (let i = 1; i < windows.length; i++) expect(windows[i]!.start - windows[i - 1]!.end).toBeLessThanOrEqual(1);
  });
});

const TEAMS: Record<string, TeamInput> = {
  '録画 226 の編成（エマ：TU 単騎・バーストなし）': team([fixedSlot(EMMA)], 0, false),
  '録画 227 の編成（エマ：TU + ウンファ：TU・バーストなし）': team([fixedSlot(EMMA), fixedSlot(EUNHWA)], 0, false),
  '実戦寄り（エマ：TU + ウンファ：TU + クラウン + アリス + リター）': team(
    [fixedSlot(EMMA), fixedSlot(EUNHWA), fixedSlot(330), fixedSlot(191), fixedSlot(82)],
    3,
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
