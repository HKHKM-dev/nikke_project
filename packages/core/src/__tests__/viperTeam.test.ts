// バイパー（112）の S1（ターゲットの出現 = 戦闘開始から 10 秒、味方全体に攻撃力▲）とバースト（印の 58f 後のヒットから 10 秒、
// 敵の防御力▼）を、撮影（V-0894）と同じ編成で見る。宝物版の再突入 2 段階と愛嬌は、II の味方と III を足した編成で見る。
// 「ターゲット」の扱いは plan/design-viper.md 1 節
import { describe, expect, it } from 'vitest';
import { hexagonFrameOf } from '../burst/schedule.ts';
import type { EnemyInput } from '../damage.ts';
import { planTeamRun } from '../frame/plan.ts';
import type { TeamInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import { piecesOf } from './historyHelpers.ts';
import { describeRuns, fixedEnemy, fixedSlot, fixedTeam } from './teamHelpers.ts';

const VIPER = 112;
const FLOWER = 304;
const DELTA = 20;
const KIRI = 33;

const enemy: EnemyInput = fixedEnemy({ element: 'Electronic' });

// 撮影（録画 1439・1440 の並び）: I-DOLL・フラワー（I・1 枠目）・バイパー（II・3 枠目・操作）。III がいないのでフルバーストは無い
const RECORDED: TeamInput = fixedTeam([fixedSlot(FLOWER), null, fixedSlot(VIPER)], 2, { enemy });
// 宝物版のバイパー（II）の後に、II のデルタと III のキリ
const TREASURE: TeamInput = fixedTeam(
  [fixedSlot(FLOWER), fixedSlot(VIPER, { treasurePhase: 3 }), fixedSlot(DELTA), fixedSlot(KIRI)],
  1,
  { enemy },
);

const TEN_SECONDS = gameSecondsToFrames(10);

const fromViper = (team: TeamInput, source: number, stat: string) =>
  piecesOf(planTeamRun(team)).filter((p) => p.sourceSlotIndex === source && p.effect.stat === stat);

describe('I-DOLL・フラワー + バイパー（撮影）', () => {
  const plan = planTeamRun(RECORDED);
  const viperBursts = plan.schedule!.activations.filter((a) => a.slotIndex === 2);

  it('gives the attack up of S1 to all allies from the start of battle for 10 s, once', () => {
    const ups = fromViper(RECORDED, 2, 'attack');
    expect(new Set(ups.map((p) => p.slotIndex))).toEqual(new Set([0, 2]));
    expect(ups.every((p) => p.start === 0 && p.end === TEN_SECONDS)).toBe(true);
    expect(ups[0]!.effect.value).toBeCloseTo(0.2598, 12);
  });

  it('lowers the enemy defense for 10 s from the burst hit, 58 f after the mark, for every burst', () => {
    expect(viperBursts.length).toBeGreaterThan(1);
    expect(plan.schedule!.fullBurstWindows).toEqual([]);
    const downs = fromViper(RECORDED, 2, 'enemyDefenseDown').filter((p) => p.slotIndex === 2);
    expect(downs.map((p) => p.start)).toEqual(viperBursts.map((a) => a.hitFrame));
    expect(downs.every((p) => p.end - p.start === TEN_SECONDS)).toBe(true);
    expect(downs[0]!.effect.value).toBeCloseTo(0.1983, 12);
    // ヒットは発動の印（II から III への六角形の替わり目）の 58f 後（遅れの表の行。C-1613）
    expect(viperBursts.map((a) => a.hitFrame! - hexagonFrameOf(a))).toEqual(viperBursts.map(() => 58));
  });
});

describe('宝物版のバイパー + II + III', () => {
  const plan = planTeamRun(TREASURE);

  it('re-enters Burst II after the burst of Viper, and the other II fires before III', () => {
    const firstChain = plan.schedule!.activations.slice(0, 4).map((a) => [a.slotIndex, a.step]);
    expect(firstChain).toEqual([
      [0, 'Step1'],
      [1, 'Step2'],
      [2, 'Step2'],
      [3, 'Step3'],
    ]);
  });

  it('stacks the sustained damage up only in Vamp, which starts at Full Burst', () => {
    const fullBursts = plan.schedule!.fullBurstWindows;
    expect(fullBursts.length).toBeGreaterThan(0);
    const ups = fromViper(TREASURE, 1, 'sustainedDamage');
    expect(ups.length).toBeGreaterThan(0);
    // 最初のフルバーストの前にもバイパーは撃っているが、愛嬌が無いのでスタックは付かない
    expect(plan.shots[1]!.frames.some((f) => f < fullBursts[0]!.start)).toBe(true);
    expect(ups.every((p) => p.slotIndex === 1 && p.start > fullBursts[0]!.start)).toBe(true);
  });
});

describeRuns({ RECORDED, TREASURE });
