// ルドミラ：ウィンターオーナー（194）を含む編成（plan/design-ludmilla-wo.md。V-0159）。
// S1: 通常攻撃の命中 60 回ごとに受けるダメージ▲（3 秒）→ 追加ダメージ（同じ発火の▲が乗る。sequential）と、弾丸チャージ 20 発。
// S2: コアの命中 60 回ごとに追加ダメージ、フルバースト開始時に自分のクリティカル確率▲。バースト: 自分の攻撃力▲・リロード速度▲。
// 命中・コアの命中の回数は期待値で数える。sim と calc の整合。
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

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const DEFINED = new Set(readJson<{ resourceIds: number[] }>('../../data/skills/index.json').resourceIds);
const character = (id: number) => readJson<CharacterData>(`../../data/characters/${id}.json`);

const LUDMILLA = 194;
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

function team(slots: TeamSlotInput[], controlledSlot: number, target: EnemyInput = enemy): TeamInput {
  return { slots, enemy: target, durationSeconds: 180, burst: true, controlledSlot };
}

const solo = (condition: SlotCondition = MANUAL, target: EnemyInput = enemy) =>
  team([fixedSlot(LUDMILLA, condition)], 0, target);

/** 枠 0 の、スロット skill の倍率ダメージの発動フレーム */
function hitFrames(input: TeamInput, skill: 'skill1' | 'skill2'): number[] {
  return planTeamRun(input)
    .skillHits.filter((h) => h.slotIndex === 0 && h.effect.source.skill === skill)
    .map((h) => h.frame);
}

describe('ルドミラ：ウィンターオーナーの定義', () => {
  const def = parseSkillDefinition(readJson<unknown>(`../../data/skills/${LUDMILLA}.json`));

  it('defines every line of the description (all slots supported), with S1 in order', () => {
    for (const slot of ['skill1', 'skill2', 'burst'] as const) expect(def.skills[slot].support).toBe('supported');
    expect(def.skills.skill1.sequential).toBe(true);
    expect(def.skills.skill1.effects.map((e) => e.kind)).toEqual(['timed', 'damage', 'ammoRefill']);
    expect(def.skills.skill1.effects[2]).toMatchObject({ scaling: 'flat', ref: 6 });
    expect(def.skills.skill2.effects[0]).toMatchObject({ trigger: { count: 'coreHit', everyRef: 1 } });
  });
});

describe('ルドミラ：ウィンターオーナー単騎（手入力の条件）', () => {
  const input = solo();
  const plan = planTeamRun(input);
  const shots = plan.shots[0]!.frames;

  it('fires S1 and S2 every 60 shots when every shot hits the core', () => {
    const every60 = shots.filter((_, k) => (k + 1) % 60 === 0);
    expect(hitFrames(input, 'skill1')).toEqual(every60);
    expect(hitFrames(input, 'skill2')).toEqual(every60);
  });

  it('refills 20 rounds every 60 hits; the 420th shot empties the magazine before its own refill (M1)', () => {
    const refills = plan.instants.filter((x) => x.effect.kind === 'ammoRefill');
    expect(refills[0]).toMatchObject({ frame: shots[59], amount: 20 });
    // 419 発で残り 1（300 − 419 + 6 × 20）。420 発目で 0 になり（最後の弾丸）、同じ発の弾丸チャージはリロードの前に間に合わない。
    // 間に合う読み（M2。マガジン 440 発）とは録画 099 で見分ける（plan/design-ludmilla-wo.md 3.3 節）
    expect(plan.shots[0]!.lastShotFrames![0]).toBe(shots[419]);
    expect(plan.shots[0]!.lastShotFrames![1]).toBe(shots[839]);
  });

  it('adds the Damage Taken of the same trigger to the S1 additional damage, not to the S2 one of the same shot', () => {
    const first = plan.skillHits.filter((h) => h.frame === shots[59]);
    const s1 = first.find((h) => h.effect.source.skill === 'skill1')!;
    const s2 = first.find((h) => h.effect.source.skill === 'skill2')!;
    expect(s1.hit.damageTakenMultiplier).toBeCloseTo(1.1256, 12);
    expect(s2.hit.damageTakenMultiplier).toBe(1);
    // 受けるダメージ▲の窓は発火した発の次のフレームから（発火した発の通常攻撃には乗らない）
    const window = plan.timeline.windows.find((w) => w.effect.stat === 'damageTaken')!;
    expect(window.start).toBe(shots[59]! + 1);
  });

  it('counts expected core hits for S2 and expected hits for S1', () => {
    const halfCore = solo({ ...MANUAL, coreHitRate: 0.5 });
    const s = planTeamRun(halfCore).shots[0]!.frames;
    expect(hitFrames(halfCore, 'skill2').slice(0, 2)).toEqual([s[119], s[239]]);
    expect(hitFrames(halfCore, 'skill1').slice(0, 2)).toEqual([s[59], s[119]]);
    const misses = solo({ ...MANUAL, hitRate: 0.75 });
    const m = planTeamRun(misses).shots[0]!.frames;
    // 命中 0.75 × 80 発 = 60 回。コアは 0.75 × 1 なので同じ発
    expect(hitFrames(misses, 'skill1').slice(0, 2)).toEqual([m[79], m[159]]);
    expect(hitFrames(misses, 'skill2').slice(0, 2)).toEqual([m[79], m[159]]);
  });

  it('never fires S2 on an enemy without a core', () => {
    expect(hitFrames(solo(MANUAL, { ...enemy, hasCore: false }), 'skill2')).toEqual([]);
  });
});

// 段 B の編成（ラム I・デルタ II はこの編成でダメージに効く効果を起こさない）と、実戦寄りの編成
const TEAMS: Record<string, TeamInput> = {
  単騎: solo(),
  '段 B（ラム + デルタ + ルドミラ）': team([fixedSlot(822), fixedSlot(20), fixedSlot(LUDMILLA)], 2),
  '実戦寄り（リター + クラウン + ルドミラ + アリス + ユニ）': team(
    [fixedSlot(82), fixedSlot(330), fixedSlot(LUDMILLA), fixedSlot(191), fixedSlot(160)],
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
