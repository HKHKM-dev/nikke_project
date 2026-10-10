// イサベル（231）を含む編成: バーストの段階 1 の受けるダメージ▲（2 回目の発動から 5 秒。V-0075）。
// sim と calc の整合と、▲の窓・掛かる先（C-0160〜C-0163）、着弾の遅れ（C-0165。plan/design-burst-landing.md）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { MEASURED_BURST_DELAYS } from '../burst/landing.ts';
import { activationFramesOfSlot, effectFrameOf, hexagonFrameOf, hitFrameOf } from '../burst/schedule.ts';
import { runSimulation, simGroupTotals } from '../sim/engine.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import { computeTeamDamage, countShotsInRanges } from '../calc/model.ts';
import { planTeamRun } from '../frame/plan.ts';
import { gameSecondsToFrame } from '../time.ts';
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

function team(ids: number[], controlledSlot: number): TeamInput {
  return { slots: ids.map(fixedSlot), enemy, durationSeconds: 180, burst: true, controlledSlot };
}

const ISABEL = 231;
// 録画 038 の編成と、イサベルが III の実戦寄りの 5 人（Stage 8 の編成）
const TEAMS: Record<string, { input: TeamInput; isabel: number }> = {
  '録画 038 の編成（ラム + デルタ + イサベル）': { input: team([822, 20, ISABEL], 2), isabel: 2 },
  '実戦寄り（エーテル + デルタ + イサベル + ドレイク + クイーン（真））': {
    input: team([291, 20, ISABEL, 101, 870], 2),
    isabel: 2,
  },
};

describe('イサベルの定義', () => {
  it('has the burst skill damage, the tier 1 damage taken up from the 2nd use and the tier 2 / 3 damage', () => {
    const def = parseSkillDefinition(readJson<unknown>(`../../data/skills/${ISABEL}.json`));
    expect(def.skills.burst.support).toBe('supported');
    expect(def.skills.burst.sequential).toBe(true);
    expect(def.skills.burst.effects).toMatchObject([
      { kind: 'burstDamage' },
      { kind: 'timed', trigger: { count: 'burstUse', atLeast: 2 }, target: 'allies', stat: 'damageTaken' },
      { kind: 'damage', trigger: { count: 'burstUse', atLeast: 3 } },
      { kind: 'damage', trigger: { count: 'burstUse', atLeast: 4 } },
    ]);
  });
});

describe.each(Object.entries(TEAMS))('sim vs calc: %s', (_name, { input, isabel }) => {
  const sim = runSimulation(input);
  const calc = computeTeamDamage(input);
  const plan = planTeamRun(input);
  const uses = activationFramesOfSlot(plan.schedule!, isabel);
  const mine = plan.schedule!.activations.filter((a) => a.slotIndex === isabel);
  const lands = mine.map(effectFrameOf);
  const windows = plan.timeline.windows.filter((w) => w.effect.stat === 'damageTaken');

  it('lands the burst skill damage and fires the burst effects 134 frames after each use (C-0165)', () => {
    const delays = MEASURED_BURST_DELAYS.find((row) => row.resourceIds.includes(ISABEL))!.delays;
    expect(delays).toEqual({ hitFrames: 134, effectFrames: 134 });
    // III の遅れは III のタイマーの 00.00（本当の発動の 6f 後。plan/design-burst-hit-origin.md 8 節）から
    for (const a of mine) {
      expect(hexagonFrameOf(a)).toBe(a.frame + 6);
      expect(hitFrameOf(a)).toBe(a.frame + 6 + 134);
      expect(effectFrameOf(a)).toBe(a.frame + 6 + 134);
    }
    // ほかの枠の発動は遅れない
    for (const a of plan.schedule!.activations.filter((x) => x.slotIndex !== isabel)) {
      expect(a.hitFrame).toBeUndefined();
      expect(a.effectFrame).toBeUndefined();
    }
  });

  it('raises the damage taken by 39.96% for 5 s from the 2nd landing of Isabel, for every slot (C-0160〜C-0162)', () => {
    expect(uses.length).toBeGreaterThan(2);
    expect(new Set(windows.map((w) => w.start))).toEqual(new Set(lands.slice(1).filter((f) => f < plan.frames)));
    for (const w of windows) {
      expect(w.effect.value).toBeCloseTo(0.3996, 10);
      expect(w.end - w.start).toBe(gameSecondsToFrame(5));
    }
    for (const segment of plan.timeline.segments) {
      const inside = windows.some((w) => w.start <= segment.start && segment.start < w.end);
      for (const state of segment.slots) expect(state?.buffs.damageTaken ?? 0).toBeCloseTo(inside ? 0.3996 : 0, 10);
    }
  });

  it('puts the damage taken up of the same landing on tier 2 / 3 damage but not on the burst skill damage (C-0161, C-0163)', () => {
    const burstHits = sim.slots[isabel]!.burst.hits;
    expect(burstHits).toHaveLength(lands.filter((f) => f < plan.frames).length);
    for (const h of burstHits) expect(h.damageTakenMultiplier).toBe(1);
    const tierHits = plan.skillHits.filter((h) => h.slotIndex === isabel && h.effect.source.skill === 'burst');
    expect(tierHits.length).toBeGreaterThan(0);
    for (const h of tierHits) {
      expect(lands).toContain(h.frame);
      expect(h.hit.damageTakenMultiplier).toBeCloseTo(1.3996, 10);
    }
  });

  it('keeps the S1 attack of the same landing off the tier 2 damage of the 3rd use (C-0163)', () => {
    const third = plan.skillHits.find((h) => h.slotIndex === isabel && h.effect.source.skill === 'burst')!;
    expect(third.frame).toBe(lands[2]);
    const at = (f: number) => plan.timeline.segments.find((g) => g.start <= f && f < g.end)!.slots[isabel]!.buffs;
    // S1 の段階 3 の攻撃力は 3 回目の効果の発火から付くが、同じ発動の段階 2 の追加ダメージは発火の直前のバフで計算する
    expect(at(third.frame).attackRatio - at(third.frame - 1).attackRatio).toBeCloseTo(0.1728, 10);
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
