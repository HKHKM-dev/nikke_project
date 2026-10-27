// ココア（311）を含む編成: 定義はダメージに効く効果を持たない（全スロット noEffect）。射撃の列のグループ分け（V-0031、C-0092）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import { countShotsInRanges } from '../frame/shots.ts';
import { runTeam } from './runTeam.ts';
import { planTeamRun } from '../frame/plan.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import type { CharacterData } from '../types.ts';
import { piecesOf } from './historyHelpers.ts';

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

const COCOA = 311;
// 撮影の計画の編成（ココア + ニヒリスター。V-0031）と、ココアが I の実戦寄りの 5 人
const TEAMS: Record<string, { input: TeamInput; cocoa: number }> = {
  '撮影の計画の編成（ココア + ニヒリスター）': {
    input: team([fixedSlot(COCOA), fixedSlot(261)], 1),
    cocoa: 0,
  },
  '実戦寄り（ココア + クラウン + アリス + 紅蓮BS + モダニア）': {
    input: team([fixedSlot(COCOA), fixedSlot(330), fixedSlot(191), fixedSlot(225), fixedSlot(260)], 2),
    cocoa: 0,
  },
};

describe('ココアの定義', () => {
  it('is defined with notes only (no effects in any slot)', () => {
    const def = parseSkillDefinition(readJson<unknown>(`../../data/skills/${COCOA}.json`));
    for (const slot of ['skill1', 'skill2', 'burst'] as const) {
      expect(def.skills[slot].support).toBe('noEffect');
      expect(def.skills[slot].effects).toEqual([]);
    }
  });
});

describe.each(Object.entries(TEAMS))('編成: %s', (_name, { input, cocoa }) => {
  const calc = runTeam(input);
  const plan = planTeamRun(input);

  it('gives no buff windows or instants from Cocoa (C-0092)', () => {
    expect(piecesOf(plan).filter((w) => w.sourceSlotIndex === cocoa)).toEqual([]);
    expect(plan.instants.filter((e) => e.sourceSlotIndex === cocoa)).toEqual([]);
  });

  it('partitions every shot into exactly one group (start ≤ shot < end)', () => {
    input.slots.forEach((_, i) => {
      const frames = plan.shots[i]!.frames;
      const total = calc.slots[i]!.segments.reduce((sum, g) => sum + countShotsInRanges(frames, g.ranges), 0);
      expect(total).toBe(frames.length);
    });
  });
});
