// ミランダ（32）を含む編成: S1 の 2 つの命中率▲（味方全体 5.44%・SMG の味方 3.79%）が SMG の自分には和で区間の N に入り、
// 条件が自動の枠でコア命中率を C-0036 の式で上げること（C-0186。持続の▲の入れ方は C-0170）、宝物版 S1 の攻撃力▲（C-0187）、
// sim と calc の整合。V-0114。宝物版のバーストの対象（自分を除く上位 2 機、足りなければ自分。C-0322）と、宝物版 S2 の
// フルバーストタイムの発動時の効果（C-0323・C-0324）を、録画 244・245 と同じ編成で見る（V-0216〜V-0218）。
// 宝物版 S2 の 3 行目（自分を除く 1 位に「1 発間」のクリティカル確率▲。topAttack × durationShots。C-0334）は、録画 262 と
// 同じ編成で見る（V-0229。plan/design-ranked-shot-duration.md）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeTeamDamage, countShotsInRanges } from '../calc/model.ts';
import type { EnemyInput } from '../damage.ts';
import { enemyEventsOf, enemyLandingsOf, parseEnemyPresets } from '../enemies.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { coreHitRateWithHitRateUp, landingPartsWith } from '../frame/landing.ts';
import { planTeamRun } from '../frame/plan.ts';
import { runSimulation, simGroupTotals } from '../sim/engine.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { applyTreasureToTeam } from '../skills/treasure.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import type { TreasurePhase } from '../skills/treasure.ts';
import type { CharacterData } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

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

function fixedSlot(id: number, auto: boolean, treasurePhase: TreasurePhase = 0): TeamSlotInput {
  const character = readJson<CharacterData>(`../../data/characters/${id}.json`);
  const fixed = computeFixedSpecAttack(character);
  return {
    character,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true },
    ...(auto ? { conditionMode: 'auto' as const } : {}),
    skills: {
      definition: parseSkillDefinition(readJson<unknown>(`../../data/skills/${id}.json`)),
      levels: MAX_SKILL_LEVELS,
      treasurePhase,
    },
  };
}

const N = 0.0544 + 0.0379;

// V-0114 の撮影と同じ: ミランダ単騎（宝物 3 段階）・AUTO（条件は自動）・オートバースト OFF・BigArms 灼熱の 3 分モード
const SOLO: TeamInput = {
  slots: [fixedSlot(32, true, 3)],
  enemy: rangeEnemy,
  durationSeconds: 180,
  burst: false,
  controlledSlot: 0,
};
// 実戦寄り（ミランダ + リター + デルタ + アリス + モダニア）。手入力の条件とバーストあり。SMG はミランダとリター
const PRACTICAL: TeamInput = {
  slots: [
    fixedSlot(32, false, 3),
    fixedSlot(82, false),
    fixedSlot(20, false),
    fixedSlot(191, false),
    fixedSlot(260, false),
  ],
  enemy: plainEnemy,
  durationSeconds: 180,
  burst: true,
  controlledSlot: 0,
};

// V-0216 の撮影と同じ: ミランダ（宝物 3 段階・操作）+ デルタ。AUTO・オートバースト ON・BigArms 灼熱の 3 分モード。III なし
const DUO: TeamInput = {
  slots: [fixedSlot(32, true, 3), fixedSlot(20, true)],
  enemy: rangeEnemy,
  durationSeconds: 180,
  burst: true,
  controlledSlot: 0,
};
// V-0217・V-0218 の撮影と同じ: ミランダ（宝物 3 段階）+ デルタ + I-DOLL・サン（操作）。フルバーストあり
const TRIO: TeamInput = {
  slots: [fixedSlot(32, true, 3), fixedSlot(20, true), fixedSlot(308, true)],
  enemy: rangeEnemy,
  durationSeconds: 180,
  burst: true,
  controlledSlot: 2,
};

// V-0229 の撮影（録画 262）と同じ: TRIO で操作枠をミランダ（撃たない）に替えた編成
const TRIO_LINE3: TeamInput = {
  slots: [fixedSlot(32, true, 3), fixedSlot(20, true), fixedSlot(308, true)],
  enemy: rangeEnemy,
  durationSeconds: 180,
  burst: true,
  controlledSlot: 0,
};

/** フルバーストに入らなかったミランダのバースト（fullBurst false）か、フルバーストの始まり（true）から 2 秒後の区間 */
function after(input: TeamInput, fullBurst: boolean) {
  const sim = runSimulation(input);
  const acts = sim.schedule!.activations;
  const start = fullBurst
    ? acts.find((a) => a.startsFullBurst)
    : acts.find(
        (a) =>
          a.slotIndex === 0 && !acts.some((b) => b.startsFullBurst && b.frame >= a.frame && b.frame < a.frame + 600),
      );
  expect(start).toBeDefined();
  const frame = start!.frame + 120;
  return sim.timeline.segments.find((s) => s.start <= frame && frame < s.end)!;
}

describe('パワーアップ！（宝物版）の対象', () => {
  it('reaches Miranda herself in the duo (only 1 candidate except self)', () => {
    const seg = after(DUO, false);
    expect(seg.slots[0]!.buffs.attackRatio).toBeCloseTo(0.5006 + 0.404, 12);
    expect(seg.slots[0]!.buffs.critDamage).toBeCloseTo(0.5623, 12);
    expect(seg.slots[1]!.buffs.attackRatio).toBeCloseTo(0.404, 12);
    expect(seg.slots[1]!.buffs.critDamage).toBeCloseTo(0.5623, 12);
  });

  it('skips Miranda in the trio (Delta and Sun are the 2 candidates except self)', () => {
    const seg = after(TRIO, false);
    expect(seg.fullBurst).toBe(false);
    expect(seg.slots[0]!.buffs.attackRatio).toBeCloseTo(0.5006, 12);
    expect(seg.slots[0]!.buffs.critDamage).toBe(0);
    for (const i of [1, 2]) {
      expect(seg.slots[i]!.buffs.attackRatio).toBeCloseTo(0.404, 12);
      expect(seg.slots[i]!.buffs.critDamage).toBeCloseTo(0.5623, 12);
    }
  });
});

describe('ウェイクアップ！（宝物版）のフルバーストタイムの発動時の効果', () => {
  const seg = after(TRIO, true);

  it('gives Critical Rate up and Damage up to Miranda and Critical Damage up to all allies', () => {
    expect(seg.fullBurst).toBe(true);
    const m = seg.slots[0]!.buffs;
    expect(m.critRate).toBeCloseTo(0.301, 12);
    expect(m.attackDamage).toBeCloseTo(0.237, 12);
    expect(m.critDamage).toBeCloseTo(0.3299, 12);
    expect(m.attackRatio).toBeCloseTo(0.5006, 12);
    const d = seg.slots[1]!.buffs;
    expect(d.critDamage).toBeCloseTo(0.5623 + 0.3299, 12);
    expect(d.critRate).toBe(0);
    expect(d.attackDamage).toBe(0);
  });
});

describe('ウェイクアップ！（宝物版）の 3 行目', () => {
  const sim = runSimulation(TRIO_LINE3);
  const plan = planTeamRun(TRIO_LINE3);
  const segmentAt = (frame: number) => sim.timeline.segments.find((s) => s.start <= frame && frame < s.end)!;

  it('gives Critical Rate up to Sun (top ATK except self) from each full burst start to her first shot', () => {
    const fbs = sim.schedule!.fullBurstWindows;
    expect(fbs.length).toBeGreaterThanOrEqual(3);
    const sunShots = plan.shots[2]!.frames;
    for (const fb of fbs) {
      const first = sunShots.find((f) => f >= fb.start);
      if (first === undefined) continue;
      expect(segmentAt(first).slots[2]!.buffs.critRate).toBeCloseTo(0.8542, 12);
      const second = sunShots.find((f) => f > first)!;
      expect(segmentAt(second).slots[2]!.buffs.critRate).toBe(0);
      // デルタとミランダには付かない
      expect(segmentAt(first).slots[1]!.buffs.critRate).toBe(0);
      expect(segmentAt(first).slots[0]!.buffs.critRate).toBeCloseTo(0.301, 12);
    }
  });
});

describe('ヘルスアップ！の命中率▲（ミランダ単騎・条件は自動）', () => {
  const plan = planTeamRun(SOLO);
  const sim = runSimulation(SOLO);
  const shots = plan.shots[0]!.frames;
  const segmentAt = (frame: number) => sim.timeline.segments.find((s) => s.start <= frame && frame < s.end)!;
  const n = (frame: number) => segmentAt(frame).slots[0]!.buffs.hitRate;

  it('puts the sum of the two hit rate ups into the segment N on the SMG self after the 30th hit', () => {
    expect(n(shots[5]!)).toBe(0);
    expect(n(shots[300]!)).toBeCloseTo(N, 12);
    const max = Math.max(...sim.timeline.segments.map((s) => s.slots[0]!.buffs.hitRate));
    expect(max).toBeCloseTo(N, 12);
  });

  it('uses N for the core hit rate of the trigger (C-0036 の式)', () => {
    const slot = applyTreasureToTeam(SOLO).slots[0]!;
    const nearShot = shots.find((f) => segmentAt(f).landing === 'near' && n(f) > N - 1e-9)!;
    expect(nearShot).toBeDefined();
    const seg = segmentAt(nearShot);
    const parts = landingPartsWith(plan.landing, slot, 0, seg.landing, seg.slots[0]!.buffs.hitRate);
    for (const p of parts) {
      expect(p.condition.coreHitRate).toBeCloseTo(coreHitRateWithHitRateUp(p.tableCoreHitRate!, N), 12);
    }
    expect(coreHitRateWithHitRateUp(0.2644, N)).toBeCloseTo(0.321, 3);
  });

  it('gives the treasure S1 ATK up on self (attack ratio 0.5006 in the segment state)', () => {
    const atk = (frame: number) => segmentAt(frame).slots[0]!.buffs.attackRatio;
    expect(atk(shots[5]!)).toBe(0);
    expect(atk(shots[300]!)).toBeCloseTo(0.5006, 12);
  });
});

describe.each([
  ['ミランダ単騎（V-0114 の撮影の条件）', SOLO],
  ['ミランダ + デルタ（V-0216 の撮影の条件）', DUO],
  ['ミランダ + デルタ + I-DOLL・サン（V-0217・V-0218 の撮影の条件）', TRIO],
  ['ミランダ（操作）+ デルタ + I-DOLL・サン（V-0229 の撮影の条件）', TRIO_LINE3],
  ['実戦寄り（ミランダ + リター + デルタ + アリス + モダニア）', PRACTICAL],
] as const)('sim vs calc: %s', (_name, input) => {
  const sim = runSimulation(input);
  const calc = computeTeamDamage(input);
  const plan = planTeamRun(input);

  it('agree exactly on the schedule and the shot-counted groups', () => {
    expect(sim.schedule).toEqual(calc.schedule);
    input.slots.forEach((_, i) => {
      const groups = simGroupTotals(sim, i);
      calc.slots[i]!.segments.forEach((g, j) => {
        if (g.triggerSource !== 'shots') return;
        expect(g.triggers).toBe(groups[j]!.triggers);
        expect(g.damage).toBeCloseTo(groups[j]!.damage, 3);
      });
    });
  });

  it('partitions every shot into exactly one group', () => {
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
