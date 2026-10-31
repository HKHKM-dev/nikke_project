// ティア（451）を含む編成（2 段目の段 15 の PR 2。plan/design-skill-stage15.md 2.2 節。V-0566）。きっかけ { coverHealed } と T4 の▼の
// 細かい動きは skills/__tests__/stage15Tia.test.ts。ここでは味方と組んだ時に:
// S1: バースト使用時の遮蔽物 HP 回復（S2）で、味方全体に攻撃ダメージ▲（10 秒。C-0776）。
// バースト: 再突入で、ティアの後のバースト段階は I に戻る（キャラのデータの nextStep が Step1。定義の burstReentry も同じ段）。
// 射撃の列のグループ分け。
import { describe, expect, it } from 'vitest';
import { planTeamRun } from '../frame/plan.ts';
import { gameSecondsToFrames } from '../time.ts';
import { effectWindows, expectEveryShotInOneGroup, fixedTeam } from './teamHelpers.ts';

const TIA = 451;

const TEAMS = {
  単騎: fixedTeam([TIA], 0),
  'ティア + デルタ + スノーホワイト：ヘビーアームズ': fixedTeam([TIA, 20, 471], 2),
  'ティア + ミルク + デルタ + スノーホワイト：ヘビーアームズ': fixedTeam([TIA, 141, 20, 471], 3),
};

describe.each([
  ['ティア + デルタ + スノーホワイト：ヘビーアームズ', 3],
  ['ティア + ミルク + デルタ + スノーホワイト：ヘビーアームズ', 4],
] as const)('%s', (name, size) => {
  const input = TEAMS[name];
  const plan = planTeamRun(input);
  const activations = plan.schedule!.activations;
  const uses = activations.filter((a) => a.slotIndex === 0);

  it('raises the attack damage of every ally for 10 s from every burst use (S1 via the S2 cover heal)', () => {
    expect(uses.length).toBeGreaterThan(2);
    const expected = uses.map((a) => ({
      start: a.frame,
      end: Math.min(a.frame + gameSecondsToFrames(10), plan.frames),
    }));
    for (let slot = 0; slot < size; slot++) {
      expect(
        effectWindows(
          plan,
          slot,
          (p) =>
            p.effect.source.resourceId === TIA &&
            p.effect.source.skill === 'skill1' &&
            p.effect.stat === 'attackDamage',
        ),
      ).toEqual(expected);
    }
  });

  it('goes back to burst stage I after her burst (re-entry): the next use is always another I', () => {
    for (const a of uses) {
      const next = activations.find((b) => b.frame > a.frame);
      if (next !== undefined) expect(input.slots[next.slotIndex]!.character.burstStep).toBe('Step1');
    }
  });
});

describe('ティア + デルタ + スノーホワイト：ヘビーアームズ（I がティアだけ）', () => {
  it('never reaches stage II, so there is no Full Burst', () => {
    const plan = planTeamRun(TEAMS['ティア + デルタ + スノーホワイト：ヘビーアームズ']);
    expect(plan.schedule!.activations.every((a) => a.slotIndex === 0)).toBe(true);
    expect(plan.schedule!.fullBurstWindows).toEqual([]);
  });
});

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  it('partitions every shot into exactly one group (start ≤ shot < end)', () => {
    expectEveryShotInOneGroup(input, planTeamRun(input));
  });
});
