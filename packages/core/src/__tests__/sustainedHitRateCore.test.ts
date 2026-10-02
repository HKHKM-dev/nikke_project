// 持続の命中率▲をコア命中率に効かせる（C-0170。plan/design-sustained-hit-rate-core.md）。
// V-0074 の 3 本目（録画 118）と同じ編成（モダニア + ドレイク（操作）+ デルタ + リター、条件は自動、BigArms Fire の 3 分モード）で、
//   1. 区間の状態の buffs.hitRate に持続の▲が入り、2 つの▲は和になる
//   2. sim・calc の 1 トリガーの値が、その区間の N で出し直したコア命中率を使う
//   3. 手入力の枠と、持続の▲の無い区間は今までと同じ
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeTeamDamage } from '../calc/model.ts';
import type { EnemyInput } from '../damage.ts';
import { enemyEventsOf, enemyLandingsOf, parseEnemyPresets } from '../enemies.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { coreHitRateWithHitRateUp, landingPartsOf, landingPartsWith, landingTriggerDamage } from '../frame/landing.ts';
import { perShotDamageOf, planTeamRun } from '../frame/plan.ts';
import { runSimulation } from '../sim/engine.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import type { CharacterData } from '../types.ts';
import { gameSecondsToFrames } from '../time.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const master = parseEnemyPresets(readJson<Record<string, unknown>>('../../data/enemies.json'));
const profile = master.targetProfiles.find((p) => p.id === 'range-bigarms')!;
const enemy: EnemyInput = {
  defence: FIXED_SPEC_ENEMY_DEFENCE,
  element: 'Fire',
  hasCore: true,
  events: enemyEventsOf(master, ['range-3min-jump'], 180),
  target: profile,
  landings: enemyLandingsOf(master, ['range-3min-jump'], 180, profile),
};

function fixedSlot(id: number, auto: boolean): TeamSlotInput {
  const character = readJson<CharacterData>(`../../data/characters/${id}.json`);
  const fixed = computeFixedSpecAttack(character);
  return {
    character,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    condition: { coreHitRate: 0.3, distanceBonus: true, fullCharge: true },
    ...(auto ? { conditionMode: 'auto' as const } : {}),
    skills: {
      definition: parseSkillDefinition(readJson<unknown>(`../../data/skills/${id}.json`)),
      levels: MAX_SKILL_LEVELS,
    },
  };
}

// モダニア（260）・ドレイク（101、操作）・デルタ（20）・リター（82）
const team = (auto: boolean): TeamInput => ({
  slots: [fixedSlot(260, auto), fixedSlot(101, auto), fixedSlot(20, auto), fixedSlot(82, auto)],
  enemy,
  durationSeconds: 180,
  burst: true,
  controlledSlot: 1,
});

const LITER = 3;
const MODERNIA_S2 = 0.0856;
const DRAKE_S1 = 0.1185;

describe('持続の命中率▲（C-0170）', () => {
  const input = team(true);
  const plan = planTeamRun(input);
  const sim = runSimulation(input);
  const calc = computeTeamDamage(input);
  const fb = plan.schedule!.fullBurstWindows;
  const nearFb = fb.find((w) =>
    plan.timeline.segments.some((s) => s.start <= w.start && w.start < s.end && s.landing === 'near'),
  )!;
  const segmentAt = (frame: number) => sim.timeline.segments.find((s) => s.start <= frame && frame < s.end)!;

  it('sums the two timed buffs (N = 0.2041 → 0.2644 becomes 0.417)', () => {
    expect(coreHitRateWithHitRateUp(0.2644, MODERNIA_S2 + DRAKE_S1)).toBeCloseTo(0.4174, 4);
  });

  it('puts the timed hit rate into the segment state: both for 10 s, モダニア only to 15 s, none outside', () => {
    expect(nearFb).toBeDefined();
    const n = (frame: number) => segmentAt(frame).slots[LITER]!.buffs.hitRate;
    expect(n(nearFb.start + 10)).toBeCloseTo(MODERNIA_S2 + DRAKE_S1, 9);
    expect(n(nearFb.start + gameSecondsToFrames(12))).toBeCloseTo(MODERNIA_S2, 9);
    expect(n(nearFb.end + 10)).toBe(0);
    expect(plan.landing!.hitRateUp[LITER]).toBe(0);
  });

  it('uses the segment N for the trigger in sim and calc, and keeps the plan value outside the buffs', () => {
    const slot = input.slots[LITER]!;
    const base = { character: slot.character, growth: slot.growth, enemy, attackOverride: slot.attackOverride };
    const frame = nearFb.start + 10;
    const seg = segmentAt(frame);
    const buffs = seg.slots[LITER]!.buffs;
    const parts = landingPartsWith(plan.landing, slot, LITER, seg.landing, buffs.hitRate);
    for (const p of parts) {
      expect(p.condition.coreHitRate).toBe(coreHitRateWithHitRateUp(p.tableCoreHitRate!, MODERNIA_S2 + DRAKE_S1));
    }
    const expected = landingTriggerDamage({ ...base, buffs, perShot: perShotDamageOf(slot) }, parts, true);
    const without = landingTriggerDamage(
      { ...base, buffs, perShot: perShotDamageOf(slot) },
      landingPartsOf(plan.landing, slot, LITER, seg.landing),
      true,
    );
    const simSeg = sim.slots[LITER]!.segments.find((s) => s.start <= frame && frame < s.end)!;
    expect(simSeg.trigger.perTrigger).toBe(expected.perTrigger);
    expect(simSeg.trigger.perTrigger).toBeGreaterThan(without.perTrigger);
    const calcSeg = calc.slots[LITER]!.segments.find((g) => g.ranges.some((r) => r.start <= frame && frame < r.end))!;
    expect(calcSeg.trigger.perTrigger).toBeCloseTo(expected.perTrigger, 9);
    // 持続の▲の外は計画の配分のまま（同じ参照）
    const outside = segmentAt(nearFb.end + 10);
    expect(landingPartsWith(plan.landing, slot, LITER, outside.landing, outside.slots[LITER]!.buffs.hitRate)).toBe(
      landingPartsOf(plan.landing, slot, LITER, outside.landing),
    );
  });

  it('reports the shot-weighted N and the note', () => {
    const summary = calc.slots[LITER]!.autoCondition!;
    expect(summary.timedHitRateUp).toBe(true);
    expect(summary.hitRateUp).toBeGreaterThan(0);
    expect(summary.hitRateUp).toBeLessThan(MODERNIA_S2 + DRAKE_S1);
    expect(sim.slots[LITER]!.autoCondition).toEqual(summary);
    const note = calc.slots[LITER]!.notes.find((x) => x.code === 'auto-condition')!;
    expect(note.message.ja).toContain('C-0170');
  });

  it('leaves manual slots alone: no hit rate split in the keys, same segments as without the target table', () => {
    const manual = team(false);
    const noTarget = { ...manual, enemy: { ...enemy, target: undefined, landings: undefined } };
    const a = runSimulation(manual);
    const b = runSimulation(noTarget);
    expect(a.totalDamage).toBe(b.totalDamage);
    expect(a.timeline.segments.length).toBe(b.timeline.segments.length);
  });
});
