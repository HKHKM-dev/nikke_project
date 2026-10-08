// プリバティ：アンカインド・メイド（313）を含む編成: S1 のペレット 30 個ごとの倍率ダメージ（回数トリガー pelletHit。
// plan/design-pellet-hit.md、C-0408）。sim と calc の整合と、S1 の発火が当たったペレットの期待値の累計で決まること。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { runSimulation, simGroupTotals } from '../sim/engine.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import { computeTeamDamage } from '../calc/model.ts';
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

const PRIVATY_UM = 313;
// 撮影の編成（単騎。V-0374）と、プリバティ：アンカインド・メイドが III の実戦寄りの 5 人
const TEAMS: Record<string, { input: TeamInput; privaty: number }> = {
  '撮影の編成（プリバティ：アンカインド・メイド単騎）': { input: team([fixedSlot(PRIVATY_UM)], 0), privaty: 0 },
  '実戦寄り（リター + クラウン + プリバティ：アンカインド・メイド + アリス + ドレイク）': {
    input: team([fixedSlot(82), fixedSlot(330), fixedSlot(PRIVATY_UM), fixedSlot(191), fixedSlot(101)], 2),
    privaty: 2,
  },
};

describe.each(Object.entries(TEAMS))('sim vs calc: %s', (_name, { input, privaty }) => {
  const sim = runSimulation(input);
  const calc = computeTeamDamage(input);
  const plan = planTeamRun(input);

  it('fires S1 on the shots where the expected pellet hits reach a multiple of 30 (C-0408)', () => {
    const log = plan.shots[privaty]!;
    const s1 = plan.skillHits.filter((h) => h.slotIndex === privaty && h.effect.source.skill === 'skill1');
    let total = 0;
    const expected: number[] = [];
    log.frames.forEach((f, k) => {
      const next = total + log.pelletHits![k]!;
      if (Math.floor(next / 30 + 1e-9) > Math.floor(total / 30 + 1e-9)) expected.push(f);
      total = next;
    });
    expect(s1.length).toBeGreaterThan(10);
    expect(s1.map((h) => h.frame)).toEqual(expected);
    // SG の 1 発は 10 ペレット × 当たった割合（手入力の弾丸命中率 1 × 置き値 0.75）
    expect(new Set(log.pelletHits)).toEqual(new Set([7.5]));
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

  it('stays within 5% per slot and 3% for the team', () => {
    expect(Math.abs(sim.totalDamage - calc.totalDamage) / calc.totalDamage).toBeLessThan(0.03);
    input.slots.forEach((_, i) => {
      const s = sim.slots[i]!.totalDamage;
      const c = calc.slots[i]!.totalDamage;
      expect(Math.abs(s - c) / c).toBeLessThan(0.05);
    });
  });
});
