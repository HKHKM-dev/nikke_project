// 2 段目の段 6 の PR 1（plan/design-skill-stage6.md 1・2 節）: HP の経路。
// 発動者の最終最大HP 基準の攻撃力▲（scaling casterFinalMaxHp。ラプラス：アルティメットヒーロー（103）の S1）と、
// 自分の HP の割合の条件（condition.selfHp。枠の HP の割合の想定 hpRatio。ノワール（271）の S1）。sim と calc の整合
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { countShotsInRanges } from '../frame/shots.ts';
import { runTeam } from './runTeam.ts';
import type { EnemyInput } from '../damage.ts';
import { computeFixedSpecAttack, computeFixedSpecHp, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { planTeamRun } from '../frame/plan.ts';
import { runSimulation, simGroupTotals } from '../sim/engine.ts';
import { applyResolvedEffect, ZERO_BUFFS } from '../skills/buffs.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import type { CharacterData } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const LAPLACE = 103;
const NOIR = 271;
const DELTA = 20;
const character = (id: number) => readJson<CharacterData>(`../../data/characters/${id}.json`);
const definitionOf = (id: number) => parseSkillDefinition(readJson<unknown>(`../../data/skills/${id}.json`));

function fixedSlot(id: number, extra: Partial<TeamSlotInput> = {}): TeamSlotInput {
  const c = character(id);
  const fixed = computeFixedSpecAttack(c);
  return {
    character: c,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    hpOverride: computeFixedSpecHp(c),
    condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true },
    skills: { definition: definitionOf(id), levels: MAX_SKILL_LEVELS },
    ...extra,
  };
}

const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: 'Fire', hasCore: true };

function team(slots: TeamSlotInput[], burst = false): TeamInput {
  return { slots, enemy, durationSeconds: 180, burst, controlledSlot: 0 };
}

/** S1 の説明文の値（スキル Lv10）の % を割合にしたもの */
function skillRatio(id: number, ref: number): number {
  const values = character(id).skills.skill1.values[ref - 1]!;
  return Number(values[9]) / 100;
}

describe('発動者の最終最大HP 基準の攻撃力▲（casterFinalMaxHp）', () => {
  it('parses only with stat attack, and rejects a missing caster max HP', () => {
    const base = {
      formatVersion: 1,
      resourceId: 1,
      checkedAt: '2026-10-17',
      skills: {
        skill2: { effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] },
        burst: { effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] },
      },
    };
    const withEffect = (effect: object) => ({ ...base, skills: { ...base.skills, skill1: { effects: [effect] } } });
    const effect = { kind: 'passive', target: 'self', stat: 'attack', scaling: 'casterFinalMaxHp', ref: 1 };
    expect(() => parseSkillDefinition(withEffect(effect))).not.toThrow();
    expect(() => parseSkillDefinition(withEffect({ ...effect, stat: 'critDamage' }))).toThrow(
      /casterFinalMaxHp is only allowed with stat "attack"/,
    );
    expect(() => parseSkillDefinition(withEffect({ ...effect, decrease: true }))).toThrow(/decrease/);
    const resolved = { stat: 'attack' as const, scaling: 'casterFinalMaxHp' as const, value: 0.0405 };
    expect(() => applyResolvedEffect({ ...ZERO_BUFFS }, resolved, 1000)).toThrow(/max HP of the caster/);
    expect(applyResolvedEffect({ ...ZERO_BUFFS }, resolved, 1000, 2_000_000).appliedAmount).toBeCloseTo(81_000, 6);
  });

  it('defines S1 of Laplace: Ultimate Hero as a battle-long attack up from the caster final max HP', () => {
    const def = definitionOf(LAPLACE);
    // 2 段目の段 11 の PR 1 から、S1 の effects[1] 以降にウォームアップと使用武器の変更がある（stage11WeaponChange.test.ts）
    expect(def.skills.skill1.effects.slice(0, 1)).toMatchObject([
      {
        kind: 'timed',
        trigger: 'battleStart',
        target: 'self',
        stat: 'attack',
        scaling: 'casterFinalMaxHp',
        ref: 1,
        durationUntil: 'battleEnd',
        reads: ['hp'],
        claims: ['C-0579'],
      },
    ]);
    expect(def.skills.skill1.support).toBe('partial');
  });

  it('adds X% of the fixed-spec max HP to the attack of Laplace from the start of battle (C-0579)', () => {
    const input = team([fixedSlot(LAPLACE)]);
    const calc = runTeam(input);
    const c = character(LAPLACE);
    const expected = Math.round(computeFixedSpecAttack(c).attack + skillRatio(LAPLACE, 1) * computeFixedSpecHp(c));
    const segments = calc.slots[0]!.segments;
    expect(segments.length).toBeGreaterThan(0);
    for (const s of segments) expect(s.trigger.attack).toBe(expected);
  });

  it('uses the max HP given by hpOverride (growth only without it)', () => {
    const c = character(LAPLACE);
    const withHp = runTeam(team([fixedSlot(LAPLACE, { hpOverride: 1_000_000 })]));
    const base = computeFixedSpecAttack(c).attack;
    expect(withHp.slots[0]!.segments[0]!.trigger.attack).toBe(Math.round(base + skillRatio(LAPLACE, 1) * 1_000_000));
  });

  it('rejects an hpOverride that is not a positive number', () => {
    expect(() => runTeam(team([fixedSlot(LAPLACE, { hpOverride: 0 })]))).toThrow(/hpOverride/);
  });
});

describe('自分の HP の割合の条件（selfHp）', () => {
  it('defines S1 of Noir with the HP condition instead of the assumption', () => {
    const e = definitionOf(NOIR).skills.skill1.effects[0]!;
    expect(e).toMatchObject({
      kind: 'passive',
      target: 'allies',
      stat: 'attack',
      scaling: 'casterAttack',
      condition: { selfHp: { atLeastRef: 1 } },
      reads: ['hp'],
      claims: ['C-0020'],
    });
    expect(e).not.toHaveProperty('assumes');
  });

  it('rejects selfHp outside passive and unknown fields', () => {
    const base = {
      formatVersion: 1,
      resourceId: 1,
      checkedAt: '2026-10-17',
      skills: {
        skill2: { effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] },
        burst: { effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] },
      },
    };
    const withEffect = (effect: object) => ({ ...base, skills: { ...base.skills, skill1: { effects: [effect] } } });
    const timed = {
      kind: 'timed',
      trigger: 'battleStart',
      target: 'self',
      stat: 'attack',
      ref: 1,
      durationSeconds: 5,
      condition: { selfHp: { atLeastRef: 1 } },
    };
    expect(() => parseSkillDefinition(withEffect(timed))).toThrow(/selfHp/);
    const passive = { kind: 'passive', target: 'self', stat: 'attack', ref: 1 };
    expect(() =>
      parseSkillDefinition(withEffect({ ...passive, condition: { selfHp: { atLeastRef: 1 } } })),
    ).not.toThrow();
    expect(() => parseSkillDefinition(withEffect({ ...passive, condition: { selfHp: { atLeast: 0.7 } } }))).toThrow(
      /unknown field/,
    );
    expect(() => parseSkillDefinition(withEffect({ ...passive, condition: { inFullBurst: true } }))).toThrow(
      /unknown field/,
    );
  });

  // ノワール S1: 自分の HP が 70% 以上なら味方全体に攻撃力▲（発動者基準）。想定の既定は満タン（plan/design-skill-stage6.md 論点 4）
  const attackUp = (hpRatio: number | undefined) => {
    const noir = fixedSlot(NOIR, hpRatio === undefined ? {} : { hpRatio });
    const calc = runTeam(team([noir, fixedSlot(DELTA)]));
    return calc.slots.map((s) => s!.segments[0]!.trigger.buffs.attackFlat);
  };

  it('keeps the attack up of Noir at full HP (the default) and at the threshold', () => {
    const full = attackUp(undefined);
    expect(full.every((v) => v > 0)).toBe(true);
    expect(attackUp(1)).toEqual(full);
    expect(attackUp(0.7)).toEqual(full);
  });

  it('drops the attack up of Noir below the threshold, for every ally', () => {
    expect(attackUp(0.69)).toEqual([0, 0]);
  });

  it('rejects an hpRatio outside (0, 1]', () => {
    expect(() => attackUp(0)).toThrow(/hpRatio/);
    expect(() => attackUp(1.01)).toThrow(/hpRatio/);
  });
});

describe.each([
  ['ラプラス：アルティメットヒーロー単騎（録画 0121 の編成）', team([fixedSlot(LAPLACE)])],
  ['ノワール + デルタ（HP の割合 0.5）', team([fixedSlot(NOIR, { hpRatio: 0.5 }), fixedSlot(DELTA)], true)],
])('sim vs calc: %s', (_name, input) => {
  const sim = runSimulation(input);
  const calc = runTeam(input);
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
});
