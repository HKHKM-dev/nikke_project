// ヘルム（352）を含む編成: 宝物版（段階 3）の即時のゲージのチャージ・「10 発間維持」のチャージダメージ倍率▲・sim と calc の整合
// （plan/design-helm.md、V-0033）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { runSimulation, simGroupTotals } from '../sim/engine.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import type { TreasurePhase } from '../skills/treasure.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import { hexagonFrameOf } from '../burst/schedule.ts';
import { computeTeamDamage, countShotsInRanges } from '../calc/model.ts';
import { burstHitBuffs, burstSnapshotState, planTeamRun } from '../frame/plan.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import type { CharacterData } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const DEFINED = new Set(readJson<{ resourceIds: number[] }>('../../data/skills/index.json').resourceIds);
const character = (id: number) => readJson<CharacterData>(`../../data/characters/${id}.json`);

function fixedSlot(id: number, treasurePhase: TreasurePhase = 0): TeamSlotInput {
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
      treasurePhase,
    };
  }
  return slot;
}

const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: null, hasCore: true };

function team(slots: TeamSlotInput[], controlledSlot: number): TeamInput {
  return { slots, enemy, durationSeconds: 180, burst: true, controlledSlot };
}

const HELM = 352;
const rec079 = (phase: TreasurePhase) => team([fixedSlot(822), fixedSlot(20), fixedSlot(HELM, phase)], 2);
const TEAMS: Record<string, { input: TeamInput; helm: number }> = {
  '録画 079 の編成（ラム + デルタ + ヘルム・宝物 3）': { input: rec079(3), helm: 2 },
  '実戦寄り（リター + クラウン + ヘルム・宝物 3 + アリス + アドミ）': {
    input: team([fixedSlot(82), fixedSlot(330), fixedSlot(HELM, 3), fixedSlot(191), fixedSlot(172)], 2),
    helm: 2,
  },
};

describe('録画 079 の編成（V-0033）', () => {
  const plan = planTeamRun(rec079(3));
  const HELM_SLOT = 2;

  it('charges the gauge once per Helm full charge shot, on the same frame (C-0094, V-0034)', () => {
    const charges = plan.instants.filter((x) => x.effect.kind === 'burstGauge');
    expect(charges.map((x) => x.frame)).toEqual(plan.shots[HELM_SLOT]!.frames);
    expect(charges.every((x) => x.sourceSlotIndex === HELM_SLOT && x.amount === charges[0]!.amount)).toBe(true);
  });

  it('fills the gauge earlier than without the treasure (the charge adds to the shots)', () => {
    const without = planTeamRun(rec079(0));
    expect(plan.schedule!.gaugeFullFrames[0]!).toBeLessThan(without.schedule!.gaugeFullFrames[0]!);
  });

  it('keeps the charge damage multiplier for exactly 10 Helm shots after each burst (C-0099)', () => {
    const shots = plan.shots[HELM_SLOT]!.frames;
    const windows = plan.timeline.windows.filter(
      (w) => w.slotIndex === HELM_SLOT && w.effect.stat === 'chargeDamageMultiplier',
    );
    const uses = plan.schedule!.activations.filter((a) => a.slotIndex === HELM_SLOT).map((a) => a.frame);
    expect(windows.map((w) => w.start)).toEqual(uses);
    for (const w of windows) {
      const inside = shots.filter((f) => w.start <= f && f < w.end).length;
      if (w.end < plan.frames) {
        expect(inside).toBe(10);
        expect(shots).toContain(w.end - 1); // 10 発目のフレームまで
      } else {
        expect(inside).toBeLessThanOrEqual(10);
      }
    }
  });
});

describe('録画 079 の編成: バーストのヒットの遅れ（C-0167）', () => {
  const input = rec079(3);
  const sim = runSimulation(input);
  const calc = computeTeamDamage(input);
  const HELM_SLOT = 2;

  it('lands the burst 59 frames after 00.00 of each use (6 frames after the activation), inside the full burst', () => {
    const uses = sim.schedule!.activations.filter((a) => a.slotIndex === HELM_SLOT);
    expect(uses.length).toBeGreaterThan(0);
    // III の遅れは III のタイマーの 00.00（本当の発動の 6f 後。plan/design-burst-hit-origin.md 8 節）から
    expect(uses.every((a) => hexagonFrameOf(a) === a.frame + 6)).toBe(true);
    expect(sim.slots[HELM_SLOT]!.burst.activations).toEqual(
      uses.map((a) => hexagonFrameOf(a) + 59).filter((f) => f < sim.frames),
    );
  });

  it('fixes the caster-side buffs at the use: the full burst attack damage of S2 is not on the hit (079-07)', () => {
    const plan = planTeamRun(input);
    const uses = plan.schedule!.activations.filter((a) => a.slotIndex === HELM_SLOT && a.frame + 59 < plan.frames);
    expect(uses.length).toBeGreaterThan(0);
    for (const a of uses) {
      const atHit = burstSnapshotState(plan.timeline, a.frame + 59, HELM_SLOT, true).buffs;
      const used = burstHitBuffs(plan.timeline, a.frame, a.frame + 59, HELM_SLOT, true);
      // ヒットの時点ではフルバーストの S2 の攻撃ダメージ▲が付いているが、ヒットには発動の直前のバフを使う
      expect(atHit.attackDamage).toBeGreaterThan(used.attackDamage);
      expect(used).toEqual(burstSnapshotState(plan.timeline, a.frame, HELM_SLOT, true).buffs);
    }
    expect(calc.slots[HELM_SLOT]!.burst.totalDamage).toBe(sim.slots[HELM_SLOT]!.burst.damage);
  });
});

describe('ヘルム単騎（録画 082 の編成。V-0034）', () => {
  it('fills the gauge on the frame of the 3rd shot: 14.0% + charge 14.31% + additional damage hit 5.6% per shot (C-0103, V-0034)', () => {
    const plan = planTeamRun(team([fixedSlot(HELM, 3)], 0));
    const shots = plan.shots[0]!.frames;
    expect(plan.schedule!.gaugeFullFrames[0]).toBe(shots[2]!);
  });
});

describe.each(Object.entries(TEAMS))('sim vs calc: %s', (_name, { input, helm }) => {
  const sim = runSimulation(input);
  const calc = computeTeamDamage(input);
  const plan = planTeamRun(input);

  it('gives the normal crit rate to allies and the charge damage multiplier only to Helm', () => {
    const crit = plan.timeline.windows.filter((w) => w.sourceSlotIndex === helm && w.effect.stat === 'normalCritRate');
    expect(new Set(crit.map((w) => w.slotIndex)).size).toBe(input.slots.length);
    const charge = plan.timeline.windows.filter((w) => w.effect.stat === 'chargeDamageMultiplier');
    expect(charge.length).toBeGreaterThan(0);
    expect(charge.every((w) => w.slotIndex === helm)).toBe(true);
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
