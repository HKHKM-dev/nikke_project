// 語彙はあるのに撮っていない効果の撮影（plan/design-skill-unrecorded.md）で定義したキャラを含む編成。撮った編成（3 節の撮り方 A〜E・G）で、
// sim と calc が整合する。定義の形（遅れの表の行・同じ発動の▲の印）も見る。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { runSimulation, simGroupTotals } from '../sim/engine.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import { computeTeamDamage, countShotsInRanges } from '../calc/model.ts';
import { planTeamRun } from '../frame/plan.ts';
import { burstDelaysOf, sameActivationBuffsOnHit } from '../burst/landing.ts';
import type { SlotCondition, TeamInput, TeamSlotInput } from '../team.ts';
import type { CharacterData } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const DEFINED = new Set(readJson<{ resourceIds: number[] }>('../../data/skills/index.json').resourceIds);
const character = (id: number) => readJson<CharacterData>(`../../data/characters/${id}.json`);
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
const team = (ids: number[], controlledSlot: number): TeamInput => ({
  slots: ids.map(fixedSlot),
  enemy,
  durationSeconds: 180,
  burst: true,
  controlledSlot,
});

describe('遅れの表の行', () => {
  it('puts the burst hits at the measured delays and marks the same-activation buffs', () => {
    expect(burstDelaysOf(character(190))).toMatchObject({ hitFrames: 73 });
    expect(burstDelaysOf(character(60))).toMatchObject({ hitFrames: 16 });
    expect(burstDelaysOf(character(313))).toMatchObject({ hitFrames: 26, hitOffsets: [0, 21] });
    expect(burstDelaysOf(character(90))).toMatchObject({ effectFrames: 20 });
    expect(sameActivationBuffsOnHit(character(103))).toBe(true);
    expect(sameActivationBuffsOnHit(character(313))).toBe(true);
    expect(sameActivationBuffsOnHit(character(190))).toBe(false);
  });
});

const TEAMS: Record<string, TeamInput> = {
  'A: ナガ + I-DOLL・サン + ラム': team([450, 308, 822], 2),
  'B: ルドミラ + ベロータ + ラプラス：アルティメットヒーロー + プリバティ：アンカインド・メイド': team(
    [190, 60, 103, 313],
    2,
  ),
  'C: デルタ + I-DOLL・サン + プロダクト08': team([20, 308, 302], 2),
  'D: デルタ + I-DOLL・サン + ラプンツェル：ピュアグレイス': team([20, 308, 226], 2),
  'E: エマ + アスカ': team([90, 830], 0),
  'F: ラム + I-DOLL・サン + ブラン + アスカ': team([822, 308, 270, 830], 2),
  'G: ナガ + アスカ': team([450, 830], 1),
};

describe.each(Object.entries(TEAMS))('sim vs calc: %s', (_name, input) => {
  const sim = runSimulation(input);
  const calc = computeTeamDamage(input);
  const plan = planTeamRun(input);

  it('agree exactly on the schedule, the bursts and the shot-counted groups', () => {
    expect(sim.schedule).toEqual(calc.schedule);
    input.slots.forEach((_, i) => {
      const s = sim.slots[i]!;
      const c = calc.slots[i]!;
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
