// アニス：スター（17）の満タンと発動の時刻（plan/design-anis-star-gauge-timing.md）: 最初の発の物のゲージ（入力。C-0243）、
// 誘導弾の飛ぶ時間（C-0293）、シューティングスターの飛ぶ時間（C-0240）。どれも 1 パス目のゲージの量と時刻だけを変える。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeTeamDamage } from '../calc/model.ts';
import type { EnemyInput } from '../damage.ts';
import { enemyEventsOf, enemyLandingsOf, parseEnemyPresets } from '../enemies.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { flightFramesAt, slotFlightsOf } from '../frame/landing.ts';
import { planTeamRun } from '../frame/plan.ts';
import { runSimulation } from '../sim/engine.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import { validateObstacleBreaks, type TeamInput, type TeamSlotInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import type { CharacterData, TargetProfile } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const rawMaster = readJson<Record<string, unknown>>('../../data/enemies.json');
const master = parseEnemyPresets(rawMaster);
const profile = master.targetProfiles.find((p) => p.id === 'range-bigarms')!;

function rangeEnemy(target: TargetProfile): EnemyInput {
  return {
    defence: FIXED_SPEC_ENEMY_DEFENCE,
    element: 'Fire',
    hasCore: true,
    events: enemyEventsOf(master, ['range-3min-jump'], 180),
    target,
    landings: enemyLandingsOf(master, ['range-3min-jump'], 180, target),
  };
}
// 飛ぶ時間の表を外した的（いままでのモデル）
const { flightFrames: _flight, ...profileWithoutFlight } = profile;
const withFlight = rangeEnemy(profile);
const withoutFlight = rangeEnemy(profileWithoutFlight);

function fixedSlot(id: number): TeamSlotInput {
  const character = readJson<CharacterData>(`../../data/characters/${id}.json`);
  const fixed = computeFixedSpecAttack(character);
  return {
    character,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    // 条件は手入力（照合の既定）。飛ぶ時間は条件の決め方に依らず、的の表と着地点で決まる（3.3 節）
    condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true },
    skills: {
      definition: parseSkillDefinition(readJson<unknown>(`../../data/skills/${id}.json`)),
      levels: MAX_SKILL_LEVELS,
    },
  };
}

// 録画 164 と同じ: アニス：スター単騎・操作・オートバースト ON・BigArms 灼熱の 3 分モード
function solo(enemy: EnemyInput, extra: Partial<TeamInput> = {}): TeamInput {
  return { slots: [fixedSlot(17)], enemy, durationSeconds: 180, burst: true, controlledSlot: 0, ...extra };
}

describe('飛ぶ時間の表（plan/design-anis-star-gauge-timing.md 3.2・4.2 節）', () => {
  it('looks up the homing projectile and Shooting Star rows by the landing band, and nothing for other enemies', () => {
    const frames = gameSecondsToFrames(180);
    const [anis] = slotFlightsOf([fixedSlot(17)], withFlight, frames);
    expect(anis?.shot?.[0]).toMatchObject({ start: 0, frames: 14 }); // 最初の区間は中近
    expect(anis?.autoAttacks.burst?.[0]).toMatchObject({ start: 0, frames: 12 });
    expect(anis?.shot?.map((s) => s.frames)).toEqual([14, 8, 28, 17, 8, 28]);
    // 表に行の無い弾（I-DOLL・フラワーの誘導弾）・表の無い的は飛ぶ時間なし
    expect(slotFlightsOf([fixedSlot(304)], withFlight, frames)).toEqual([null]);
    expect(slotFlightsOf([fixedSlot(17)], withoutFlight, frames)).toEqual([null]);
    expect(slotFlightsOf([fixedSlot(17)], { defence: 100, element: null, hasCore: true }, frames)).toEqual([null]);
  });

  it('returns 0 outside the spans', () => {
    const spans = [
      { start: 0, end: 10, frames: 5 },
      { start: 10, end: 20, frames: 7 },
    ];
    expect([0, 9, 10, 19, 20, -1].map((f) => flightFramesAt(spans, f))).toEqual([5, 5, 7, 7, 0, 0]);
    expect(flightFramesAt(null, 3)).toBe(0);
  });

  it('rejects a non-integer or unknown flight table', () => {
    const bad = (flightFrames: unknown) => () =>
      parseEnemyPresets({
        ...rawMaster,
        targetProfiles: (rawMaster.targetProfiles as Record<string, unknown>[]).map((p) => ({ ...p, flightFrames })),
      });
    expect(bad({ shots: { RL: { near: 1.5 } } })).toThrow(/non-negative integer/);
    expect(bad({ autoAttacks: { shootingStar: { near: 9 } } })).toThrow(/resourceId/);
    expect(bad({ other: {} })).toThrow(/unknown key/);
  });
});

describe('ゲージの時刻（1 パス目）', () => {
  it('fills the gauge on the landing frame of the shot (firing frame + flight time, C-0236・C-0293)', () => {
    const before = planTeamRun(solo(withoutFlight));
    const after = planTeamRun(solo(withFlight));
    // 1 回目のバーストまでの射撃の列は変わらない（発動が遅れるので、窓から後は変わる）。満タンは 10 発目の着弾（中近の 14f）
    expect(after.shots[0]!.frames.slice(0, 10)).toEqual(before.shots[0]!.frames.slice(0, 10));
    const tenth = before.shots[0]!.frames[9]!;
    expect(before.schedule!.gaugeFullFrames[0]).toBe(tenth);
    expect(after.schedule!.gaugeFullFrames[0]).toBe(tenth + 14);
    expect(after.schedule!.activations[0]!.frame).toBe(tenth + 14 + 23);
  });

  it('adds the obstacle gauge to the shot that broke them (C-0177・C-0243)', () => {
    const run = planTeamRun(solo(withFlight, { obstacleBreaks: [{ slotIndex: 0, shot: 1, count: 2 }] }));
    // 物 2 個 = 14,000 × 2.5 × 1.06 × 2 = 74,200。1 発 103,880 と合わせて 9 発目で満タン（録画 161・181）
    expect(run.schedule!.gaugeFullFrames[0]).toBe(run.shots[0]!.frames[8]! + 14);
  });

  it('lands the Shooting Star hits after their ticks, so the last ones count after the chain wait (C-0240)', () => {
    const before = planTeamRun(solo(withoutFlight));
    const after = planTeamRun(solo(withFlight));
    const ticksOf = (plan: typeof before, a: number) =>
      plan.dotGauges.filter((g) => g.kind === 'tick' && g.frame > a && g.frame <= a + gameSecondsToFrames(11));
    const a0 = before.schedule!.activations[0]!.frame;
    const a1 = after.schedule!.activations[0]!.frame;
    const lastBefore = ticksOf(before, a0).at(-1)!.frame;
    expect(lastBefore).toBe(a0 + gameSecondsToFrames(10)); // 最後の刻みはチェーンの待ちの明けと同じフレーム（溜まらない）
    const lastAfter = ticksOf(after, a1).at(-1)!.frame;
    const flight = slotFlightsOf([fixedSlot(17)], withFlight, gameSecondsToFrames(180))[0]!.autoAttacks.burst!;
    expect(lastAfter).toBe(a1 + gameSecondsToFrames(10) + flightFramesAt(flight, a1 + gameSecondsToFrames(10)));
    expect(ticksOf(after, a1)).toHaveLength(40);
  });

  it('shares the schedule between sim and calc', () => {
    const input = solo(withFlight, { obstacleBreaks: [{ slotIndex: 0, shot: 1, count: 2 }] });
    const sim = runSimulation(input);
    const calc = computeTeamDamage(input);
    expect(calc.schedule?.gaugeFullFrames).toEqual(sim.schedule?.gaugeFullFrames);
    expect(calc.schedule?.activations).toEqual(sim.schedule?.activations);
  });

  it('validates the obstacle breaks', () => {
    const slots = [fixedSlot(17), null];
    expect(() => validateObstacleBreaks(slots, [{ slotIndex: 1, shot: 1, count: 2 }])).toThrow(/filled slot/);
    expect(() => validateObstacleBreaks(slots, [{ slotIndex: 0, shot: 0, count: 2 }])).toThrow(/shot/);
    expect(() => validateObstacleBreaks(slots, [{ slotIndex: 0, shot: 1, count: 0 }])).toThrow(/count/);
    expect(() =>
      validateObstacleBreaks(slots, [
        { slotIndex: 0, shot: 1, count: 2 },
        { slotIndex: 0, shot: 1, count: 1 },
      ]),
    ).toThrow(/duplicate/);
    expect(() => validateObstacleBreaks(slots, undefined)).not.toThrow();
  });
});
