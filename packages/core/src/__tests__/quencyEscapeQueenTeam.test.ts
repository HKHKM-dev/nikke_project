// クエンシー：エスケープクイーン（403）を含む編成: S2 のルート探索 1〜3 段階（通常攻撃 2 回ごと。2・3 段階は下の段階のフルスタックの時
// だけ付く）の命中率▲・攻撃力▲のスタックと、S1 の「ルート探索 N 段階フルスタック状態の時のみ」の▲（while。2・3 段階は条件つきの付与の
// 状態を見る）、バーストの分配ダメージと射撃の列のグループ分け。V-0702。
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { planTeamRun } from '../frame/plan.ts';
import { countShotsInRanges } from '../frame/shots.ts';
import { runSimulation } from '../sim/engine.ts';
import type { TeamInput } from '../team.ts';
import { runTeam } from './runTeam.ts';
import { fixedEnemy, fixedSlot, fixedTeam, shootingRangeEnemy } from './teamHelpers.ts';

const rangeEnemy: EnemyInput = shootingRangeEnemy();
const plainEnemy: EnemyInput = fixedEnemy();
const QUENCY = 403;
// Lv10 の値（説明文の値 02〜07 と S1 の値 01〜03）
const HIT = [0.0136, 0.0271, 0.0408];
const ATK = [0.0245, 0.049, 0.0736];
const STACKS = [10, 10, 5];

// V-0702 の撮影 S と同じ: 単騎（操作）・条件は自動・バーストなし・BigArms 灼熱の 3 分モード
const SOLO: TeamInput = {
  slots: [fixedSlot(QUENCY, { conditionMode: 'auto' })],
  enemy: rangeEnemy,
  durationSeconds: 180,
  burst: false,
  controlledSlot: 0,
};
// V-0702 の撮影 B と同じ: リター（I）+ デルタ（II）+ クエンシー：エスケープクイーン（III・操作）・オートバースト
const BURST: TeamInput = {
  slots: [
    fixedSlot(82, { conditionMode: 'auto' }),
    fixedSlot(20, { conditionMode: 'auto' }),
    fixedSlot(QUENCY, { conditionMode: 'auto' }),
  ],
  enemy: rangeEnemy,
  durationSeconds: 180,
  burst: true,
  controlledSlot: 2,
};
// 実戦寄り（リター + デルタ + クエンシー：エスケープクイーン + アリス + モダニア）。手入力の条件
const PRACTICAL: TeamInput = fixedTeam(
  [fixedSlot(82), fixedSlot(20), fixedSlot(QUENCY), fixedSlot(191), fixedSlot(260)],
  2,
  { enemy: plainEnemy },
);

describe('ルート探索の段（単騎）', () => {
  const plan = planTeamRun(SOLO);
  const sim = runSimulation(SOLO);
  const shots = plan.shots[0]!.frames;
  const buffsAtShot = (n: number) => {
    const frame = shots[n - 1]!;
    return sim.timeline.segments.find((s) => s.start <= frame && frame < s.end)!.slots[0]!.buffs;
  };
  /** 段階ごとのスタック数から、攻撃力▲の和 */
  const attackOf = (s1: number, s2: number, s3: number) => s1 * ATK[0]! + s2 * ATK[1]! + s3 * ATK[2]!;

  it('adds a Stage 1 stack every 2 shots, with Stage 2 and Stage 3 starting on the firing that fills the lower stage', () => {
    expect(buffsAtShot(2).attackRatio).toBe(0);
    expect(buffsAtShot(3).attackRatio).toBeCloseTo(attackOf(1, 0, 0), 12);
    expect(buffsAtShot(19).attackRatio).toBeCloseTo(attackOf(9, 0, 0), 12);
    // 1 段階が満ちた発火（20 発目）で 2 段階も付き、2 段階が満ちた発火（38 発目）で 3 段階も付く（sameFiring）
    expect(buffsAtShot(21).attackRatio).toBeCloseTo(attackOf(10, 1, 0), 12);
    expect(buffsAtShot(37).attackRatio).toBeCloseTo(attackOf(10, 9, 0), 12);
    expect(buffsAtShot(39).attackRatio).toBeCloseTo(attackOf(10, 10, 1), 12);
    expect(buffsAtShot(45).attackRatio).toBeCloseTo(attackOf(10, 10, 4), 12);
    expect(buffsAtShot(47).attackRatio).toBeCloseTo(attackOf(10, 10, 5), 12);
  });

  it('sums the three stages into the hit rate N at full stacks', () => {
    const full = HIT.reduce((sum, v, i) => sum + v * STACKS[i]!, 0);
    expect(buffsAtShot(47).hitRate).toBeCloseTo(full, 12);
    expect(buffsAtShot(19).hitRate).toBeCloseTo(9 * HIT[0]!, 12);
  });

  it('applies the Skill 1 increases only while each stage is at max stacks (Stage 2 and 3 are conditional grants)', () => {
    expect(buffsAtShot(19).distributedDamage).toBe(0);
    expect(buffsAtShot(21).distributedDamage).toBeCloseTo(0.4958, 12);
    expect(buffsAtShot(37).coreDamage).toBe(0);
    expect(buffsAtShot(39).coreDamage).toBeCloseTo(0.2525, 12);
    expect(buffsAtShot(45).critRate).toBe(0);
    expect(buffsAtShot(47).critRate).toBeCloseTo(0.1673, 12);
  });

  it('keeps Stage 1 over the reload and drops Stage 2 and 3', () => {
    const after = buffsAtShot(121);
    expect(after.attackRatio).toBeCloseTo(attackOf(10, 0, 0), 12);
    expect(after.distributedDamage).toBeCloseTo(0.4958, 12);
    expect(after.coreDamage).toBe(0);
  });
});

describe('バースト（リター + デルタ + クエンシー：エスケープクイーン）', () => {
  const sim = runSimulation(BURST);
  const hits = sim.slots[2]!.burst.hits;

  it('deals the distributed damage with the Stage 1 distributed damage increase on every burst', () => {
    expect(hits.length).toBeGreaterThan(1);
    for (const hit of hits) expect(hit.distributedDamageMultiplier).toBeCloseTo(1.4958, 12);
  });
});

describe.each([
  ['単騎（V-0702 の撮影 S の条件）', SOLO],
  ['リター + デルタ + クエンシー：エスケープクイーン（撮影 B の条件）', BURST],
  ['実戦寄り（リター + デルタ + クエンシー：エスケープクイーン + アリス + モダニア）', PRACTICAL],
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
