// ルマニ（240）を含む編成: バーストの通常攻撃ダメージ倍率▲（10 秒）は、使用のフレームから味方全体（自分を含む）に付き、
// 通常攻撃の武器倍率に (1 + 値) を掛けて丸める（C-0121 の形。フルチャージ倍率とは別の乗数で、ジルのマグナム弾の
// 通常攻撃ダメージ倍率▲とは 1 つの和）。V-0762 の撮影 A・B の編成と、実戦寄りの編成。
import { describe, expect, it } from 'vitest';
import { planTeamRun } from '../frame/plan.ts';
import { runSimulation } from '../sim/engine.ts';
import { simTeamResult } from '../sim/teamResult.ts';
import { scaleBasisPoints } from '../skills/buffs.ts';
import type { TeamInput } from '../team.ts';
import {
  characterOf,
  describeEveryShotInOneGroup,
  effectWindows,
  fixedTeam,
  skillValueOf,
  windowsFrom,
} from './teamHelpers.ts';

const RUMANI = 240;
const JILL = 841;
const UP = { resourceId: RUMANI, skill: 'burst', stat: 'normalAttackDamage' };
const VALUE = skillValueOf(RUMANI, 'burst', 3) / 100;

// 撮影 A: ルマニ単騎（操作）
const SHOOT_A = fixedTeam([RUMANI], 0);
// 撮影 B: ルマニ（I・操作）+ ジル（III。II がいないのでチェーンは時間切れで戻る）
const SHOOT_B = fixedTeam([RUMANI, JILL], 0);
// 実戦寄り: ルマニ（I）+ クラウン（II）+ ジル（III）+ ラピ：レッドフード（III）
const PRACTICAL = fixedTeam([RUMANI, 330, JILL, 16], 2);

function usesOf(input: TeamInput): number[] {
  return planTeamRun(input)
    .schedule!.activations.filter((a) => a.slotIndex === 0)
    .map((a) => a.frame);
}

/** 枠の通常攻撃のグループを、ルマニの▲の有無で分ける */
function groupsOf(input: TeamInput, slot: number) {
  const segments = simTeamResult(input, runSimulation(input)).slots[slot]!.segments.filter((g) => g.triggers > 0);
  const hasUp = (g: (typeof segments)[number]) =>
    g.timedEffects.some((e) => e.source.resourceId === RUMANI && e.stat === 'normalAttackDamage');
  return { inside: segments.filter(hasUp), outside: segments.filter((g) => !hasUp(g)) };
}

describe('撮影 A の編成（ルマニ単騎。V-0762）', () => {
  const plan = planTeamRun(SHOOT_A);
  const uses = usesOf(SHOOT_A);

  it('opens the multiplier up on herself from each burst use, for 10 s', () => {
    expect(uses.length).toBeGreaterThan(5);
    expect(effectWindows(plan, 0, UP)).toEqual(windowsFrom(uses, 10, plan.frames));
  });

  it('scales the rounded weapon multiplier and leaves the full charge multiplier as it is', () => {
    const { inside, outside } = groupsOf(SHOOT_A, 0);
    expect(inside.length).toBeGreaterThan(0);
    const damage = characterOf(RUMANI).shot.damage;
    for (const g of inside) {
      expect(g.trigger.normalAttackMultiplier).toBe(scaleBasisPoints(damage, VALUE) / damage);
      expect(g.trigger.chargeMultiplier).toBe(characterOf(RUMANI).shot.fullChargeDamage);
    }
    for (const g of outside) expect(g.trigger.normalAttackMultiplier).toBe(1);
  });
});

describe('撮影 B の編成（ルマニ + ジル。V-0762）', () => {
  const plan = planTeamRun(SHOOT_B);
  const uses = usesOf(SHOOT_B);

  it('opens the multiplier up on Jill on the same frames as on Rumani', () => {
    expect(uses.length).toBeGreaterThan(5);
    const windows = windowsFrom(uses, 10, plan.frames);
    expect(effectWindows(plan, 0, UP)).toEqual(windows);
    expect(effectWindows(plan, 1, UP)).toEqual(windows);
  });

  it('adds the multiplier up to Magnum Round in one sum on the Jill weapon multiplier', () => {
    const { inside } = groupsOf(SHOOT_B, 1);
    const damage = characterOf(JILL).shot.damage;
    const magnum = skillValueOf(JILL, 'skill1', 1) / 100;
    const both = inside.filter((g) => g.buffs.normalAttackDamage > VALUE + 1e-9);
    expect(both.length).toBeGreaterThan(0);
    for (const g of both) {
      expect(g.trigger.normalAttackMultiplier).toBe(scaleBasisPoints(damage, magnum + VALUE) / damage);
    }
  });
});

describe('実戦寄りの編成（ルマニ + クラウン + ジル + ラピ：レッドフード）', () => {
  const plan = planTeamRun(PRACTICAL);
  const uses = usesOf(PRACTICAL);

  it('opens the multiplier up on every slot from each Rumani burst use, for 10 s', () => {
    expect(uses.length).toBeGreaterThan(3);
    const windows = windowsFrom(uses, 10, plan.frames);
    for (const slot of [0, 1, 2, 3]) expect(effectWindows(plan, slot, UP)).toEqual(windows);
  });
});

describeEveryShotInOneGroup({ '撮影 A': SHOOT_A, '撮影 B': SHOOT_B, 実戦寄り: PRACTICAL });
