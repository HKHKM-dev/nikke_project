// シンデレラ（511）を含む編成。S1 のフルチャージ攻撃の命中時の追加ダメージ（射撃ごとの倍率ダメージ。C-0583。V-0445）。
// 2 段目の段 6（plan/design-skill-stage6.md 2.4 節）の PR 2 の前に、撮影の要らない分を分けて定義した。sim と calc の整合
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeTeamDamage, countShotsInRanges } from '../calc/model.ts';
import type { EnemyInput } from '../damage.ts';
import { computeFixedSpecAttack, computeFixedSpecHp, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { planTeamRun } from '../frame/plan.ts';
import { runSimulation, simGroupTotals } from '../sim/engine.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import type { CharacterData } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const CINDERELLA = 511;
const RAM = 822;
const DELTA = 20;
const character = (id: number) => readJson<CharacterData>(`../../data/characters/${id}.json`);
const definitionOf = (id: number) => parseSkillDefinition(readJson<unknown>(`../../data/skills/${id}.json`));

function fixedSlot(id: number): TeamSlotInput {
  const c = character(id);
  const fixed = computeFixedSpecAttack(c);
  return {
    character: c,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    hpOverride: computeFixedSpecHp(c),
    condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true },
    skills: { definition: definitionOf(id), levels: MAX_SKILL_LEVELS },
  };
}

const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: 'Fire', hasCore: true };
const team = (ids: number[], burst: boolean, controlledSlot: number): TeamInput => ({
  slots: ids.map(fixedSlot),
  enemy,
  durationSeconds: 180,
  burst,
  controlledSlot,
});

describe('シンデレラの定義', () => {
  it('defines the additional damage of S1 on every full charge shot (C-0583)', () => {
    const def = definitionOf(CINDERELLA);
    expect(def.skills.skill1.effects).toMatchObject([
      {
        kind: 'damage',
        trigger: { count: 'fullChargeShot' },
        damageType: 'additional',
        ref: 4,
        claims: ['C-0583'],
      },
    ]);
    // バーストゲージを溜めるかは確かめていない（溜めない。gaugeHits を書かない）
    expect(def.skills.skill1.effects[0]).not.toHaveProperty('gaugeHits');
    expect(def.skills.skill1.support).toBe('partial');
  });

  it('adds (attack − defence) × 136.6% to every full charge shot of the solo recordings (V-0445)', () => {
    const calc = computeTeamDamage(team([CINDERELLA], false, 0));
    const c = character(CINDERELLA);
    const expected = (computeFixedSpecAttack(c).attack - FIXED_SPEC_ENEMY_DEFENCE) * 1.366;
    for (const s of calc.slots[0]!.segments) {
      expect(s.trigger.perShot / s.trigger.hitRate).toBeGreaterThan(0);
    }
    const t = calc.slots[0]!.segments[0]!.trigger;
    // 1 発あたりの射撃ごとの倍率ダメージ（会心の期待値込み）を、会心なしの値に戻す
    expect(t.perShot / t.hitRate / (1 + t.boost.crit + t.boost.fullBurst)).toBeCloseTo(expected, 3);
  });
});

describe.each([
  ['シンデレラ単騎（録画 124 の編成）', team([CINDERELLA], false, 0)],
  ['ラム + デルタ + シンデレラ（段 6 の PR 2 の撮影の編成）', team([RAM, DELTA, CINDERELLA], true, 2)],
])('sim vs calc: %s', (_name, input) => {
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
