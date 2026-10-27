// 2 段目の段 8（plan/design-skill-stage8.md）: 対象「残りの HP の割合が最も低い味方 N 機」（heal の lowestHpRatio）。枠の HP の割合の
// 想定（TeamSlotInput.hpRatio）の低い順・同値は枠の若い順（C-0567）。ミサト（833）の S1 の回復と、回復を受けた時のアスカ（830）の S1
// （F4 の録画 0472・0473 の編成）、sim と calc の整合
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { countShotsInRanges } from '../frame/shots.ts';
import { runTeam } from './runTeam.ts';
import type { EnemyInput } from '../damage.ts';
import {
  computeFixedSpecAttack,
  computeFixedSpecDefence,
  computeFixedSpecHp,
  FIXED_SPEC_ENEMY_DEFENCE,
} from '../fixedSpec.ts';
import { planTeamRun } from '../frame/plan.ts';
import { runSimulation, simGroupTotals } from '../sim/engine.ts';
import { fixedTargetsOf, type CompositionCharacter } from '../skills/composition.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { isEffectTarget } from '../skills/targets.ts';
import { parseSkillDefinition, type SkillEffect } from '../skills/types.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import type { CharacterData } from '../types.ts';
import { piecesOf } from './historyHelpers.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const ASUKA = 830;
const MISATO = 833;
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
    defenceOverride: computeFixedSpecDefence(c),
    condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true },
    skills: { definition: definitionOf(id), levels: MAX_SKILL_LEVELS },
    ...extra,
  };
}

const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: 'Fire', hasCore: true };

/** F4 と同じくオートバースト OFF */
function team(slots: TeamSlotInput[], controlledSlot: number): TeamInput {
  return { slots, enemy, durationSeconds: 180, burst: false, controlledSlot };
}

// 録画 0472（A）: アスカ（1 枠目・操作）+ ミサト（2 枠目）。録画 0473（B）: ミサト（1 枠目）+ アスカ（2 枠目・操作）
const A = team([fixedSlot(ASUKA), fixedSlot(MISATO)], 0);
const B = team([fixedSlot(MISATO), fixedSlot(ASUKA)], 1);

const empty = { effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] };
const withEffect = (effect: object) =>
  parseSkillDefinition({
    formatVersion: 1,
    resourceId: 1,
    checkedAt: '2026-10-18',
    skills: { skill1: { effects: [effect] }, skill2: empty, burst: empty },
  });
const HEAL = { kind: 'heal', trigger: 'burstUse', target: 'lowestHpRatio', targetCount: 1, ref: 1 };

describe('lowestHpRatio の読み込み', () => {
  it('accepts it only in heal, with exactly one of targetCount and targetCountRef', () => {
    expect(withEffect(HEAL).skills.skill1.effects[0]).toMatchObject({ target: 'lowestHpRatio', targetCount: 1 });
    const { targetCount: _n, ...noCount } = HEAL;
    expect(withEffect({ ...noCount, targetCountRef: 1 }).skills.skill1.effects[0]).toMatchObject({
      targetCountRef: 1,
    });
    expect(() => withEffect(noCount)).toThrow(/exactly one of targetCount and targetCountRef/);
    expect(() => withEffect({ ...HEAL, targetWeapon: 'AR' })).toThrow(/cannot be combined with a weapon/);
    expect(() => withEffect({ ...HEAL, kind: 'cooldownReduction' })).toThrow(/lowestHpRatio is only allowed in heal/);
    expect(() =>
      withEffect({ kind: 'passive', target: 'lowestHpRatio', stat: 'attack', ref: 1, targetCount: 1 }),
    ).toThrow(/lowestHpRatio is only allowed in heal/);
    expect(() =>
      withEffect({
        kind: 'timed',
        trigger: 'burstUse',
        target: 'lowestHpRatio',
        stat: 'attack',
        ref: 1,
        durationSeconds: 1,
        targetCount: 1,
      }),
    ).toThrow(/lowestHpRatio is only allowed in heal/);
  });

  it('defines the heal of S1 of Misato on the lowest-HP-ratio ally, in place of the unimplemented note (2.1 節)', () => {
    const s1 = definitionOf(MISATO).skills.skill1;
    expect(s1.effects[1]).toMatchObject({
      kind: 'heal',
      trigger: { count: 'normalShot', everyRef: 5 },
      target: 'lowestHpRatio',
      targetCountRef: 6,
      ref: 7,
      claims: ['C-0567', 'C-0180', 'C-0652'],
    });
    expect(s1.notes).toBeUndefined();
    expect(s1.support).toBe('supported');
  });
});

describe('並べ方（HP の割合の想定の低い順・同値は枠の若い順）', () => {
  const heal = withEffect(HEAL).skills.skill1.effects[0] as SkillEffect;
  const members = (ratios: (number | undefined | null)[]): (CompositionCharacter | null)[] =>
    ratios.map((r) => (r === null ? null : { ...character(ASUKA), ...(r === undefined ? {} : { hpRatio: r }) }));

  it('keeps the slot order when every slot is at the assumed full HP (C-0567)', () => {
    expect(fixedTargetsOf(heal, members([undefined, undefined, undefined]), 1)).toEqual([0, 1, 2]);
  });

  it('puts the lower HP ratios first, ties by slot, and skips empty slots', () => {
    expect(fixedTargetsOf(heal, members([1, 0.5, null, 0.5]), 0)).toEqual([1, 3, 0]);
  });

  it('heals the first N slots of the order', () => {
    const slot = character(ASUKA);
    const effect = { target: 'lowestHpRatio' as const, targetCount: 2, fixedTargets: [2, 0, 1] };
    expect([0, 1, 2].map((i) => isEffectTarget(effect, 0, i, slot))).toEqual([true, false, true]);
    expect(() => isEffectTarget({ target: 'lowestHpRatio', targetCount: 1 }, 0, 0, slot)).toThrow(/needs fixedTargets/);
  });
});

/** アスカの S1（回復効果が適用された時の攻撃力▲）の件の小片 */
function asukaS1(input: TeamInput, asuka: number) {
  return piecesOf(planTeamRun(input)).filter(
    (p) => p.slotIndex === asuka && p.effect.source.resourceId === ASUKA && p.effect.source.skill === 'skill1',
  );
}

describe('ミサトの S1 の回復と、回復を受けた時のアスカの S1（F4 の録画 0472・0473 の編成）', () => {
  it('heals Asuka in the first slot every time, and keeps her S1 up from the first heal to the end (録画 0472)', () => {
    const plan = planTeamRun(A);
    const heals = plan.history.heals.filter((h) => h.sourceSlotIndex === 1);
    expect(heals.length).toBeGreaterThan(0);
    expect(heals.every((h) => h.slotIndex === 0)).toBe(true);
    const pieces = asukaS1(A, 0).sort((a, b) => a.start - b.start);
    expect(pieces[0]!.start).toBe(heals[0]!.frame);
    pieces.slice(1).forEach((p, i) => expect(p.start).toBeLessThanOrEqual(pieces[i]!.end));
    expect(Math.max(...pieces.map((p) => p.end))).toBe(plan.frames);
  });

  it('heals Misato herself in the first slot, so Asuka never gets her S1 (録画 0473)', () => {
    const heals = planTeamRun(B).history.heals.filter((h) => h.sourceSlotIndex === 0);
    expect(heals.length).toBeGreaterThan(0);
    expect(heals.every((h) => h.slotIndex === 0)).toBe(true);
    expect(asukaS1(B, 1)).toEqual([]);
  });

  it('follows the assumed HP ratio: a lower ratio on Misato takes the heals from Asuka in the first slot', () => {
    const lower = team([fixedSlot(ASUKA), fixedSlot(MISATO, { hpRatio: 0.9 })], 0);
    const heals = planTeamRun(lower).history.heals.filter((h) => h.sourceSlotIndex === 1);
    expect(heals.length).toBeGreaterThan(0);
    expect(heals.every((h) => h.slotIndex === 1)).toBe(true);
    expect(asukaS1(lower, 0)).toEqual([]);
  });
});

describe.each([
  ['録画 0472 の編成（アスカ 1 枠目）', A],
  ['録画 0473 の編成（ミサト 1 枠目）', B],
])('sim vs calc: %s', (_name, input) => {
  const sim = runSimulation(input);
  const calc = runTeam(input);
  const plan = planTeamRun(input);

  it('agree exactly on the instants and the shot-counted groups', () => {
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
