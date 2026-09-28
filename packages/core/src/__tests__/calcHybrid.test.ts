// calc のハイブリッドの限界と案 (b) の試作（plan/design-calc-hybrid.md）。既定の calc（'hybrid'）は変えず、
// options.shotCounting = 'firingSlots' のときだけ「射撃の窓を持つ枠は全グループを射撃の列から数える」。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { runSimulation, simGroupTotals } from '../sim/engine.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import type { TreasurePhase } from '../skills/treasure.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import { computeTeamDamage } from '../calc/model.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import type { CharacterData } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const DEFINED = new Set(readJson<{ resourceIds: number[] }>('../../data/skills/index.json').resourceIds);

function fixedSlot(id: number, treasurePhase: TreasurePhase = 0): TeamSlotInput {
  const character = readJson<CharacterData>(`../../data/characters/${id}.json`);
  const fixed = computeFixedSpecAttack(character);
  const slot: TeamSlotInput = {
    character,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true },
  };
  if (DEFINED.has(id)) {
    slot.skills = {
      definition: parseSkillDefinition(readJson<unknown>(`../../data/skills/${id}.json`)),
      levels: MAX_SKILL_LEVELS,
      treasurePhase,
    };
  }
  return slot;
}

const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: null, hasCore: true };

function team(slots: TeamSlotInput[], controlledSlot: number): TeamInput {
  return { slots, enemy, durationSeconds: 180, burst: true, controlledSlot };
}

// roadmap の起票の編成（リター + ニヒリスター + アリス + 紅蓮BS + モダニア）。リターの S1 の最大装弾数▲は味方全体なので、全枠が窓を持つ
const LRNAM = team([fixedSlot(82), fixedSlot(261), fixedSlot(191), fixedSlot(225), fixedSlot(260)], 2);
// 録画 37: 窓を持つのはドレイク（バーストの自分への最大装弾数▲）だけ
const REC37 = team([fixedSlot(822), fixedSlot(20), fixedSlot(101, 3)], 2);
// Stage 8 の 5 人: 射撃の窓が 1 つも掛からない
const STAGE8 = team([fixedSlot(291), fixedSlot(20), fixedSlot(231), fixedSlot(101), fixedSlot(870)], 2);

const relDiff = (a: number, b: number) => (a - b) / b;

describe('calc のハイブリッド: 既定は変えない', () => {
  it.each([
    ['LRNAM', LRNAM],
    ['録画 37', REC37],
  ] as const)('%s: 省略と hybrid は同じ結果', (_, input) => {
    expect(computeTeamDamage(input)).toEqual(computeTeamDamage(input, { shotCounting: 'hybrid' }));
  });

  it('LRNAM: 既定ではリターの枠が sim より 4% 以上小さい（窓の後の平均レートの区間。roadmap の起票の現象）', () => {
    const calc = computeTeamDamage(LRNAM);
    const sim = runSimulation(LRNAM);
    const litter = calc.slots[0]!;
    expect(litter.segments.some((g) => g.triggerSource === 'average')).toBe(true);
    expect(relDiff(sim.slots[0]!.totalDamage, litter.totalDamage)).toBeGreaterThan(0.04);
  });
});

describe('案 (b)（shotCounting: firingSlots）', () => {
  it('窓を持つ枠は全グループを射撃の列から数え、sim と一致する', () => {
    const calc = computeTeamDamage(LRNAM, { shotCounting: 'firingSlots' });
    const sim = runSimulation(LRNAM);
    for (let i = 0; i < 5; i++) {
      const c = calc.slots[i]!;
      expect(
        c.segments.every((g) => g.triggerSource === 'shots'),
        `slot ${i}`,
      ).toBe(true);
      expect(c.segments.map((g) => g.triggers)).toEqual(simGroupTotals(sim, i).map((g) => g.triggers));
      expect(relDiff(sim.slots[i]!.totalDamage, c.totalDamage), `slot ${i}`).toBeCloseTo(0, 9);
    }
  });

  it('窓を持たない枠は既定と同じ（平均レートのまま）', () => {
    const hybrid = computeTeamDamage(REC37);
    const b = computeTeamDamage(REC37, { shotCounting: 'firingSlots' });
    for (const i of [0, 1]) {
      expect(b.slots[i]!.segments.every((g) => g.triggerSource === 'average')).toBe(true);
      // share は編成の合計で割るので変わる。枠の中身だけ比べる
      expect(b.slots[i]!.segments).toEqual(hybrid.slots[i]!.segments);
      expect(b.slots[i]!.totalDamage).toBe(hybrid.slots[i]!.totalDamage);
    }
    // ドレイクは窓の外のグループも数える
    expect(hybrid.slots[2]!.segments.map((g) => g.triggerSource)).toContain('average');
    expect(b.slots[2]!.segments.every((g) => g.triggerSource === 'shots')).toBe(true);
  });

  it('射撃の窓が 1 つも無い編成では既定と同じ結果', () => {
    expect(computeTeamDamage(STAGE8, { shotCounting: 'firingSlots' })).toEqual(computeTeamDamage(STAGE8));
  });
});
