// ノア（232。RL・二丁持ち・バースト II）を含む編成: 二丁持ちの RL の通常攻撃は 1 発 2 ヒットで、2 ヒットともゲージを溜める（C-1019）。
// スキルはどれもダメージに効く効果が無い（notes だけ。S2 の挑発はゲージを溜めない。C-1020）ので、定義の有無で値が変わらない。
// 射撃の列のグループ分けも見る。V-0706。
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { enemyEventsOf, enemyLandingsOf, parseEnemyPresets } from '../enemies.ts';
import { runSimulation } from '../sim/engine.ts';
import type { TeamInput } from '../team.ts';
import {
  characterOf,
  describeEveryShotInOneGroup,
  fixedSlot,
  fixedTeam,
  readJson,
  SHOOTING_RANGE_ENEMY,
} from './teamHelpers.ts';

const master = parseEnemyPresets(readJson<Record<string, unknown>>('../../data/enemies.json'));
const profile = master.targetProfiles.find((p) => p.id === 'range-bigarms')!;
const rangeEnemy: EnemyInput = {
  ...SHOOTING_RANGE_ENEMY,
  element: 'Fire',
  events: enemyEventsOf(master, ['range-3min-jump'], 180),
  target: profile,
  landings: enemyLandingsOf(master, ['range-3min-jump'], 180, profile),
};

const NOAH = 232;
const noah = characterOf(NOAH);

/** V-0706 の撮影と同じ: 単騎（操作）・条件は自動・BigArms 灼熱の 3 分モード（II だけなのでバーストは起きない） */
function solo(muzzleCount = noah.shot.muzzleCount): TeamInput {
  const character = { ...noah, shot: { ...noah.shot, muzzleCount } };
  return fixedTeam([], 0, {
    enemy: rangeEnemy,
    burst: false,
    slots: [{ ...fixedSlot(NOAH), character, conditionMode: 'auto' }],
  });
}
/** 実戦寄り（リター（I）+ ノア（II）+ アリス（III）+ モダニア）。手入力の条件 */
const PRACTICAL = fixedTeam([82, NOAH, 191, 260], 2);
const SOLO = solo();

describe('二丁持ちの RL（単騎）', () => {
  const dual = runSimulation(SOLO);

  it('charges the gauge with both hits of a full-charge shot', () => {
    const perHit = noah.shot.targetBurstEnergyPerShot * noah.shot.fullChargeBurstEnergy;
    // 1 発目（戦闘開始の後の最初の発。フルチャージ）
    expect(dual.shotGauges.find((g) => g.slotIndex === 0)!.energy).toBeCloseTo(2 * perHit, 6);
  });

  it('deals two hits per shot (twice the single-muzzle damage)', () => {
    const single = runSimulation(solo(1));
    expect(dual.slots[0]!.totalDamage).toBeCloseTo(2 * single.slots[0]!.totalDamage, 3);
  });
});

describe('スキルはダメージを変えない（実戦寄り）', () => {
  it('gives the same damage with or without the definition', () => {
    const { skills: _, ...noahWithout } = PRACTICAL.slots[1]!;
    const without: TeamInput = { ...PRACTICAL, slots: PRACTICAL.slots.map((s, i) => (i === 1 ? noahWithout : s)) };
    expect(runSimulation(PRACTICAL).totalDamage).toBe(runSimulation(without).totalDamage);
  });
});

describeEveryShotInOneGroup({
  '単騎（V-0706 の撮影の条件）': SOLO,
  '実戦寄り（リター + ノア + アリス + モダニア）': PRACTICAL,
});
