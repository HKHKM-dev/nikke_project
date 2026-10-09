// ウンファ：タクティカル・アップ（95）のバーストの炸裂弾の時刻（plan/design-eunhwa-tu-burst-shot-timing.md）: 的の表の
// weaponChangeFirstHitFrames があれば、使用武器変更の最初の発を、発動の印（六角形の替わり目）+ 帯の値のフレームに撃つ（C-0509）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { hexagonFrameOf } from '../burst/schedule.ts';
import { computeTeamDamage } from '../calc/model.ts';
import type { EnemyInput } from '../damage.ts';
import { enemyEventsOf, enemyLandingsOf, parseEnemyPresets } from '../enemies.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { flightFramesAt, landingFrameSpans, slotWeaponChangeFirstHitsOf } from '../frame/landing.ts';
import { planTeamRun } from '../frame/plan.ts';
import { METRICS } from '../records/observations.ts';
import { runSimulation } from '../sim/engine.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
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
// 炸裂弾の表を外した的（いままでのモデル）
const { weaponChangeFirstHitFrames: _table, ...profileWithoutTable } = profile;
const withTable = rangeEnemy(profile);
const withoutTable = rangeEnemy(profileWithoutTable);
const FRAMES = gameSecondsToFrames(180);

function fixedSlot(id: number): TeamSlotInput {
  const character = readJson<CharacterData>(`../../data/characters/${id}.json`);
  const fixed = computeFixedSpecAttack(character);
  return {
    character,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true },
    skills: {
      definition: parseSkillDefinition(readJson<unknown>(`../../data/skills/${id}.json`)),
      levels: MAX_SKILL_LEVELS,
    },
  };
}

// 録画 232・401 と同じ: I-DOLL・フラワー（操作・撃たない扱いはしない）+ ウンファ：TU・BigArms 灼熱の 3 分モード
function team(enemy: EnemyInput): TeamInput {
  return { slots: [fixedSlot(304), fixedSlot(95)], enemy, durationSeconds: 180, burst: true, controlledSlot: 0 };
}

/** ウンファの各回の II の発動の印から、使用武器変更の最初の発までのフレーム（と、そのときの帯） */
function firstShotsOf(enemy: EnemyInput) {
  const run = planTeamRun(team(enemy));
  const shots = run.shots[1]!.weaponChangeShotFrames ?? [];
  const spans = landingFrameSpans(enemy, run.frames);
  return run
    .schedule!.activations.filter((a) => a.slotIndex === 1)
    .flatMap((a) => {
      const shot = shots.find((f) => f >= a.frame);
      if (shot === undefined) return [];
      const band = spans.find((s) => s.start <= a.frame && a.frame < s.end)?.band ?? null;
      return [{ band, delay: shot - hexagonFrameOf(a) }];
    });
}

describe('炸裂弾の時刻の表（plan/design-eunhwa-tu-burst-shot-timing.md 4・5 節）', () => {
  it('looks up the row of the weapon change by the landing band, and nothing for other slots or enemies', () => {
    const [flower, eunhwa] = slotWeaponChangeFirstHitsOf([fixedSlot(304), fixedSlot(95)], withTable, FRAMES);
    expect(flower).toBeNull();
    // 着地点の順は中近 → 近 → 遠 → 中遠 → 近 → 遠（range-3min-jump）
    expect(eunhwa?.burst?.map((s) => s.frames)).toEqual([24, 22, 28, 25, 22, 28]);
    expect(flightFramesAt(eunhwa?.burst, 0)).toBe(24);
    expect(slotWeaponChangeFirstHitsOf([fixedSlot(95)], withoutTable, FRAMES)).toEqual([null]);
    expect(
      slotWeaponChangeFirstHitsOf([fixedSlot(95)], { defence: 100, element: null, hasCore: true }, FRAMES),
    ).toEqual([null]);
  });

  it('rejects a non-integer value or a key that is not <resourceId>:<skill slot>', () => {
    const bad = (weaponChangeFirstHitFrames: unknown) => () =>
      parseEnemyPresets({
        ...rawMaster,
        targetProfiles: (rawMaster.targetProfiles as Record<string, unknown>[]).map((p) => ({
          ...p,
          weaponChangeFirstHitFrames,
        })),
      });
    expect(bad({ '95:burst': { near: 22.5 } })).toThrow(/non-negative integer/);
    expect(bad({ explosiveRound: { near: 22 } })).toThrow(/resourceId/);
  });
});

describe('使用武器変更の最初の発（1 パス目）', () => {
  it('fires the explosive round at the hexagon change + the band value (C-0509)', () => {
    const shots = firstShotsOf(withTable);
    expect(shots.length).toBeGreaterThan(3);
    const table: Record<string, number> = { near: 22, midNear: 24, midFar: 25, far: 28 };
    for (const s of shots) expect(s.delay).toBe(table[s.band!]);
    expect(new Set(shots.map((s) => s.band)).size).toBeGreaterThan(1);
  });

  it('keeps the charge weapon wait without the table (25f after the hexagon change)', () => {
    for (const s of firstShotsOf(withoutTable)) expect(s.delay).toBe(25);
  });

  it('shares the shots between sim and calc', () => {
    const input = team(withTable);
    const sim = runSimulation(input);
    const calc = computeTeamDamage(input);
    expect(calc.schedule?.activations).toEqual(sim.schedule?.activations);
    expect(sim.shots[1]!.weaponChangeShotFrames).toEqual(planTeamRun(input).shots[1]!.weaponChangeShotFrames);
  });
});

describe('照合の指標 burstEffectFirstShot の band（7 節）', () => {
  it('counts only the activations whose effect fires in the band, from the hexagon change', () => {
    const input = team(withTable);
    const result = runSimulation(input);
    const metric = METRICS.burstEffectFirstShot!;
    const value = (args: Record<string, unknown>) =>
      metric.sim(result, { args, input } as Parameters<typeof metric.sim>[1]);
    expect(value({ slot: 2, n: 0, band: 'near' })).toBe(22);
    expect(value({ slot: 2, n: 1, band: 'near' })).toBe(22);
    expect(value({ slot: 2, n: 0, band: 'midFar' })).toBe(25);
    expect(value({ slot: 2, n: 0, band: 'far' })).toBe(28);
    expect(() => value({ slot: 2, n: 99, band: 'far' })).toThrow('99 回目の発動が無い');
  });
});
