// たきな（861）を含む編成（V-0507。plan/design-skill-unrecorded.md 2 節）。
// S1: 戦闘開始時の自分の攻撃力▲（5 秒）。フルバーストタイム終了時の分・防御力無視ダメージ▲・S2・バーストは未対応の notes。
// sim と calc の整合。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { runSimulation, simGroupTotals } from '../sim/engine.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import { computeTeamDamage, countShotsInRanges } from '../calc/model.ts';
import { planTeamRun } from '../frame/plan.ts';
import type { SlotCondition, TeamInput, TeamSlotInput } from '../team.ts';
import type { CharacterData } from '../types.ts';
import { slotPieces } from './historyHelpers.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const DEFINED = new Set(readJson<{ resourceIds: number[] }>('../../data/skills/index.json').resourceIds);
const character = (id: number) => readJson<CharacterData>(`../../data/characters/${id}.json`);

const TAKINA = 861;
const MANUAL: SlotCondition = { coreHitRate: 1, distanceBonus: false, fullCharge: true };

function fixedSlot(id: number): TeamSlotInput {
  const c = character(id);
  const fixed = computeFixedSpecAttack(c);
  const slot: TeamSlotInput = { character: c, growth: fixed.growth, attackOverride: fixed.attack, condition: MANUAL };
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

describe('たきなの定義', () => {
  const def = parseSkillDefinition(readJson<unknown>(`../../data/skills/${TAKINA}.json`));

  it('defines only the start-of-combat ATK of S1 (the rest stays in notes)', () => {
    expect(def.skills.skill1.support).toBe('partial');
    expect(def.skills.skill1.effects).toEqual([
      expect.objectContaining({ kind: 'timed', trigger: 'battleStart', target: 'self', stat: 'attack', ref: 1 }),
    ]);
    expect(def.skills.skill2.support).toBe('unsupported');
    expect(def.skills.burst.support).toBe('unsupported');
  });
});

describe('たきな単騎', () => {
  const input = team([fixedSlot(TAKINA)], 0, false);
  const plan = planTeamRun(input);

  // ゲーム内の 5 秒は 294 フレーム（C-0050）
  it('puts the S1 ATK on self from the first frame for 5 s of game time', () => {
    const pieces = slotPieces(plan, 0).filter((p) => p.effect.stat === 'attack');
    expect(pieces).toHaveLength(1);
    expect(pieces[0]).toMatchObject({ start: 0, end: 294 });
  });
});

const TEAMS: Record<string, TeamInput> = {
  単騎: team([fixedSlot(TAKINA)], 0, false),
  'ラム + デルタ + たきな + I-DOLL・サン': team(
    [fixedSlot(822), fixedSlot(20), fixedSlot(TAKINA), fixedSlot(308)],
    2,
    true,
  ),
};

describe.each(Object.entries(TEAMS))('sim vs calc: %s', (_name, input) => {
  const sim = runSimulation(input);
  const calc = computeTeamDamage(input);
  const plan = planTeamRun(input);

  it('agree exactly on the schedule and the shot-counted groups', () => {
    expect(sim.schedule).toEqual(calc.schedule);
    input.slots.forEach((_, i) => {
      const groups = simGroupTotals(sim, i);
      calc.slots[i]!.segments.forEach((g, j) => {
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
