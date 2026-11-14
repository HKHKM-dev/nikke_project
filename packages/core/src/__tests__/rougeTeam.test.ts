// ルージュ（272）を含む編成（plan/design-rouge.md）。語彙は skills/__tests__/rouge.test.ts。ここでは味方と組んだ時に:
// S2: 後列（2・4 枠目）なら戦闘開始から自分と両隣にソードコインの攻撃ダメージ▲が付き、前列なら付かない。S1: フルチャージ 8 回ごとに
// 味方全体の CT を縮める。バースト: 味方全体に発動者基準の攻撃力▲。射撃の列のグループ分け。
import { describe, expect, it } from 'vitest';
import { planTeamRun } from '../frame/plan.ts';
import { runSimulation } from '../sim/engine.ts';
import { gameSecondsToFrames } from '../time.ts';
import { describeEveryShotInOneGroup, effectWindows, fixedTeam, skillValueOf } from './teamHelpers.ts';

const ROUGE = 272;

const TEAMS = {
  // 撮影 A: ルージュが後列（2 枠目）。両隣は I-DOLL・フラワーとソルジャーF.A.、隣でないのはデルタ
  'I-DOLL・フラワー + ルージュ + ソルジャーF.A. + デルタ（バーストなし）': fixedTeam([304, ROUGE, 301, 20], 2, {
    burst: false,
  }),
  // 撮影 B: ルージュが前列（3 枠目）
  'ソルジャーF.A. + I-DOLL・サン + ルージュ': fixedTeam([301, 308, ROUGE], 2),
  // 4 枠目（後列）の両隣は 3・5 枠目
  'クルミ + デルタ + ソルジャーF.A. + ルージュ + I-DOLL・フラワー': fixedTeam([862, 20, 301, ROUGE, 304], 2),
};

const swordCoin = { resourceId: ROUGE, skill: 'skill2', stat: 'attackDamage' };

describe('ルージュが後列の 2 枠目（バーストなし）', () => {
  const plan = planTeamRun(TEAMS['I-DOLL・フラワー + ルージュ + ソルジャーF.A. + デルタ（バーストなし）']);

  it('gives Sword Coin to herself and both adjacent allies from the start to the end of battle, and not to others', () => {
    for (const v of [0, 1, 2]) expect(effectWindows(plan, v, swordCoin)).toEqual([{ start: 0, end: plan.frames }]);
    expect(effectWindows(plan, 3, swordCoin)).toEqual([]);
  });
});

describe('ルージュが後列の 4 枠目', () => {
  const plan = planTeamRun(TEAMS['クルミ + デルタ + ソルジャーF.A. + ルージュ + I-DOLL・フラワー']);

  it('gives Sword Coin to slots 3 to 5 only', () => {
    for (const v of [2, 3, 4]) expect(effectWindows(plan, v, swordCoin)).toEqual([{ start: 0, end: plan.frames }]);
    for (const v of [0, 1]) expect(effectWindows(plan, v, swordCoin)).toEqual([]);
  });
});

describe('ルージュが前列の 3 枠目', () => {
  const input = TEAMS['ソルジャーF.A. + I-DOLL・サン + ルージュ'];
  const rouge = 2;
  const plan = planTeamRun(input);
  const sim = runSimulation(input);

  it('gives no Sword Coin in the front row', () => {
    for (const v of [0, 1, 2]) expect(effectWindows(plan, v, swordCoin)).toEqual([]);
  });

  it('cuts the burst cooldown of all allies on every 8th full charge', () => {
    const every = skillValueOf(ROUGE, 'skill1', 1);
    const eighths = plan.shots[rouge]!.frames.filter((_, k) => (k + 1) % every === 0);
    const cuts = sim.schedule!.cooldownReductions.filter((r) => r.sourceSlotIndex === rouge);
    expect(cuts.length).toBe(eighths.length * 3);
    for (const v of [0, 1, 2]) expect(cuts.filter((r) => r.slotIndex === v).map((r) => r.frame)).toEqual(eighths);
    const seconds = skillValueOf(ROUGE, 'skill1', 4);
    expect(cuts.every((r) => r.frames === gameSecondsToFrames(seconds))).toBe(true);
    expect(cuts.some((r) => r.applied > 0)).toBe(true);
  });

  it('gives all allies the caster-based attack up for 10 seconds from each burst use', () => {
    const windows = effectWindows(plan, rouge, { resourceId: ROUGE, skill: 'burst', stat: 'attack' });
    expect(windows.length).toBeGreaterThan(0);
    for (const v of [0, 1])
      expect(effectWindows(plan, v, { resourceId: ROUGE, skill: 'burst', stat: 'attack' })).toEqual(windows);
    for (const w of windows) expect(w.end - w.start).toBe(gameSecondsToFrames(10));
  });
});

describeEveryShotInOneGroup(TEAMS);
