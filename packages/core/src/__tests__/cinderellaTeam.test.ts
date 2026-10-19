// シンデレラ（511）を含む編成。S1 のフルチャージ攻撃の命中時の追加ダメージ（射撃ごとの倍率ダメージ。C-0583。V-0445）と、
// 2 段目の段 6 の PR 2（plan/design-skill-stage6.md 2.4 節）の美しさ（最大HP▲）と S1 の最終最大HP 基準の攻撃力▲の読み直し。sim と calc の整合
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeTeamDamage, countShotsInRanges } from '../calc/model.ts';
import type { EnemyInput } from '../damage.ts';
import { computeFixedSpecAttack, computeFixedSpecHp, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { planTeamRun } from '../frame/plan.ts';
import { runSimulation, simGroupTotals } from '../sim/engine.ts';
import { ZERO_BUFFS } from '../skills/buffs.ts';
import { itemsOf } from '../skills/holders.ts';
import { timerFrames } from '../skills/timeline.ts';
import { finalAttacksAt } from '../skills/ranking.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import type { CharacterData } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const CINDERELLA = 511;
const RAM = 822;
const DELTA = 20;
const character = (id: number) => readJson<CharacterData>(`../../data/characters/${id}.json`);
const definitionOf = (id: number) => parseSkillDefinition(readJson<unknown>(`../../data/skills/${id}.json`));

function fixedSlot(id: number): TeamSlotInput {
  const c = character(id);
  const fixed = computeFixedSpecAttack(c);
  return {
    character: c,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    hpOverride: computeFixedSpecHp(c),
    condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true },
    skills: { definition: definitionOf(id), levels: MAX_SKILL_LEVELS },
  };
}

const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: 'Fire', hasCore: true };
const team = (ids: number[], burst: boolean, controlledSlot: number): TeamInput => ({
  slots: ids.map(fixedSlot),
  enemy,
  durationSeconds: 180,
  burst,
  controlledSlot,
});

describe('シンデレラの定義', () => {
  it('defines the additional damage of S1 on every full charge shot (C-0583)', () => {
    const def = definitionOf(CINDERELLA);
    expect(def.skills.skill1.effects.slice(0, 1)).toMatchObject([
      {
        kind: 'damage',
        trigger: { count: 'fullChargeShot' },
        damageType: 'additional',
        ref: 4,
        // 2026-10-20: 1 ヒット分のバーストゲージを溜める（C-0604。録画 480・481 の 1 回目のフルバースト）
        gaugeHits: [0],
        claims: ['C-0583', 'C-0604'],
      },
    ]);
    expect(def.skills.skill1.support).toBe('supported');
  });

  it('defines the charge speed up of S1 until the reload ends (C-0603)', () => {
    expect(definitionOf(CINDERELLA).skills.skill1.effects[2]).toMatchObject({
      kind: 'timed',
      trigger: { count: 'fullChargeShot' },
      target: 'self',
      stat: 'chargeSpeed',
      ref: 3,
      durationUntil: 'reloadEnd',
      claims: ['C-0603'],
    });
  });

  it('fires at 180 rpm after the first full charge and charges again after each reload (V-0463)', () => {
    const plan = planTeamRun(team([CINDERELLA], false, 0));
    const frames = plan.shots[0]!.frames;
    const gaps = frames.slice(1).map((f, i) => f - frames[i]!);
    // 1 本目のマガジン: 20・20・19f の繰り返し（間の数 23 で 451f）。リロードを挟んで 199〜200f
    expect(gaps.slice(0, 6)).toEqual([20, 20, 19, 20, 20, 19]);
    expect(frames[23]! - frames[0]!).toBe(451);
    expect(gaps[23]).toBeGreaterThanOrEqual(199);
    expect(gaps[23]).toBeLessThanOrEqual(200);
    // 込め終わりで▲が切れるので、次のマガジンの 2 発目からまた 20f
    expect(gaps[24]).toBe(20);
  });

  it('adds (attack − defence) × 136.6% to every full charge shot of the solo recordings (V-0445)', () => {
    const calc = computeTeamDamage(team([CINDERELLA], false, 0));
    const c = character(CINDERELLA);
    const expected = (computeFixedSpecAttack(c).attack - FIXED_SPEC_ENEMY_DEFENCE) * 1.366;
    for (const s of calc.slots[0]!.segments) {
      expect(s.trigger.perShot / s.trigger.hitRate).toBeGreaterThan(0);
    }
    const t = calc.slots[0]!.segments[0]!.trigger;
    // 1 発あたりの射撃ごとの倍率ダメージ（会心の期待値込み）を、会心なしの値に戻す
    expect(t.perShot / t.hitRate / (1 + t.boost.crit + t.boost.fullBurst)).toBeCloseTo(expected, 3);
  });
});

describe.each([
  ['シンデレラ単騎（録画 124 の編成）', team([CINDERELLA], false, 0)],
  ['ラム + デルタ + シンデレラ（段 6 の PR 2 の撮影の編成）', team([RAM, DELTA, CINDERELLA], true, 2)],
])('sim vs calc: %s', (_name, input) => {
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

// 2 段目の段 6 の PR 2（plan/design-skill-stage6.md 2.4 節）: 最大HP▲（美しさ）と、S1 の最終最大HP 基準の攻撃力▲の読み直し。
// 撮影（V-0446）の前のモデル（H1）の形をテストで固定する
describe('美しさと S1 の攻撃力▲の読み直し（段 6 の PR 2）', () => {
  const input = team([RAM, DELTA, CINDERELLA], true, 2);
  const plan = planTeamRun(input);
  const c = character(CINDERELLA);
  const baseAttack = computeFixedSpecAttack(c).attack;
  const baseHp = computeFixedSpecHp(c);
  const s1 = Number(c.skills.skill1.values[0]![9]) / 100;
  const beautyUp = Number(c.skills.skill2.values[1]![9]) / 100;

  it('defines the decoy and Beautiful of S2, and the attack up of S1 from the final max HP', () => {
    const def = definitionOf(CINDERELLA);
    expect(def.skills.skill1.effects[1]).toMatchObject({
      kind: 'timed',
      trigger: 'burstStage3Enter',
      target: 'self',
      stat: 'attack',
      scaling: 'casterFinalMaxHp',
      ref: 1,
      durationRef: 2,
    });
    expect(def.skills.skill2.support).toBe('supported');
    expect(def.skills.skill2.effects).toMatchObject([
      { kind: 'state', state: 'decoy', trigger: 'battleStart', target: 'self', durationUntil: 'battleEnd' },
      { kind: 'state', state: 'decoy', trigger: 'burstStage3Enter', target: 'self', durationUntil: 'battleEnd' },
      {
        kind: 'state',
        state: 'beauty',
        trigger: { everySeconds: 3 },
        condition: { selfState: { state: 'decoy', present: true } },
        maxStacksRef: 3,
        contents: [{ stat: 'maxHp', ref: 2 }],
      },
    ]);
  });

  it('stacks Beautiful every 3 s from the start of battle while the decoy lasts, up to 12', () => {
    const beauty = itemsOf(plan.history, { holder: 2, state: 'beauty' });
    expect(beauty.map((i) => i.start)).toEqual(timerFrames(3, plan.history.frames).slice(0, 12));
    expect(itemsOf(plan.history, { holder: 2, state: 'decoy' }).map((i) => i.start)).toContain(0);
  });

  it('reads the final max HP again while the attack up of S1 lasts (H1 of V-0446)', () => {
    const calc = computeTeamDamage(input);
    const window = itemsOf(plan.history, { holder: 2, sourceSlotIndex: 2, kind: 'timed', stat: 'attack' })[0]!;
    const beautyStarts = itemsOf(plan.history, { holder: 2, state: 'beauty' }).map((i) => i.start);
    const ranges = calc.slots[2]!.segments.flatMap((g) => g.ranges.map((r) => ({ ...r, attack: g.trigger.attack })));
    const inWindow = ranges.filter((r) => r.start >= window.start && r.start < window.end);
    expect(new Set(inWindow.map((r) => r.attack)).size).toBeGreaterThan(1);
    for (const r of inWindow) {
      const stacks = beautyStarts.filter((f) => f <= r.start).length;
      expect(r.attack).toBe(Math.round(baseAttack + s1 * baseHp * (1 + beautyUp * stacks)));
    }
    // S1 の攻撃力▲の外では、美しさは読む側が無いので値に効かない
    const outside = ranges.filter((r) => r.start >= window.end && r.start < window.end + 200);
    for (const r of outside) expect(r.attack).toBe(baseAttack);
  });
});

describe('最大HP▲ を読む発動者の最終最大HP（常時の効果・順位）', () => {
  it('reads the passive max HP up of the caster for a passive attack up from the final max HP', () => {
    const base = {
      formatVersion: 1,
      resourceId: CINDERELLA,
      checkedAt: '2026-10-17',
      skills: {
        skill2: { effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] },
        burst: { effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] },
      },
    };
    // S1 の値 1（2.71%）を攻撃力▲、S2 の値 2（1.6%）を常時の最大HP▲ として使う合成の定義
    const definition = parseSkillDefinition({
      ...base,
      skills: {
        ...base.skills,
        skill1: {
          effects: [{ kind: 'passive', target: 'self', stat: 'attack', scaling: 'casterFinalMaxHp', ref: 1 }],
        },
        skill2: { effects: [{ kind: 'passive', target: 'self', stat: 'maxHp', ref: 2 }] },
      },
    });
    const slot: TeamSlotInput = { ...fixedSlot(CINDERELLA), skills: { definition, levels: MAX_SKILL_LEVELS } };
    const calc = computeTeamDamage({ slots: [slot], enemy, durationSeconds: 180, burst: false, controlledSlot: 0 });
    const c = character(CINDERELLA);
    const s1 = Number(c.skills.skill1.values[0]![9]) / 100;
    const up = Number(c.skills.skill2.values[1]![9]) / 100;
    const expected = Math.round(computeFixedSpecAttack(c).attack + s1 * computeFixedSpecHp(c) * (1 + up));
    expect(calc.slots[0]!.segments[0]!.trigger.attack).toBe(expected);
  });

  it('uses the final max HP given with the window in the ranking', () => {
    const slots = [
      {
        casterBaseAttack: 100,
        casterMaxHp: 1000,
        weaponType: 'AR' as const,
        element: 'Fire' as const,
        passive: ZERO_BUFFS,
      },
    ];
    const effect = { stat: 'attack' as const, scaling: 'casterFinalMaxHp' as const, value: 0.1 };
    const window = { slotIndex: 0, sourceSlotIndex: 0, effect, start: 0, end: 10 };
    expect(finalAttacksAt(slots, [window], 5)).toEqual([200]);
    expect(finalAttacksAt(slots, [{ ...window, casterMaxHp: 2000 }], 5)).toEqual([300]);
  });
});
