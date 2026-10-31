// ティア（451）を含む編成（2 段目の段 15 の PR 2。plan/design-skill-stage15.md 2.2 節。V-0566）。きっかけ { coverHealed } と T4 の▼の
// 細かい動きは skills/__tests__/stage15Tia.test.ts。ここでは味方と組んだ時に:
// S1: バースト使用時の遮蔽物 HP 回復（S2）で、味方全体に攻撃ダメージ▲（10 秒。C-0776）。
// バースト: 再突入で、ティアの後のバースト段階は I に戻る（キャラのデータの nextStep が Step1。定義の burstReentry も同じ段）。
// 射撃の列のグループ分け。
import { describe, expect, it } from 'vitest';
import { activationFramesOfSlot } from '../burst/schedule.ts';
import { planTeamRun } from '../frame/plan.ts';
import { describeEveryShotInOneGroup, effectWindows, fixedTeam, windowsFrom } from './teamHelpers.ts';

const TIA = 451;

const TEAMS = {
  単騎: fixedTeam([TIA], 0),
  'ティア + デルタ + スノーホワイト：ヘビーアームズ': fixedTeam([TIA, 20, 471], 2),
  'ティア + ミルク + デルタ + スノーホワイト：ヘビーアームズ': fixedTeam([TIA, 141, 20, 471], 3),
};

describe.each([
  'ティア + デルタ + スノーホワイト：ヘビーアームズ',
  'ティア + ミルク + デルタ + スノーホワイト：ヘビーアームズ',
] as const)('%s', (name) => {
  const input = TEAMS[name];
  const plan = planTeamRun(input);
  const { activations } = plan.schedule!;
  const uses = activationFramesOfSlot(plan.schedule!, 0);

  it('raises the attack damage of every ally for 10 s from every burst use (S1 via the S2 cover heal)', () => {
    expect(uses.length).toBeGreaterThan(2);
    input.slots.forEach((_, slot) => {
      expect(effectWindows(plan, slot, { resourceId: TIA, skill: 'skill1', stat: 'attackDamage' })).toEqual(
        windowsFrom(uses, 10, plan.frames),
      );
    });
  });

  it('goes back to burst stage I after her burst (re-entry): the next use is always another I', () => {
    for (const frame of uses) {
      const next = activations.find((b) => b.frame > frame);
      if (next !== undefined) expect(input.slots[next.slotIndex]!.character.burstStep).toBe('Step1');
    }
  });

  if (name === 'ティア + デルタ + スノーホワイト：ヘビーアームズ') {
    it('never reaches stage II when Tia is the only I, so there is no Full Burst', () => {
      expect(activations.every((a) => a.slotIndex === 0)).toBe(true);
      expect(plan.schedule!.fullBurstWindows).toEqual([]);
    });
  }
});

describeEveryShotInOneGroup(TEAMS);
