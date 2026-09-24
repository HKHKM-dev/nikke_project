// Stage 11: クラウン（330）を含む編成の回帰と、sim と calc の整合（plan/design-stage11.md 7.4・7.5 節）。
// 録画 41（I-DOLL・フラワー + クラウン + デルタ（操作）+ ラピ）の実測値を固定する。数値は plan/verification.md Stage 11 節。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput, TriggerDamage } from '../damage.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { runSimulation, simGroupTotals } from '../sim/engine.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import type { TreasurePhase } from '../skills/treasure.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import { computeTeamDamage, countShotsInRanges } from '../calc/model.ts';
import { planTeamRun } from '../frame/plan.ts';
import { type TeamInput, type TeamSlotInput, type SlotSegmentResult } from '../team.ts';
import type { CharacterData } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const DEFINED = new Set(readJson<{ resourceIds: number[] }>('../../data/skills/index.json').resourceIds);

function fixedSlot(id: number, treasurePhase: TreasurePhase = 0): TeamSlotInput {
  const character = readJson<CharacterData>(`../../data/characters/${id}.json`);
  const fixed = computeFixedSpecAttack(character);
  const slot: TeamSlotInput = {
    character,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    condition: { coreHitRate: 0, distanceBonus: false, fullCharge: true },
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

// 録画 41 の的は属性なし（有利コードの補正なし）
const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: null, hasCore: true };

function team(slots: TeamSlotInput[], controlledSlot: number): TeamInput {
  return { slots, enemy, durationSeconds: 180, burst: true, controlledSlot };
}

const REC41 = team([fixedSlot(304), fixedSlot(330), fixedSlot(20), fixedSlot(10)], 2);
const TEAMS: Record<string, TeamInput> = {
  '録画 41（I-DOLL・フラワー + クラウン + デルタ + ラピ）': REC41,
  '実戦寄り（リター + クラウン + ドレイク宝物 3 + ラピ）': team(
    [fixedSlot(82), fixedSlot(330), fixedSlot(101, 3), fixedSlot(10)],
    2,
  ),
};

/**
 * 1 ヒットの表示値（非会心）。倍率グループ = 1 + コア + 距離 + フルバースト（+ 会心 0.5）。
 * 表示は四捨五入（録画 41 の読み取りで確認）
 */
function popup(t: TriggerDamage, extra: { core?: boolean; crit?: boolean; distance?: boolean }): number {
  const boost = 1 + (extra.core ? 1 : 0) + (extra.crit ? 0.5 : 0) + (extra.distance ? 0.3 : 0) + t.boost.fullBurst;
  return t.baseHit * t.weaponMultiplier * t.chargeMultiplier * boost * t.attackDamageMultiplier;
}

describe('録画 41: クラウンの S1・S2・バースト（7.5）', () => {
  const calc = computeTeamDamage(REC41);
  const plan = planTeamRun(REC41);
  const segmentsOf = (i: number): SlotSegmentResult[] => calc.slots[i]!.segments;
  /** attackDamage（小数 4 桁）と FB の組で区間を 1 つ選ぶ */
  const find = (i: number, fullBurst: boolean, attackDamage: number, s1: boolean): SlotSegmentResult => {
    const g = segmentsOf(i).find(
      (s) =>
        s.fullBurst === fullBurst &&
        Math.abs(s.buffs.attackDamage - attackDamage) < 1e-9 &&
        s.buffs.attackFlat > 0 === s1,
    );
    if (!g) throw new Error(`no segment for slot ${i} fb=${fullBurst} ad=${attackDamage} s1=${s1}`);
    return g;
  };

  it('opens 5 full bursts and never lets デルタ (the second II) burst', () => {
    const windows = plan.schedule!.fullBurstWindows;
    expect(windows).toHaveLength(5);
    expect(plan.schedule!.activations.some((a) => a.slotIndex === 2)).toBe(false);
    for (const w of windows) expect(w.burstUsers).toEqual([0, 1, 3]);
  });

  it('gives S1 attack (64.51% of クラウン’s attack) to the burst users only (recording: デルタ 355,290 in FB)', () => {
    const crownBase = calc.slots[1]!.segments[0]!.trigger.baseAttack;
    for (const i of [0, 1, 3]) {
      const fb = segmentsOf(i).filter((s) => s.fullBurst);
      expect(fb.every((s) => Math.abs(s.buffs.attackFlat - crownBase * 0.6451) < 1e-6)).toBe(true);
    }
    expect(segmentsOf(2).every((s) => s.buffs.attackFlat === 0)).toBe(true);
    // デルタのコア・フルバースト・クラウンのバースト（×1.3624）
    expect(popup(find(2, true, 0.3624, false).trigger, { core: true })).toBeCloseTo(355290, -0.5);
  });

  it('matches クラウン and ラピ hits read from the damage counter in the full burst (25,100 / 68,484 / 106,530)', () => {
    // クラウン（MG）: コア・FB・S1・バースト
    expect(popup(find(1, true, 0.3624, true).trigger, { core: true })).toBeCloseTo(25100, -0.5);
    // ラピ（AR・自分のバーストの攻撃力 60.75% + S1）: 胴体 + 距離 / コア + 距離
    const rapi = find(3, true, 0.3624, true).trigger;
    expect(Math.abs(popup(rapi, { distance: true }) - 68484)).toBeLessThan(1);
    expect(Math.abs(popup(rapi, { core: true, distance: true }) - 106530)).toBeLessThan(1);
  });

  it('adds the attack damage of the burst (36.24%) and S2 (20.99%) (recording: デルタ 208,626 / 284,232 / 315,521 / 328,023 / 410,029)', () => {
    const none = find(2, false, 0, false).trigger;
    expect(Math.abs(popup(none, { core: true }) - 208626)).toBeLessThan(1);
    expect(Math.abs(popup(find(2, false, 0.3624, false).trigger, { core: true }) - 284232)).toBeLessThan(1);
    expect(Math.abs(popup(find(2, false, 0.2099, false).trigger, { core: true, crit: true }) - 315521)).toBeLessThan(1);
    expect(Math.abs(popup(find(2, false, 0.5723, false).trigger, { core: true }) - 328023)).toBeLessThan(1);
    expect(Math.abs(popup(find(2, true, 0.5723, false).trigger, { core: true }) - 410029)).toBeLessThan(1);
  });

  it('heals クラウン every 860 of her normal shots and gives every ally 7 s of attack damage from the next frame', () => {
    const shots = plan.shots[1]!.frames;
    const heals = plan.timeline.heals.map((h) => h.frame);
    expect(heals).toEqual(shots.filter((_, i) => (i + 1) % 860 === 0).map((f) => f + 1));
    expect(heals.length).toBeGreaterThanOrEqual(6);
    for (const i of [0, 1, 2, 3]) {
      const s2 = calc.slots[i]!.windows.filter((w) => w.effect.trigger === 'healed');
      expect(s2.map((w) => w.start)).toEqual(heals.filter((f) => f < plan.frames));
      expect(s2.every((w) => w.end - w.start === 420 || w.end === plan.frames)).toBe(true);
    }
    // クラウンの枠の即時効果にも回復が記録される
    expect(calc.slots[1]!.instants.filter((x) => x.effect.kind === 'heal').map((x) => x.frame)).toEqual(heals);
  });

  it('shortens every ally’s reload (44.35%) for 15 s from each full burst, デルタ included (recording: 61f vs 100f)', () => {
    const delta = segmentsOf(2).filter((s) => s.buffs.reloadSpeed > 0);
    expect(delta.length).toBeGreaterThan(0);
    expect(delta.every((s) => Math.abs(s.buffs.reloadSpeed - 0.4435) < 1e-9)).toBe(true);
  });
});

describe.each(Object.entries(TEAMS))('sim vs calc (7.4): %s', (_name, input) => {
  const sim = runSimulation(input);
  const calc = computeTeamDamage(input);
  const plan = planTeamRun(input);

  it('agree exactly on the schedule, the heals, the skill hits, the bursts and the shot-counted groups', () => {
    expect(sim.schedule).toEqual(calc.schedule);
    expect(sim.instants).toEqual(plan.instants);
    expect(sim.timeline.heals).toEqual(calc.timeline.heals);
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
