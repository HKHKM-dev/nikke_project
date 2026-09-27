// アスカ（830）を含む編成: 吸収回復で S1 が延びる窓・灼熱の味方だけのコアダメージ▲・sim と calc の整合（plan/design-asuka.md 5 節）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { runSimulation, simGroupTotals } from '../sim/engine.ts';
import { runFirstPass } from '../frame/firstPass.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import { computeTeamDamage, countShotsInRanges } from '../calc/model.ts';
import { planTeamRun } from '../frame/plan.ts';
import { toTimelineSlots, type TeamInput, type TeamSlotInput } from '../team.ts';
import type { CharacterData } from '../types.ts';
import { gameSecondsToFrames } from '../time.ts';

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

const REC063 = team([fixedSlot(304), fixedSlot(20), fixedSlot(830)], 2);
// 順位（アリスの S1。topAttack）が S1 の攻撃力▲の窓を見るので、1 パス目のループの回復も通る
const PRACTICAL = team([fixedSlot(82), fixedSlot(330), fixedSlot(830), fixedSlot(191), fixedSlot(172)], 2);
const TEAMS: Record<string, TeamInput> = {
  '録画 063 の編成（フラワー + デルタ + アスカ）': REC063,
  '実戦寄り（リター + クラウン + アスカ + アリス + アドミ）': PRACTICAL,
};

describe('録画 063 の編成の窓（4 節）', () => {
  const plan = planTeamRun(REC063);
  const ASUKA = 2;
  const windowsOf = (slotIndex: number, stat: string) =>
    plan.timeline.windows.filter((w) => w.slotIndex === slotIndex && w.effect.stat === stat);

  it('extends S1 until 25 s after the heal of the last shot in each lifesteal window', () => {
    const activations = plan.schedule!.activations.filter((a) => a.slotIndex === ASUKA).map((a) => a.frame);
    const shots = plan.shots[ASUKA]!.frames;
    const window = gameSecondsToFrames(10);
    const s1 = gameSecondsToFrames(25);
    const expected = activations.flatMap((a) => {
      const inWindow = shots.filter((f) => a <= f && f < a + window);
      if (inWindow.length === 0) return [];
      return [{ start: inWindow[0]! + 1, end: Math.min(inWindow[inWindow.length - 1]! + 1 + s1, plan.frames) }];
    });
    const s1Windows = windowsOf(ASUKA, 'attack').map((w) => ({ start: w.start, end: w.end }));
    expect(s1Windows).toEqual(expected);
    // 次のバーストまで S1 が切れる（1 回の回復なら約 16 秒切れる。ここでは 10 秒未満）
    s1Windows.slice(0, -1).forEach((w, k) => {
      const gap = activations[k + 1]! - w.end;
      expect(gap).toBeGreaterThan(0);
      expect(gap).toBeLessThan(gameSecondsToFrames(10));
    });
  });

  it('gives the core damage only to the fire ally (Asuka), not to the wind allies', () => {
    expect(windowsOf(ASUKA, 'coreDamage').length).toBeGreaterThan(0);
    expect(windowsOf(0, 'coreDamage')).toEqual([]);
    expect(windowsOf(1, 'coreDamage')).toEqual([]);
  });

  it('records lifesteal heals only for Asuka and keeps them out of the instants', () => {
    const heals = plan.timeline.heals;
    expect(heals.length).toBeGreaterThan(100);
    expect(heals.every((h) => h.sourceSlotIndex === ASUKA && h.slotIndex === ASUKA)).toBe(true);
    expect(plan.instants).toEqual([]);
  });
});

describe('1 パス目のループの回復（2.1 節の実装 2）', () => {
  it('tracks the same S1 windows for the ranking as planBuffTimeline (lifesteal heals in the loop)', () => {
    const plan = planTeamRun(PRACTICAL);
    const first = runFirstPass(toTimelineSlots(PRACTICAL.slots), {
      frames: plan.frames,
      burst: true,
      controlledSlot: 2,
    });
    const key = (w: { slotIndex: number; start: number; end: number }) => `${w.slotIndex}:${w.start}-${w.end}`;
    const asukaS1 = (w: { effect: { source: { resourceId: number }; stat: string } }) =>
      w.effect.source.resourceId === 830 && w.effect.stat === 'attack';
    const loop = first.rankAttackWindows.filter(asukaS1);
    expect(loop.length).toBeGreaterThan(0);
    expect(loop.map(key).sort()).toEqual(plan.timeline.windows.filter(asukaS1).map(key).sort());
  });
});

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
