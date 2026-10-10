// 鈴原サクラ（836）を含む編成（V-0213）。S1: 通常攻撃の命中 120 回ごとに敵の受けるダメージ▲（5 秒）。命中は期待値で数え、
// 発火した発の次のフレームから乗る（C-0315）。S2（受ける HP 回復量▲・受けるダメージ▼）とバースト（持続回復）は効果なし（C-0316）。
// sim と calc の整合。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { runSimulation, simGroupTotals } from '../sim/engine.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import { computeTeamDamage, countShotsInRanges } from '../calc/model.ts';
import { planTeamRun } from '../frame/plan.ts';
import type { SlotCondition, TeamInput, TeamSlotInput } from '../team.ts';
import type { CharacterData } from '../types.ts';
import { gameSecondsToFrames } from '../time.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const DEFINED = new Set(readJson<{ resourceIds: number[] }>('../../data/skills/index.json').resourceIds);
const character = (id: number) => readJson<CharacterData>(`../../data/characters/${id}.json`);

const SAKURA = 836;
const MANUAL: SlotCondition = { coreHitRate: 1, distanceBonus: false, fullCharge: true };

function fixedSlot(id: number, condition: SlotCondition = MANUAL): TeamSlotInput {
  const c = character(id);
  const fixed = computeFixedSpecAttack(c);
  const slot: TeamSlotInput = { character: c, growth: fixed.growth, attackOverride: fixed.attack, condition };
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

const solo = (condition: SlotCondition = MANUAL) => team([fixedSlot(SAKURA, condition)], 0);

/** 枠 0 の S1 の受けるダメージ▲の窓 */
function s1Windows(input: TeamInput) {
  return planTeamRun(input).timeline.windows.filter((w) => w.slotIndex === 0 && w.effect.stat === 'damageTaken');
}

describe('鈴原サクラの定義', () => {
  const def = parseSkillDefinition(readJson<unknown>(`../../data/skills/${SAKURA}.json`));

  it('defines S1 as Damage Taken on all allies, and S2 and the burst without effects', () => {
    expect(def.skills.skill1.support).toBe('supported');
    expect(def.skills.skill1.effects[0]).toMatchObject({
      kind: 'timed',
      trigger: { count: 'normalHit', everyRef: 1 },
      target: 'allies',
      stat: 'damageTaken',
    });
    expect(def.skills.skill2.effects).toEqual([]);
    expect(def.skills.skill2.support).toBe('noEffect');
    expect(def.skills.burst.effects).toEqual([]);
    expect(def.skills.burst.support).toBe('unsupported');
  });
});

describe('鈴原サクラ単騎（手入力の条件）', () => {
  const input = solo();
  const shots = planTeamRun(input).shots[0]!.frames;

  it('applies 17.18% Damage Taken for 5 s from the frame after every 120th shot when every shot hits', () => {
    const windows = s1Windows(input);
    expect(windows.length).toBeGreaterThan(10);
    const fires = shots.filter((_, k) => (k + 1) % 120 === 0).slice(0, windows.length);
    expect(windows.map((w) => w.start)).toEqual(fires.map((f) => f + 1));
    for (const w of windows.slice(0, -1)) expect(w.end - w.start).toBe(gameSecondsToFrames(5));
    expect(windows[0]!.effect.value).toBeCloseTo(0.1718, 12);
  });

  it('counts expected hits: every 160 shots at a bullet hit rate of 0.75', () => {
    const misses = solo({ ...MANUAL, hitRate: 0.75 });
    const m = planTeamRun(misses).shots[0]!.frames;
    expect(
      s1Windows(misses)
        .slice(0, 2)
        .map((w) => w.start),
    ).toEqual([m[159]! + 1, m[319]! + 1]);
  });

  it('never overlaps its own windows (the next 120 hits take longer than 5 s)', () => {
    const windows = s1Windows(input);
    windows.slice(1).forEach((w, k) => expect(w.start).toBeGreaterThanOrEqual(windows[k]!.end));
  });
});

// V-0200 の録画 A の編成（鈴原サクラ I・デルタ II・ブラン II・ノワール III）と、実戦寄りの編成
const TEAMS: Record<string, TeamInput> = {
  単騎: solo(),
  'V-0200 の録画 A（鈴原サクラ + デルタ + ブラン + ノワール）': team(
    [fixedSlot(SAKURA), fixedSlot(20), fixedSlot(270), fixedSlot(271)],
    2,
  ),
  '実戦寄り（鈴原サクラ + クラウン + リター + アリス + モダニア）': team(
    [fixedSlot(SAKURA), fixedSlot(330), fixedSlot(82), fixedSlot(191), fixedSlot(260)],
    3,
  ),
};

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
