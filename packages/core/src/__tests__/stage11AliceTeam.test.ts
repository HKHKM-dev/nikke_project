// Stage 11 アリス編: アリス（191）を含む編成の順位・窓の一致と、sim と calc の整合（plan/design-stage11.md 22.3〜22.6 節）。
// 録画 42（I-DOLL・フラワー + アドミ + アリス（操作）+ I-DOLL・サン）・録画 43（I-DOLL・フラワー + クラウン + アリス（操作）+ マナ + アドミ）の
// 実測値を固定する。数値は plan/verification.md Stage 11 アリス節。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { runSimulation, simGroupTotals } from '../sim/engine.ts';
import { runFirstPass } from '../sim/firstPass.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import type { TreasurePhase } from '../skills/treasure.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import {
  computeTeamDamage,
  countShotsInRanges,
  planTeamRun,
  toTimelineSlots,
  type TeamInput,
  type TeamSlotInput,
} from '../team.ts';
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

const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: null, hasCore: true };

function team(slots: TeamSlotInput[], controlledSlot: number): TeamInput {
  return { slots, enemy, durationSeconds: 180, burst: true, controlledSlot };
}

const REC42 = team([fixedSlot(304), fixedSlot(172), fixedSlot(191), fixedSlot(308)], 2);
const REC43 = team([fixedSlot(304), fixedSlot(330), fixedSlot(191), fixedSlot(290), fixedSlot(172)], 2);
/** 設計書 22.6 節の（撮らなかった）編成。アドミだけで同じフレームの規則が分かれる */
const SUN43 = team([fixedSlot(304), fixedSlot(330), fixedSlot(172), fixedSlot(191), fixedSlot(308)], 3);
const TEAMS: Record<string, TeamInput> = {
  '録画 42（I-DOLL・フラワー + アドミ + アリス + I-DOLL・サン）': REC42,
  '録画 43（I-DOLL・フラワー + クラウン + アリス + マナ + アドミ）': REC43,
  '録画 43 の代案（I-DOLL・フラワー + クラウン + アドミ + アリス + I-DOLL・サン）': SUN43,
  '実戦寄り（リター + クラウン + アリス + ドレイク宝物 3 + ラピ）': team(
    [fixedSlot(82), fixedSlot(330), fixedSlot(191), fixedSlot(101, 3), fixedSlot(10)],
    2,
  ),
};

/** フルバーストごとに、その窓の中の射撃間隔（リロードを挟んだものを除く） */
function intervalsInFullBursts(frames: readonly number[], windows: readonly { start: number; end: number }[]) {
  return windows.map((w) => {
    const inside = frames.filter((f) => f >= w.start && f < w.end);
    return inside.slice(1).map((f, k) => f - inside[k]!);
  });
}

/** 操作キャラの 1 発（非会心・丸める前）。攻撃力は整数に丸めてから防御力を引く（capture-pitfalls）。表示とは 1 以内で合う（録画 41 と同じ） */
function aliceHit(
  attack: number,
  charge: number,
  extra: { core?: boolean; distance?: boolean },
  attackDamage = 1,
): number {
  const boost = 1 + (extra.core ? 1 : 0) + (extra.distance ? 0.3 : 0) + 0.5;
  return (Math.round(attack) - FIXED_SPEC_ENEMY_DEFENCE) * 0.6904 * charge * boost * attackDamage;
}

/** 枠 i のフレーム f を含む区間の結果 */
function segmentAt(calc: ReturnType<typeof computeTeamDamage>, i: number, f: number) {
  const g = calc.slots[i]!.segments.find((s) => s.ranges.some((r) => r.start <= f && f < r.end));
  if (!g) throw new Error(`no segment for slot ${i} at ${f}`);
  return g;
}

/** いちばん多い値 */
function mode(values: readonly number[]): number {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]![0];
}

describe('録画 42: アリスの S1 は自分とアドミに付く（22.5、実測）', () => {
  const plan = planTeamRun(REC42);
  const calc = computeTeamDamage(REC42);
  const windows = plan.schedule!.fullBurstWindows;

  it('opens 9 full bursts, III alternating アリス / サン, and ranks アリス then アドミ every time', () => {
    expect(windows).toHaveLength(9);
    expect(windows.map((w) => w.burstUsers[2])).toEqual([2, 3, 2, 3, 2, 3, 2, 3, 2]);
    const s1 = plan.timeline.rankings.filter((r) => r.effect.effectIndex === 0);
    expect(s1.map((r) => r.frame)).toEqual(windows.map((w) => w.start));
    for (const r of s1) {
      expect(r.targets).toEqual([2, 1]);
      expect(r.tied).toBe(false);
    }
    // アリスの回はバーストの攻撃力 55.12% が同じフレームで順位に入る
    expect(s1[0]!.finalAttacks[2]).toBeCloseTo(119896 * 1.5512, 6);
    expect(s1[1]!.finalAttacks[2]).toBe(119896);
    expect(s1[0]!.finalAttacks[1]).toBe(99925);
  });

  // 実測: アリス 31f / 101f（外 112f）、アドミ 72f（外 82f）、フラワー 82f。アリスは ±1f（姿勢の変化で読んだ）
  it('predicts the shot intervals: アリス 30f / 102f, アドミ 72f, フラワー 82f (outside: 112f / 82f / 82f)', () => {
    const alice = intervalsInFullBursts(plan.shots[2]!.frames, windows);
    // マガジンの中の間隔（いちばん多い値）。リロードを挟んだ間隔（89f・161f）は除く
    alice.forEach((list, k) => {
      expect(mode(list)).toBe(k % 2 === 0 ? 30 : 102);
      expect(list.every((d) => d === mode(list) || d > mode(list) + 40)).toBe(true);
    });
    for (const list of intervalsInFullBursts(plan.shots[1]!.frames, windows)) {
      // 発動者基準: アリスの基礎チャージ時間 1.5 秒 × 11.67% = 0.175 秒を引く（60 − 10.5 = 49.5 → 50f + 22f）
      expect(list.filter((d) => d < 100).every((d) => d === 72)).toBe(true);
    }
    for (const list of intervalsInFullBursts(plan.shots[0]!.frames, windows)) {
      expect(list.filter((d) => d < 100).every((d) => d === 82)).toBe(true);
    }
    const before = plan.shots[2]!.frames.filter((f) => f < windows[0]!.start);
    expect(before.slice(1).map((f, k) => f - before[k]!)).toContain(112);
  });

  it('adds charge damage 7% to アリス (3.5 → 3.57) and アドミ (2.5 → 2.57) in the full bursts only', () => {
    for (const [i, base] of [
      [2, 3.5],
      [1, 2.5],
    ] as const) {
      for (const g of calc.slots[i]!.segments) {
        const inS1 = g.buffs.chargeDamage > 0;
        expect(g.trigger.chargeMultiplier).toBeCloseTo(inS1 ? base + 0.07 : base, 9);
        if (inS1) expect(g.fullBurst).toBe(true);
      }
    }
    expect(calc.slots[0]!.segments.every((g) => g.buffs.chargeDamage === 0)).toBe(true);
    expect(calc.slots[3]!.segments.every((g) => g.buffs.chargeDamage === 0)).toBe(true);
  });

  it('matches アリス’s hits (recording: 1,145,378 core in アリス’s round, 826,741 core + distance in サン’s)', () => {
    const alice = plan.shots[2]!.frames;
    const inRound = (k: number) => alice.find((f) => f > windows[k]!.start + 30 && f < windows[k]!.end)!;
    const own = segmentAt(calc, 2, inRound(0)).trigger;
    const sun = segmentAt(calc, 2, inRound(1)).trigger;
    expect(Math.round(own.attack)).toBe(185983);
    expect(own.chargeMultiplier).toBeCloseTo(3.57, 9);
    expect(Math.abs(aliceHit(own.attack, own.chargeMultiplier, { core: true }) - 1145378)).toBeLessThan(1);
    expect(sun.attack).toBe(119896);
    expect(sun.chargeMultiplier).toBeCloseTo(3.57, 9);
    expect(Math.abs(aliceHit(sun.attack, sun.chargeMultiplier, { core: true, distance: true }) - 826741)).toBeLessThan(
      1,
    );
  });

  it('chooses the same targets in the loop (charge speed) and in planBuffTimeline (charge damage)', () => {
    const first = runFirstPass(toTimelineSlots(REC42.slots), {
      frames: plan.frames,
      burst: true,
      controlledSlot: 2,
    });
    const key = (w: { slotIndex: number; start: number; end: number }) => `${w.slotIndex}:${w.start}-${w.end}`;
    const speed = first.firingWindows.filter(
      (w) => w.effect.source.resourceId === 191 && w.effect.target === 'topAttack',
    );
    const damage = plan.timeline.windows.filter((w) => w.effect.stat === 'chargeDamage');
    expect(speed.map(key).sort()).toEqual(damage.map(key).sort());
    // 順位のために追った攻撃力の窓は、planBuffTimeline の攻撃力の窓と同じ
    const attack = plan.timeline.windows.filter((w) => w.effect.stat === 'attack');
    expect(first.rankAttackWindows.map(key).sort()).toEqual(attack.map(key).sort());
    expect(first.rankAttackWindows.length).toBeGreaterThan(0);
  });
});

describe('録画 43: 同じフレームのバフも順位に入る（22.6、RANK_INCLUDES_SAME_FRAME、実測）', () => {
  const plan = planTeamRun(REC43);
  const calc = computeTeamDamage(REC43);
  const windows = plan.schedule!.fullBurstWindows;

  it('gives アリス’s S1 to マナ + アリス on アリス’s rounds and マナ + クラウン on マナ’s (recording: 2,580,367 / 1,274,396)', () => {
    const s1 = plan.timeline.rankings.filter((r) => r.effect.effectIndex === 0);
    expect(s1).toHaveLength(9);
    s1.forEach((r, k) => {
      // マナは常時 58.08% と FB 開始時 63.36%（同じフレーム）、クラウンは自分の S1 の +51,921（同じフレーム）で上がる
      expect(r.targets).toEqual(windows[k]!.burstUsers[2] === 2 ? [3, 2] : [3, 1]);
    });
    const alice = plan.shots[2]!.frames;
    const inRound = (k: number) => alice.find((f) => f > windows[k]!.start + 30 && f < windows[k]!.end)!;
    const own = segmentAt(calc, 2, inRound(0)).trigger;
    const mana = segmentAt(calc, 2, inRound(1)).trigger;
    // アリスの回: バースト 55.12% + クラウンの S1 +51,921 = 237,904、チャージ 3.57。実機はクラウンのバースト + S2 の ×1.5723
    expect(Math.round(own.attack)).toBe(237904);
    expect(
      Math.abs(aliceHit(own.attack, own.chargeMultiplier, { core: true, distance: true }, 1.5723) - 2580367),
    ).toBeLessThan(1);
    // マナの回: S1 が付かない（3.5）。付いていれば 1,299,885
    expect(mana.attack).toBe(119896);
    expect(mana.chargeMultiplier).toBe(3.5);
    expect(
      Math.abs(aliceHit(mana.attack, mana.chargeMultiplier, { core: true, distance: true }, 1.5723) - 1274396),
    ).toBeLessThan(1);
  });
});

describe('録画 43 の代案（サン）: アドミには一度も付かない', () => {
  const plan = planTeamRun(SUN43);

  it('gives アリス’s S1 to アリス + クラウン (never アドミ), since クラウン’s same-frame +51,921 counts', () => {
    const windows = plan.schedule!.fullBurstWindows;
    const s1 = plan.timeline.rankings.filter((r) => r.effect.effectIndex === 0);
    expect(s1).toHaveLength(9);
    s1.forEach((r, k) => {
      // アリスの回はアリス 237,904 → クラウン 132,406、サンの回はクラウン → アリス 119,896（サン 119,816 は 80 差で 3 位）
      expect(r.targets).toEqual(windows[k]!.burstUsers[2] === 3 ? [3, 1] : [1, 3]);
    });
    const sunRound = s1[1]!;
    expect(sunRound.finalAttacks[3]! - sunRound.finalAttacks[4]!).toBeCloseTo(119896 - (67895 + 80485 * 0.6451), 3);
    // クラウン 80,485 + 51,921（自分の S1）
    expect(s1[0]!.finalAttacks[1]).toBeCloseTo(80485 * 1.6451, 3);
  });
});

describe.each(Object.entries(TEAMS))('sim vs calc (22.4): %s', (_name, input) => {
  const sim = runSimulation(input);
  const calc = computeTeamDamage(input);
  const plan = planTeamRun(input);

  it('agree exactly on the schedule, the rankings, the instants, the skill hits and the shot-counted groups', () => {
    expect(sim.schedule).toEqual(calc.schedule);
    expect(sim.instants).toEqual(plan.instants);
    expect(sim.timeline.rankings).toEqual(calc.timeline.rankings);
    expect(calc.timeline.rankings.length).toBeGreaterThan(0);
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
