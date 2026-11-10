// ノア（232。RL・二丁持ち・バースト II）を含む編成: 二丁持ちの RL の通常攻撃は 1 発 2 ヒットで、2 ヒットともゲージを溜める（C-1019）。
// スキルはどれもダメージに効く効果が無い（notes だけ。S2 の挑発はゲージを溜めない。C-1020）ので、定義の有無で値が変わらない。
// 射撃の列のグループ分けも見る。V-0706。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { enemyEventsOf, enemyLandingsOf, parseEnemyPresets } from '../enemies.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { planTeamRun } from '../frame/plan.ts';
import { countShotsInRanges } from '../frame/shots.ts';
import { runSimulation } from '../sim/engine.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import type { CharacterData } from '../types.ts';
import { runTeam } from './runTeam.ts';

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

const NOAH = 232;

function fixedSlot(id: number, auto: boolean, options: { muzzleCount?: number; skills?: boolean } = {}): TeamSlotInput {
  const data = readJson<CharacterData>(`../../data/characters/${id}.json`);
  const character =
    options.muzzleCount === undefined ? data : { ...data, shot: { ...data.shot, muzzleCount: options.muzzleCount } };
  const fixed = computeFixedSpecAttack(character);
  return {
    character,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true },
    ...(auto ? { conditionMode: 'auto' as const } : {}),
    ...(options.skills === false
      ? {}
      : {
          skills: {
            definition: parseSkillDefinition(readJson<unknown>(`../../data/skills/${id}.json`)),
            levels: MAX_SKILL_LEVELS,
          },
        }),
  };
}

const solo = (options: { muzzleCount?: number } = {}): TeamInput => ({
  slots: [fixedSlot(NOAH, true, options)],
  enemy: rangeEnemy,
  durationSeconds: 180,
  burst: false,
  controlledSlot: 0,
});
// V-0706 の撮影と同じ: 単騎（操作）・条件は自動・BigArms 灼熱の 3 分モード（II だけなのでバーストは起きない）
const SOLO = solo();
// 実戦寄り（リター（I）+ ノア（II）+ アリス（III）+ モダニア）。手入力の条件
const practical = (noahSkills: boolean): TeamInput => ({
  slots: [
    fixedSlot(82, false),
    fixedSlot(NOAH, false, { skills: noahSkills }),
    fixedSlot(191, false),
    fixedSlot(260, false),
  ],
  enemy: plainEnemy,
  durationSeconds: 180,
  burst: true,
  controlledSlot: 2,
});
const PRACTICAL = practical(true);

describe('二丁持ちの RL（単騎）', () => {
  const noah = readJson<CharacterData>(`../../data/characters/${NOAH}.json`);

  it('charges the gauge with both hits of a full-charge shot', () => {
    const plan = planTeamRun(SOLO);
    const perHit = noah.shot.targetBurstEnergyPerShot * noah.shot.fullChargeBurstEnergy;
    // 1 発目（戦闘開始の後の最初の発。フルチャージ）
    expect(plan.shotGauges.find((g) => g.slotIndex === 0)!.energy).toBeCloseTo(2 * perHit, 6);
  });

  it('deals two hits per shot (twice the single-muzzle damage)', () => {
    const dual = runSimulation(SOLO).slots[0]!;
    const single = runSimulation(solo({ muzzleCount: 1 })).slots[0]!;
    expect(dual.totalDamage).toBeCloseTo(2 * single.totalDamage, 3);
  });
});

describe('スキルはダメージを変えない（実戦寄り）', () => {
  it('gives the same damage with or without the definition', () => {
    const withSkills = runSimulation(PRACTICAL);
    const without = runSimulation(practical(false));
    expect(withSkills.totalDamage).toBe(without.totalDamage);
  });
});

describe.each([
  ['単騎（V-0706 の撮影の条件）', SOLO],
  ['実戦寄り（リター + ノア + アリス + モダニア）', PRACTICAL],
] as const)('編成: %s', (_name, input) => {
  const calc = runTeam(input);
  const plan = planTeamRun(input);

  it('partitions every shot into exactly one group', () => {
    input.slots.forEach((_, i) => {
      const frames = plan.shots[i]!.frames;
      const total = calc.slots[i]!.segments.reduce((sum, g) => sum + countShotsInRanges(frames, g.ranges), 0);
      expect(total).toBe(frames.length);
    });
  });
});
