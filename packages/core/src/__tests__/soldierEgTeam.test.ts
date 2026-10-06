// ソルジャーE.G.（300）を含む編成（plan/design-soldier-eg.md）。S1: 通常攻撃の命中 1 発ごとに 5% の確率で自分に攻撃力▲（5 秒）を、
// 期待値の窓（付いている確率 × 値。skills/chance.ts）で持つ（C-0372）。S2 は戦闘開始から 9 秒ごとの最大装弾数▲（C-0369）、バーストは burstDamage（C-0371）。
// 窓の値の式と、sim と calc の整合、順位（アリスの S1）に期待値の攻撃力が入ること。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeTeamDamage, countShotsInRanges } from '../calc/model.ts';
import type { EnemyInput } from '../damage.ts';
import { enemyEventsOf, enemyLandingsOf, parseEnemyPresets } from '../enemies.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { planTeamRun } from '../frame/plan.ts';
import { runSimulation, simGroupTotals } from '../sim/engine.ts';
import { chanceScaleAt, chanceValueOf } from '../skills/chance.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import type { SlotCondition, TeamInput, TeamSlotInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import type { CharacterData } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const SOLDIER = 300;
const VALUE = 0.0792;
const DURATION = gameSecondsToFrames(5);
const MANUAL: SlotCondition = { coreHitRate: 1, distanceBonus: false, fullCharge: true };

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

function fixedSlot(id: number, condition: SlotCondition = MANUAL, auto = false): TeamSlotInput {
  const character = readJson<CharacterData>(`../../data/characters/${id}.json`);
  const fixed = computeFixedSpecAttack(character);
  return {
    character,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    condition,
    ...(auto ? { conditionMode: 'auto' as const } : {}),
    skills: {
      definition: parseSkillDefinition(readJson<unknown>(`../../data/skills/${id}.json`)),
      levels: MAX_SKILL_LEVELS,
    },
  };
}

function team(slots: TeamSlotInput[], enemy: EnemyInput, burst: boolean, controlledSlot: number): TeamInput {
  return { slots, enemy, durationSeconds: 180, burst, controlledSlot };
}

/** 枠 slotIndex の S1 の窓（期待値の小片） */
function s1Windows(input: TeamInput, slotIndex = 0) {
  return planTeamRun(input).timeline.windows.filter(
    (w) => w.slotIndex === slotIndex && w.sourceSlotIndex === slotIndex && w.effect.source.skill === 'skill1',
  );
}

describe('ソルジャーE.G. の定義', () => {
  const def = parseSkillDefinition(readJson<unknown>(`../../data/skills/${SOLDIER}.json`));

  it('defines S1 as a chance-based Attack up, S2 as Max Ammo up every 9 s, and the burst as burstDamage', () => {
    expect(def.skills.skill1.support).toBe('supported');
    expect(def.skills.skill1.effects[0]).toMatchObject({
      kind: 'timed',
      trigger: { count: 'normalHit', chanceRef: 3 },
      target: 'self',
      stat: 'attack',
    });
    expect(def.skills.skill2.support).toBe('supported');
    expect(def.skills.skill2.effects[0]).toMatchObject({ trigger: { everySeconds: 9 }, stat: 'maxAmmo' });
    expect(def.skills.burst.effects[0]).toMatchObject({ kind: 'burstDamage', ref: 2 });
  });
});

describe('ソルジャーE.G. 単騎（手入力の条件・全弾命中）', () => {
  const input = team([fixedSlot(SOLDIER)], plainEnemy, false, 0);
  const shots = planTeamRun(input).shots[0]!.frames;
  const windows = s1Windows(input);

  it('starts at the frame after the first shot with 5% of the value', () => {
    expect(windows[0]!.start).toBe(shots[0]! + 1);
    expect(windows[0]!.effect.value).toBe(chanceValueOf(VALUE, 0.05));
  });

  it('gives value × (1 − 0.95ⁿ) with n the shots in the last 5 s (from the frame after each shot)', () => {
    for (const w of windows) {
      const n = shots.filter((f) => f + 1 <= w.start && w.start < f + 1 + DURATION).length;
      expect(w.effect.value).toBe(chanceValueOf(VALUE, 1 - 0.95 ** n));
    }
    // 連射が 5 秒続いた所では 60 発（720 RPM）で、付いている確率は 1 − 0.95⁶⁰
    const max = Math.max(...windows.map((w) => w.effect.value));
    expect(max).toBe(chanceValueOf(VALUE, 1 - 0.95 ** 60));
  });

  it('does not overlap its own pieces', () => {
    windows.slice(1).forEach((w, k) => expect(w.start).toBeGreaterThanOrEqual(windows[k]!.end));
  });
});

describe('ソルジャーE.G. 単騎（射撃場・条件は自動）', () => {
  const input = team([fixedSlot(SOLDIER, MANUAL, true)], rangeEnemy, false, 0);
  const plan = planTeamRun(input);

  it('weights each shot by its bullet hit rate', () => {
    const shots = plan.shots[0]!;
    const windows = s1Windows(input);
    const opportunities = shots.frames.map((f, k) => ({ start: f + 1, q: 0.05 * shots.hits![k]! }));
    for (const w of windows.slice(0, 200)) {
      expect(w.effect.value).toBe(chanceValueOf(VALUE, chanceScaleAt(opportunities, DURATION, w.start)));
    }
    expect(shots.hits!.some((h) => h < 1)).toBe(true);
  });
});

describe('順位（アリスの S1。フルバースト時に最終攻撃力が最も高い味方）', () => {
  const input = team([fixedSlot(836), fixedSlot(20), fixedSlot(191), fixedSlot(SOLDIER)], plainEnemy, true, 2);
  const plan = planTeamRun(input);

  it('counts the expected Attack up of the soldier at the frame of each ranking', () => {
    const shots = plan.shots[3]!.frames;
    const opportunities = shots.map((f) => ({ start: f + 1, q: 0.05 }));
    const base = plan.timeline.rankings[0]!;
    expect(plan.timeline.rankings.length).toBeGreaterThan(0);
    for (const r of plan.timeline.rankings) {
      const scale = chanceScaleAt(opportunities, DURATION, r.frame);
      expect(scale).toBeGreaterThan(0);
      // ほかの攻撃力▲が無い枠なので、最終攻撃力の比は 1 + 値 × 付いている確率
      const withoutBuff =
        base.finalAttacks[3]! / (1 + chanceValueOf(VALUE, chanceScaleAt(opportunities, DURATION, base.frame)));
      expect(r.finalAttacks[3]! / withoutBuff).toBeCloseTo(1 + chanceValueOf(VALUE, scale), 9);
    }
  });
});

const TEAMS: Record<string, TeamInput> = {
  '単騎（手入力の条件）': team([fixedSlot(SOLDIER)], plainEnemy, false, 0),
  '単騎（射撃場・条件は自動）': team([fixedSlot(SOLDIER, MANUAL, true)], rangeEnemy, false, 0),
  // V-0244 の撮影と同じ編成（サクラ I・デルタ II・ソルジャーE.G. III。オートバースト）
  'サクラ + デルタ + ソルジャーE.G.（射撃場・条件は自動）': team(
    [fixedSlot(836, MANUAL, true), fixedSlot(20, MANUAL, true), fixedSlot(SOLDIER, MANUAL, true)],
    rangeEnemy,
    true,
    2,
  ),
  '順位あり（サクラ + デルタ + アリス + ソルジャーE.G.）': team(
    [fixedSlot(836), fixedSlot(20), fixedSlot(191), fixedSlot(SOLDIER)],
    plainEnemy,
    true,
    2,
  ),
};

describe.each(Object.entries(TEAMS))('sim vs calc: %s', (_name, input) => {
  const sim = runSimulation(input);
  const calc = computeTeamDamage(input);
  const plan = planTeamRun(input);

  it('agree exactly on the schedule and the shot-counted groups', () => {
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
