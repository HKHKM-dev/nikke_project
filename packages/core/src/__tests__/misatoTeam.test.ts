// ミサト（833）を含む編成: S1「射撃マニュアル」のスタック（60 発ごとに自分に命中率 5.04%▲・3 スタック・5 秒）が区間の N に入り、
// 条件が自動の枠でコア命中率を C-0036 の式で上げること（C-0183・C-0184。持続の▲の入れ方は C-0170）と、sim と calc の整合。V-0110。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeTeamDamage, countShotsInRanges } from '../calc/model.ts';
import type { EnemyInput } from '../damage.ts';
import { enemyEventsOf, enemyLandingsOf, parseEnemyPresets } from '../enemies.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { coreHitRateWithHitRateUp, landingPartsWith } from '../frame/landing.ts';
import { planTeamRun } from '../frame/plan.ts';
import { runSimulation, simGroupTotals } from '../sim/engine.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import type { CharacterData } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const master = parseEnemyPresets(readJson<Record<string, unknown>>('../../data/enemies.json'));
const profile = master.targetProfiles.find((p) => p.id === 'range-bigarms')!;
const rangeEnemy: EnemyInput = {
  defence: FIXED_SPEC_ENEMY_DEFENCE,
  element: 'Fire',
  hasCore: true,
  events: enemyEventsOf(master, ['range-3min-jump'], 180),
  target: profile,
  landings: enemyLandingsOf(master, ['range-3min-jump'], 180, profile),
};
const plainEnemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: null, hasCore: true };

function fixedSlot(id: number, auto: boolean): TeamSlotInput {
  const character = readJson<CharacterData>(`../../data/characters/${id}.json`);
  const fixed = computeFixedSpecAttack(character);
  return {
    character,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true },
    ...(auto ? { conditionMode: 'auto' as const } : {}),
    skills: {
      definition: parseSkillDefinition(readJson<unknown>(`../../data/skills/${id}.json`)),
      levels: MAX_SKILL_LEVELS,
    },
  };
}

const STACK = 0.0504;

// V-0110 の撮影と同じ: ミサト単騎・AUTO（条件は自動）・オートバースト OFF・BigArms 灼熱の 3 分モード
const SOLO: TeamInput = {
  slots: [fixedSlot(833, true)],
  enemy: rangeEnemy,
  durationSeconds: 180,
  burst: false,
  controlledSlot: 0,
};
// 実戦寄り（リター + ミサト + デルタ + アリス + モダニア）。手入力の条件とバーストあり。クラウンはミサトが居なくても
// sim と calc の差が 5% を超える（クラウン側の差）ので入れない
const PRACTICAL: TeamInput = {
  slots: [
    fixedSlot(82, false),
    fixedSlot(833, false),
    fixedSlot(20, false),
    fixedSlot(191, false),
    fixedSlot(260, false),
  ],
  enemy: plainEnemy,
  durationSeconds: 180,
  burst: true,
  controlledSlot: 1,
};

describe('射撃マニュアルのスタック（ミサト単騎・条件は自動）', () => {
  const plan = planTeamRun(SOLO);
  const sim = runSimulation(SOLO);
  const shots = plan.shots[0]!.frames;
  const segmentAt = (frame: number) => sim.timeline.segments.find((s) => s.start <= frame && frame < s.end)!;
  const n = (frame: number) => segmentAt(frame).slots[0]!.buffs.hitRate;

  it('adds one stack on every 60th shot, up to 3', () => {
    expect(n(shots[58]!)).toBe(0);
    expect(n(shots[60]!)).toBeCloseTo(STACK, 12);
    expect(n(shots[120]!)).toBeCloseTo(2 * STACK, 12);
    expect(n(shots[180]!)).toBeCloseTo(3 * STACK, 12);
    expect(n(shots[300]!)).toBeCloseTo(3 * STACK, 12);
    const max = Math.max(...sim.timeline.segments.map((s) => s.slots[0]!.buffs.hitRate));
    expect(max).toBeCloseTo(3 * STACK, 12);
  });

  it('uses the stacked N for the core hit rate of the trigger (C-0036 の式)', () => {
    const slot = SOLO.slots[0]!;
    const nearShot = shots.find((f) => segmentAt(f).landing === 'near' && n(f) > 3 * STACK - 1e-9)!;
    expect(nearShot).toBeDefined();
    const seg = segmentAt(nearShot);
    const parts = landingPartsWith(plan.landing, slot, 0, seg.landing, seg.slots[0]!.buffs.hitRate);
    for (const p of parts) {
      expect(p.condition.coreHitRate).toBeCloseTo(coreHitRateWithHitRateUp(p.tableCoreHitRate!, 3 * STACK), 12);
    }
    expect(coreHitRateWithHitRateUp(0.2644, 3 * STACK)).toBeCloseTo(0.367, 3);
  });

  it('reports the shot-weighted N below 3 stacks (the first 180 shots and the rebuilds after the jumps)', () => {
    const calc = computeTeamDamage(SOLO);
    const summary = calc.slots[0]!.autoCondition!;
    expect(summary.timedHitRateUp).toBe(true);
    expect(summary.hitRateUp).toBeGreaterThan(2 * STACK);
    expect(summary.hitRateUp).toBeLessThan(3 * STACK);
  });
});

describe.each([
  ['ミサト単騎（V-0110 の撮影の条件）', SOLO],
  ['実戦寄り（リター + ミサト + デルタ + アリス + モダニア）', PRACTICAL],
] as const)('sim vs calc: %s', (_name, input) => {
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

  it('partitions every shot into exactly one group', () => {
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
