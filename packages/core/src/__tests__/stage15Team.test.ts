// Stage 15: 実戦との突き合わせの入力（plan/design-stage12.md 5.2 節）。命中率（SlotCondition.hitRate）の退化と掛かり方、敵のプリセット。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SG_PELLET_GAUGE_HIT_RATE, energyPerTrigger } from '../burst/dynamic.ts';
import { computeTriggerDamage, conditionNotes, type EnemyInput } from '../damage.ts';
import { enemyInputOf, matchingEnemyPreset, parseEnemyPresets } from '../enemies.ts';
import { FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { runSimulation } from '../sim/engine.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import type { SkillDefinition } from '../skills/types.ts';
import { computeTeamDamage, type SlotCondition, type TeamInput, type TeamSlotInput } from '../team.ts';
import type { SkillRaw } from '../types.ts';
import { makeCharacter } from './fixtures.ts';

const enemy: EnemyInput = { defence: 100, element: 'Wind', hasCore: true };
const growth = { level: 1, grade: 0, core: 0 };
const tenLevels = (v: string) => Array.from({ length: 10 }, () => v);
const empty: SkillRaw = { id: 0, name: { ja: '', en: '' }, description: { ja: '', en: '' }, values: [] };

/** バーストスキル（倍率 300%）を持つ AR。hitRate は条件に入れる */
function slot(resourceId: number, burstStep: 'Step1' | 'Step2' | 'Step3', condition: Partial<SlotCondition> = {}) {
  const burst: SkillRaw = { ...empty, id: resourceId * 10 + 3, values: [tenLevels('300')] };
  const character = makeCharacter({}, { resourceId, burstStep, skills: { skill1: empty, skill2: empty, burst } });
  const definition: SkillDefinition = {
    formatVersion: 1,
    resourceId,
    checkedAt: '2026-09-24',
    skills: {
      skill1: { support: 'unsupported', effects: [] },
      skill2: { support: 'unsupported', effects: [] },
      burst: { support: 'supported', effects: [{ kind: 'burstDamage', ref: 1, damageType: 'skill' }] },
    },
  };
  const input: TeamSlotInput = {
    character,
    growth,
    attackOverride: 10000,
    condition: { coreHitRate: 0.5, distanceBonus: false, fullCharge: true, ...condition },
    skills: { definition, levels: MAX_SKILL_LEVELS },
  };
  return input;
}

function team(hitRate: number | undefined, extra: Partial<TeamInput> = {}): TeamInput {
  const c = hitRate === undefined ? {} : { hitRate };
  return {
    slots: [slot(1, 'Step1', c), slot(2, 'Step2', c), slot(3, 'Step3', c)],
    enemy,
    durationSeconds: 180,
    burst: true,
    ...extra,
  };
}

describe('命中率（hitRate）: 退化', () => {
  it('omitted and 1.0 give exactly the same result (the shooting range)', () => {
    const none = computeTeamDamage(team(undefined));
    const one = computeTeamDamage(team(1));
    expect(one.totalDamage).toBe(none.totalDamage);
    expect(one.schedule).toEqual(none.schedule);
    expect(one.slots.every((s) => s!.notes.every((n) => n.code !== 'hit-rate'))).toBe(true);
  });

  it('rejects values outside 0..1', () => {
    expect(() => computeTeamDamage(team(1.2))).toThrow(RangeError);
    expect(() => computeTeamDamage(team(-0.1))).toThrow(RangeError);
  });
});

describe('命中率（hitRate）: 掛かり方', () => {
  it('scales the normal attack (incl. per-shot extra damage) linearly without burst', () => {
    const full = computeTeamDamage(team(1, { burst: false }));
    const half = computeTeamDamage(team(0.5, { burst: false }));
    expect(half.totalDamage / full.totalDamage).toBeCloseTo(0.5, 12);
    const t = (hitRate: number) =>
      computeTriggerDamage({
        character: makeCharacter(),
        growth,
        attackOverride: 10000,
        enemy,
        perShot: [{ multiplier: 0.3, damageType: 'additional' }] as never,
        condition: { coreHitRate: 0.5, distanceBonus: false, fullCharge: true, hitRate },
      });
    expect(t(0.6).normal / t(1).normal).toBeCloseTo(0.6, 12);
    expect(t(0.6).perShot / t(1).perShot).toBeCloseTo(0.6, 12);
    expect(t(0.6).hitRate).toBe(0.6);
  });

  it('scales the gauge per trigger; SG keeps its pellet calibration on top', () => {
    const ar = makeCharacter().shot;
    expect(energyPerTrigger(ar, false, 0.7)).toBeCloseTo(energyPerTrigger(ar, false) * 0.7, 9);
    const sg = makeCharacter({ shotCount: 10, targetBurstEnergyPerShot: 9000 }).shot;
    expect(energyPerTrigger(sg, false, 0.8)).toBeCloseTo(9000 * 1.2 * 10 * SG_PELLET_GAUGE_HIT_RATE * 0.8, 6);
  });

  it('a lower hit rate delays the first full burst on the dynamic cycle', () => {
    const full = computeTeamDamage(team(1));
    const low = computeTeamDamage(team(0.5));
    expect(low.burstSummary!.firstFullBurstSeconds!).toBeGreaterThan(full.burstSummary!.firstFullBurstSeconds!);
    expect(low.burstSummary!.fullBursts).toBeLessThanOrEqual(full.burstSummary!.fullBursts);
  });

  it('does not scale burst skill damage (same activations on the fixed cycle)', () => {
    const full = computeTeamDamage(team(1, { burstModel: 'fixed' }));
    const low = computeTeamDamage(team(0.5, { burstModel: 'fixed' }));
    for (let i = 0; i < 3; i++) {
      expect(low.slots[i]!.burst.totalDamage).toBeCloseTo(full.slots[i]!.burst.totalDamage, 6);
    }
    expect(low.slots[0]!.normalDamage / full.slots[0]!.normalDamage).toBeCloseTo(0.5, 9);
  });

  it('adds an approx note below 1.0, in calc and sim alike', () => {
    expect(conditionNotes({ hitRate: 1 })).toEqual([]);
    expect(conditionNotes({ hitRate: 0.75 })[0]).toMatchObject({ level: 'approx', code: 'hit-rate' });
    const calc = computeTeamDamage(team(0.75));
    const sim = runSimulation(team(0.75));
    expect(calc.slots[0]!.notes.map((n) => n.code)).toContain('hit-rate');
    expect(sim.slots[0]!.notes).toEqual(calc.slots[0]!.notes);
  });

  it('sim and calc share the schedule and per-trigger damage and stay within 3% (dynamic cycle)', () => {
    const input = team(0.7);
    const calc = computeTeamDamage(input);
    const sim = runSimulation(input);
    expect(sim.schedule).toEqual(calc.schedule);
    expect(sim.timeline.segments).toEqual(calc.timeline.segments);
    expect(Math.abs(sim.totalDamage - calc.totalDamage) / calc.totalDamage).toBeLessThan(0.03);
  });
});

describe('敵のプリセット（data/enemies.json）', () => {
  const master = parseEnemyPresets(
    JSON.parse(readFileSync(new URL('../../data/enemies.json', import.meta.url), 'utf8')) as unknown,
  );

  it('has the shooting-range BigArms with the fixed-spec defence', () => {
    const range = master.enemies.filter((e) => e.content === 'range');
    expect(range.map((e) => e.element)).toEqual(['Wind', 'Fire']);
    for (const e of range) expect(e.defence).toBe(FIXED_SPEC_ENEMY_DEFENCE);
    expect(enemyInputOf(range[0]!)).toEqual({ defence: 100, element: 'Wind', hasCore: true });
    expect(matchingEnemyPreset(master.enemies, { defence: 100, element: 'Fire', hasCore: true })?.id).toBe(
      'range-bigarms-fire',
    );
    expect(matchingEnemyPreset(master.enemies, { defence: 140, element: 'Fire', hasCore: true })).toBeUndefined();
  });

  it('rejects malformed presets (unmeasured defence, unknown content, duplicate ids)', () => {
    const base = master.enemies[0]!;
    const bad = (e: object) => () => parseEnemyPresets({ formatVersion: 1, source: '', enemies: [e] });
    expect(bad({ ...base, defence: null })).toThrow(/measured values only/);
    expect(bad({ ...base, content: 'arena' })).toThrow(/content/);
    expect(bad({ ...base, element: 'Light' })).toThrow(/element/);
    expect(bad({ ...base, measuredAt: '9/24' })).toThrow(/YYYY-MM-DD/);
    expect(() => parseEnemyPresets({ formatVersion: 1, source: '', enemies: [base, base] })).toThrow(/duplicate/);
    expect(() => parseEnemyPresets({ formatVersion: 2, source: '', enemies: [] })).toThrow(/formatVersion/);
  });
});
