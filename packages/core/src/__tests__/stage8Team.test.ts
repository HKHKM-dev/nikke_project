// Stage 8: 編成単位の確認（plan/design-stage8.md 8.4・8.5 節）。
// - sim と calc が射撃の列・時刻表・区間・倍率ダメージの発動を共有し、倍率ダメージの合計が厳密一致する
// - 通常攻撃の差は離散化だけ（枠 5%・編成 3%）
// - 録画 21（クイーン（真）の分配ダメージ 6,323,975）と録画 20（マナのゲージ速度で 1 回目の満タン 267f）の回帰
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { summarizeSchedule } from '../burst/schedule.ts';
import { computeCadence } from '../cadence.ts';
import type { EnemyInput } from '../damage.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { runSimulation, simGroupTotals } from '../sim/engine.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition, type SkillDefinition } from '../skills/types.ts';
import { computeTeamDamage, planTeamRun, type TeamInput, type TeamSlotInput } from '../team.ts';
import type { CharacterData } from '../types.ts';
import { FPS } from '../weapons.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const DEFINED = new Set(readJson<{ resourceIds: number[] }>('../../data/skills/index.json').resourceIds);

/** スペック固定のニケ。定義があれば Lv10 で載せる */
function fixedSlot(id: number): TeamSlotInput {
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
      definition: parseSkillDefinition(readJson<unknown>(`../../data/skills/${id}.json`)) as SkillDefinition,
      levels: MAX_SKILL_LEVELS,
    };
  }
  return slot;
}

/** 灼熱の的（射撃場の BigArms） */
const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: 'Fire', hasCore: false };

function both(input: TeamInput) {
  return { sim: runSimulation(input), calc: computeTeamDamage(input) };
}

// エーテル（I）+ デルタ（II）+ イサベル（III）+ ドレイク（III）+ クイーン（真）（III）
const TEAM_IDS = [291, 20, 231, 101, 870];

describe('sim vs calc with Stage 8 definitions', () => {
  const input: TeamInput = { slots: TEAM_IDS.map(fixedSlot), enemy, durationSeconds: 180, burst: true };
  const { sim, calc } = both(input);

  it('share the shots, the schedule and the segmentation exactly', () => {
    const plan = planTeamRun(input);
    expect(sim.shots).toEqual(plan.shots);
    expect(sim.schedule).toEqual(calc.schedule);
    expect(sim.timeline.segments).toEqual(calc.timeline.segments);
    // イサベルが III を撃つとフルバーストは 5 秒（2 体目以降の III は枠順で後ろ）
    const windows = calc.schedule!.fullBurstWindows;
    expect(windows.length).toBeGreaterThan(0);
  });

  it('give identical skill-hit (damage) activations and totals', () => {
    for (let i = 0; i < TEAM_IDS.length; i++) {
      const s = sim.slots[i]!;
      const c = calc.slots[i]!;
      expect(s.skillHits.frames.map((f) => f / FPS)).toEqual(c.skillHits.activations.map((a) => a.seconds));
      expect(s.skillHits.damage).toBeCloseTo(c.skillHits.totalDamage, 6);
    }
    // ドレイク（枠 3）は 10 回攻撃ごと: 撃った数 ÷ 10 回
    const drakeShots = sim.shots[3]!.frames.length;
    expect(calc.slots[3]!.skillHits.activations).toHaveLength(Math.floor(drakeShots / 10));
    expect(sim.slots[3]!.skillHits.frames).toEqual(sim.shots[3]!.frames.filter((_, k) => (k + 1) % 10 === 0));
  });

  it('agree within 3% on the team and 5% on every slot', () => {
    expect(Math.abs(sim.totalDamage - calc.totalDamage) / calc.totalDamage).toBeLessThan(0.03);
    for (let i = 0; i < TEAM_IDS.length; i++) {
      const s = sim.slots[i]!;
      const c = calc.slots[i]!;
      expect(Math.abs(s.totalDamage - c.totalDamage) / c.totalDamage, `slot ${i}`).toBeLessThan(0.05);
      const groups = simGroupTotals(sim, i);
      c.segments.forEach((g, j) => {
        const bound = s.character.shot.maxAmmo * g.ranges.length;
        expect(Math.abs(groups[j]!.triggers - g.triggers), `slot ${i} group ${j}`).toBeLessThanOrEqual(bound);
      });
    }
  });
});

describe('ドレイク: 10 回攻撃ごとの倍率ダメージ', () => {
  const drake = fixedSlot(101);
  const team = computeTeamDamage({ slots: [drake], enemy, durationSeconds: 60 });
  const d = team.slots[0]!;

  it('fires without bursts and counts across reloads (9-round magazine)', () => {
    const shots = planTeamRun({ slots: [drake], enemy, durationSeconds: 60 }).shots[0]!.frames;
    expect(drake.character.shot.maxAmmo).toBe(9);
    expect(d.skillHits.activations.map((a) => a.seconds * FPS)).toEqual(shots.filter((_, k) => (k + 1) % 10 === 0));
  });

  it('uses the burstDamage formula: (attack − defence) × 98.55% × (1 + crit) × attack damage × element', () => {
    const hit = d.skillHits.activations[0]!.hit;
    const attack = drake.attackOverride!;
    expect(hit.baseHit).toBe(attack - FIXED_SPEC_ENEMY_DEFENCE);
    expect(hit.multiplier).toBeCloseTo(0.9855, 12);
    expect(hit.boost.fullBurst).toBe(0);
    // 非会心の数値（射撃場で読むもの）
    const nonCrit = hit.perActivation / hit.boost.total;
    expect(nonCrit).toBeCloseTo((attack - 100) * 0.9855, 6);
  });
});

describe('イサベル: 使用回数別の段階とフルバースト 5 秒', () => {
  const input: TeamInput = { slots: [291, 20, 231].map(fixedSlot), enemy, durationSeconds: 180, burst: true };
  const calc = computeTeamDamage(input);
  const isabel = calc.slots[2]!;

  it('shortens every full burst to 5 s', () => {
    const windows = calc.schedule!.fullBurstWindows;
    for (const w of windows.slice(0, -1)) expect(w.end - w.start).toBe(300);
    expect(summarizeSchedule(calc.schedule!, 10800).fullBursts).toBeGreaterThanOrEqual(5);
  });

  it('adds the tier-2 / tier-3 additional damage from the 2nd / 3rd burst on', () => {
    const uses = isabel.burst.activations.length;
    expect(uses).toBeGreaterThanOrEqual(5);
    const byRef = (m: number) => isabel.skillHits.activations.filter((a) => Math.abs(a.hit.multiplier - m) < 1e-9);
    expect(byRef(2.997)).toHaveLength(uses - 1);
    expect(byRef(3.4965)).toHaveLength(uses - 2);
    // バーストと同じフレームに出る
    const burstSeconds = isabel.burst.activations.map((a) => a.seconds);
    for (const a of isabel.skillHits.activations) expect(burstSeconds).toContain(a.seconds);
  });

  it('stacks the lower tiers: crit rate from the 1st use, crit damage from the 2nd, attack from the 3rd', () => {
    const tiers = isabel.windows.map((w) => [w.effect.stat, w.start]);
    const firstOf = (stat: string) => Math.min(...tiers.filter(([s]) => s === stat).map(([, f]) => f as number));
    const use = isabel.burst.activations.map((a) => Math.round(a.seconds * FPS));
    expect(firstOf('critRate')).toBe(use[0]);
    expect(firstOf('critDamage')).toBe(use[1]);
    expect(firstOf('attack')).toBe(use[2]);
  });
});

describe('録画 21: クイーン（真）のバースト 6,323,975（分配ダメージ 90.01%▲）', () => {
  // エーテル（I）+ デルタ（II）+ クイーン（真）（III）、クイーンを操作
  const input: TeamInput = {
    slots: [291, 20, 870].map(fixedSlot),
    enemy,
    durationSeconds: 180,
    burst: true,
    controlledSlot: 2,
  };
  const queen = computeTeamDamage(input).slots[2]!;
  const first = queen.burst.activations[0]!.hit;

  it('applies the distributed damage buff entered at stage 3 (II) to the III burst', () => {
    expect(first.distributedDamageMultiplier).toBeCloseTo(1.9001, 12);
    expect(first.attackDamageMultiplier).toBeCloseTo(1.3, 12);
  });

  it('matches the measured non-crit number within the final-attack rounding', () => {
    // 実測 (180,180 − 100) × 14.2169 × 1.30 × 1.9001 = 6,323,975。calc は最終攻撃力を丸めない（180,179.7）ので 10 ほど小さい
    const nonCrit = first.perActivation / first.boost.total;
    expect(Math.abs(nonCrit - 6_323_975)).toBeLessThan(15);
  });
});

describe('録画 20: マナのゲージ速度 70.4%', () => {
  const input: TeamInput = {
    slots: [291, 20, 290].map(fixedSlot),
    enemy,
    durationSeconds: 180,
    burst: true,
    controlledSlot: 2,
  };
  const { schedule } = planTeamRun(input);

  it('fills the first gauge within ±40f of the recording (267f)', () => {
    const firstShot = Math.min(...input.slots.map((s) => computeCadence(s!.character.shot).firstShotFrames));
    const predicted = schedule!.gaugeFullFrames[0]! - firstShot;
    expect(Math.abs(predicted - 267)).toBeLessThanOrEqual(40);
  });

  it('keeps 5 full bursts 40 s apart (CT-bound)', () => {
    expect(summarizeSchedule(schedule!, 10800).fullBursts).toBe(5);
  });
});
