// 一本化の段 A-1（plan/design-unify-sim-calc.md 5.1 節。2026-10-27 オーナー決定）: calc は全枠・全グループで通常攻撃のトリガー数を
// 1 パス目の射撃の列から数え、通常攻撃も sim と一致する。2026-10-27 まではハイブリッド（plan/design-stage10.md 5 節。持続の
// 射撃バフが掛かっているグループだけ数え、ほかは平均レート × 秒数）で、LRNAM のリターの枠が sim より 2.5% 以上小さかった
// （plan/design-calc-hybrid.md 1.2 節。窓がマガジンの位相を固定するので、長くしても縮まない偏り）。
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

// 2026-09-28 の起票の編成（リター + ニヒリスター + アリス + 紅蓮BS + モダニア）。リターの S1 の最大装弾数▲は味方全体で、全枠が窓を持つ
const LRNAM = team([fixedSlot(82), fixedSlot(261), fixedSlot(191), fixedSlot(225), fixedSlot(260)], 2);
// 録画 0037: 窓を持つのはドレイク（バーストの自分への最大装弾数▲）だけ
const REC37 = team([fixedSlot(822), fixedSlot(20), fixedSlot(101, 3)], 2);
// Stage 8 の 5 人: 射撃の窓が 1 つも掛からない
const STAGE8 = team([fixedSlot(291), fixedSlot(20), fixedSlot(231), fixedSlot(101), fixedSlot(870)], 2);

const relDiff = (a: number, b: number) => (a - b) / b;

describe('calc は全枠・全グループを射撃の列から数える（一本化の段 A-1）', () => {
  it.each([
    ['LRNAM（全枠が窓を持つ）', LRNAM],
    ['録画 0037（窓を持つのはドレイクだけ）', REC37],
    ['Stage 8 の 5 人（窓なし）', STAGE8],
  ] as const)('%s: 全グループが shots で、グループの発数・枠の合計・編成の合計が sim と一致する', (_, input) => {
    const calc = computeTeamDamage(input);
    const sim = runSimulation(input);
    for (let i = 0; i < input.slots.length; i++) {
      const c = calc.slots[i]!;
      expect(
        c.segments.every((g) => g.triggerSource === 'shots'),
        `slot ${i}`,
      ).toBe(true);
      expect(c.segments.map((g) => g.triggers)).toEqual(simGroupTotals(sim, i).map((g) => g.triggers));
      // 区間は [0, frames) を隙間なく覆うので、全グループの発数の和は射撃の列の長さ
      expect(c.segments.reduce((n, g) => n + g.triggers, 0)).toBe(sim.shots[i]!.frames.length);
      // 残るのは浮動小数点の加算順の違いだけ（plan/design-unify-sim-calc.md 4.2 節）
      expect(relDiff(sim.slots[i]!.totalDamage, c.totalDamage), `slot ${i}`).toBeCloseTo(0, 9);
    }
    expect(relDiff(sim.totalDamage, calc.totalDamage)).toBeCloseTo(0, 9);
  });
});
