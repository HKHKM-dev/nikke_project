// Stage 10: 射撃に効くバフ・CT 短縮・弾丸チャージを含む編成の回帰と、sim と calc の整合（plan/design-stage10.md 8.4・8.5 節）。
// 実データのキャラ（スペック固定）で、既存の録画 19・37 の弾数表示と、撮影予定の録画 A・B の編成を固定する。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { runSimulation, simGroupTotals } from '../sim/engine.ts';
import { firingParams } from '../sim/firing.ts';
import type { ShotLog } from '../sim/shots.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import type { TreasurePhase } from '../skills/treasure.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import { computeTeamDamage, countShotsInRanges, planTeamRun, type TeamInput, type TeamSlotInput } from '../team.ts';
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

const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: 'Fire', hasCore: false };

function team(slots: TeamSlotInput[], controlledSlot: number): TeamInput {
  return { slots, enemy, durationSeconds: 180, burst: true, controlledSlot };
}

/** 射撃の列をマガジンごとの発数に分ける（最後の弾丸で区切る。最後の不完全なマガジンは除く） */
function magazineSizes(log: ShotLog): number[] {
  const sizes: number[] = [];
  let count = 0;
  const last = new Set(log.lastShotFrames ?? []);
  for (const f of log.frames) {
    count += 1;
    if (last.has(f)) {
      sizes.push(count);
      count = 0;
    }
  }
  return sizes;
}

const TEAMS: Record<string, TeamInput> = {
  '録画 37（ラム + デルタ + ドレイク宝物 3）': team([fixedSlot(822), fixedSlot(20), fixedSlot(101, 3)], 2),
  '録画 19（エーテル + デルタ + ノワール）': team([fixedSlot(291), fixedSlot(20), fixedSlot(271)], 2),
  '録画 A（リター + デルタ + ドレイク宝物 3）': team([fixedSlot(82), fixedSlot(20), fixedSlot(101, 3)], 2),
  '録画 B（ラム + アドミ + ユニ + クイーン（真））': team(
    [fixedSlot(822), fixedSlot(172), fixedSlot(160), fixedSlot(870)],
    0,
  ),
};

describe('録画 37: ドレイクの最大装弾数（8.5）', () => {
  it('holds 20 in the full burst with treasure phase 3 (9 × (1 + 0.7218 + 0.5014))', () => {
    const plan = planTeamRun(TEAMS['録画 37（ラム + デルタ + ドレイク宝物 3）']!);
    const sizes = magazineSizes(plan.shots[2]!);
    expect(sizes[0]).toBe(9);
    expect(Math.max(...sizes)).toBe(20);
    expect(sizes.every((n) => n === 9 || n <= 20)).toBe(true);
  });

  it('holds 15 with the base burst only (9 × 1.7218 = 15.496, rounded to nearest)', () => {
    const plan = planTeamRun(team([fixedSlot(822), fixedSlot(20), fixedSlot(101, 0)], 2));
    expect(Math.max(...magazineSizes(plan.shots[2]!))).toBe(15);
  });
});

describe('録画 19: ノワールの最大装弾数 +5 発と弾丸チャージ 39.88%（8.5）', () => {
  const plan = planTeamRun(TEAMS['録画 19（エーテル + デルタ + ノワール）']!);
  const fbStarts = plan.schedule!.fullBurstWindows.map((w) => w.start);

  it('refills every ally at every full burst start, with the max raised in the same frame', () => {
    for (const fb of fbStarts) {
      const at = plan.instants.filter((x) => x.frame === fb);
      // SG 9 → 14: floor(14 × 0.3988) = 5（残弾は 9 以下なので 5 まるまる入る）、SR 6 → 11: floor(11 × 0.3988) = 4
      expect(at.map((x) => [x.slotIndex, x.amount])).toEqual([
        [0, 5],
        [1, 4],
        [2, 5],
      ]);
    }
  });

  it('keeps the first gauge-full frame (no firing buff before the first full burst)', () => {
    const base = planTeamRun({
      ...TEAMS['録画 19（エーテル + デルタ + ノワール）']!,
      slots: [fixedSlot(291), fixedSlot(20), { ...fixedSlot(271), skills: undefined }],
    });
    expect(plan.schedule!.gaugeFullFrames[0]).toBe(base.schedule!.gaugeFullFrames[0]);
    expect(plan.schedule!.fullBurstWindows[0]).toEqual(base.schedule!.fullBurstWindows[0]);
  });
});

describe('録画 39（録画 A）: リターの CT 短縮と最大装弾数', () => {
  const plan = planTeamRun(TEAMS['録画 A（リター + デルタ + ドレイク宝物 3）']!);
  const schedule = plan.schedule!;
  const starts = schedule.fullBurstWindows.map((w) => w.start);

  it('cuts 2.34 / +2.7 / +3.17 s (141 / 303 / 494 f) from every ally at the 1st / 2nd / 3rd+ full burst', () => {
    const cutAt = (fb: number, slot: number) =>
      schedule.cooldownReductions
        .filter((r) => r.frame === fb && r.slotIndex === slot)
        .reduce((s, r) => s + r.frames, 0);
    expect(starts.map((fb) => cutAt(fb, 2))).toEqual([141, 303, 494, 494, 494]);
    expect(starts.map((fb) => cutAt(fb, 1))).toEqual([141, 303, 494, 494, 494]);
  });

  it('raises the max ammo as recording 39 showed (rounded to nearest): Delta 6 → 9, Liter 120 → 174, Drake 9 → 24', () => {
    // 区間のバフ合計から実効の最大装弾数を出し、区間ごとの最大を取る（射撃の回数はリロードの位相で変わるので使わない）
    const calc = computeTeamDamage(TEAMS['録画 A（リター + デルタ + ドレイク宝物 3）']!);
    const max = (i: number) =>
      Math.max(...calc.slots[i]!.segments.map((g) => firingParams(calc.slots[i]!.character.shot, g.buffs).maxAmmo));
    expect(max(0)).toBe(174);
    expect(max(1)).toBe(9);
    expect(max(2)).toBe(24);
  });

  it('shortens the full burst interval below the 40 s of the II / III cooldowns', () => {
    const intervals = starts.slice(1).map((f, k) => f - starts[k]!);
    expect(intervals.every((d) => d < 2400)).toBe(true);
    expect(intervals[intervals.length - 1]!).toBeLessThan(intervals[0]!);
  });
});

describe('録画 B: アドミのリロード速度・ユニのチャージ速度と最大装弾数（撮影予定の編成）', () => {
  const calc = computeTeamDamage(TEAMS['録画 B（ラム + アドミ + ユニ + クイーン（真））']!);
  const ram = calc.slots[0]!;

  it('puts reload speed (アドミ) and charge speed / +1 round (ユニ) on ラム, counted from the shot log', () => {
    const stats = new Set(ram.segments.flatMap((g) => g.timedEffects.map((e) => e.stat)));
    expect(stats).toEqual(new Set(['reloadSpeed', 'critDamage', 'chargeSpeed', 'maxAmmo']));
    expect(ram.segments.some((g) => g.triggerSource === 'shots')).toBe(true);
    // ユニ S2（フルチャージ攻撃ごとに +1 発、5 秒）はユニが撃ち続けるので途切れにくい
    const plan = planTeamRun(TEAMS['録画 B（ラム + アドミ + ユニ + クイーン（真））']!);
    expect(magazineSizes(plan.shots[0]!).filter((n) => n === 7).length).toBeGreaterThan(0);
  });
});

describe.each(Object.entries(TEAMS))('sim vs calc (8.4): %s', (_name, input) => {
  const sim = runSimulation(input);
  const calc = computeTeamDamage(input);
  const plan = planTeamRun(input);

  it('agree exactly on the schedule, the skill hits, the bursts and the shot-counted groups', () => {
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
