// 分かれたバーストのヒットのそれぞれが、同じ発動の効果を付け直す（トリガー burstHit。plan/design-burst-hit-reapply.md 5 節）
import { describe, expect, it } from 'vitest';
import { withBurstDelays } from '../../burst/landing.ts';
import { hexagonFrameOf, hitFramesOf, type BurstActivation, type BurstSchedule } from '../../burst/schedule.ts';
import { planTeamRun } from '../../frame/plan.ts';
import { effectWindows, fixedSlot, fixedTeam } from '../../__tests__/teamHelpers.ts';
import { gameSecondsToFrames } from '../../time.ts';
import { createTriggerTracker, replayEvents } from '../triggers.ts';

const activation: BurstActivation = {
  frame: 600,
  step: 'Step2',
  slotIndex: 0,
  startsFullBurst: false,
  enteredStep: null,
};

function scheduleOf(a: BurstActivation): BurstSchedule {
  return {
    model: 'dynamic',
    activations: [a],
    fullBurstWindows: [],
    fullBurstFramesTotal: 0,
    gaugeFullFrames: [],
    chainTimeouts: [],
    cooldownReductions: [],
  };
}

describe('トリガー burstHit の発火', () => {
  const split = withBurstDelays(activation, { hitFrames: 15, effectFrames: 15, hitOffsets: [0, 6, 11] });
  const firesOf = (trigger: 'burstHit' | 'burstUse', frames: number) => {
    const tracker = createTriggerTracker(trigger, 0, 'dynamic');
    return replayEvents(scheduleOf(split), [null], frames)
      .filter((e) => tracker(e))
      .map((e) => e.frame);
  };

  // 遅れは II の発動の印（hexagonFrameOf）から数える
  const mark = hexagonFrameOf(activation);

  it('fires on each of the split hits', () => {
    expect(hitFramesOf(split)).toEqual([mark + 15, mark + 21, mark + 26]);
    expect(firesOf('burstHit', 3000)).toEqual([mark + 15, mark + 21, mark + 26]);
  });

  it('still fires burstUse once at the effect frame', () => {
    expect(firesOf('burstUse', 3000)).toEqual([mark + 15]);
  });

  it('does not fire on hits at or after the battle end', () => {
    expect(firesOf('burstHit', mark + 21)).toEqual([mark + 15]);
  });

  it('fires once for a single hit', () => {
    const single = withBurstDelays(activation, { hitFrames: 30, effectFrames: 0 });
    const tracker = createTriggerTracker('burstHit', 0, 'dynamic');
    expect(
      replayEvents(scheduleOf(single), [null], 3000)
        .filter((e) => tracker(e))
        .map((e) => e.frame),
    ).toEqual([mark + 30]);
  });
});

// トリガー burstHit で書いたシグナル・ミカの窓は、編成のテスト（signalTeam・micaTeam）が見る
describe('分かれたヒットのキャラの burstUse の効果', () => {
  it('fires once and ends 10 s after the first hit (Signal with the DEF down written as burstUse)', () => {
    const team = fixedTeam(
      [
        304,
        fixedSlot(22, {
          edit: (raw) => {
            (raw.skills.burst!.effects[1] as { trigger: string }).trigger = 'burstUse';
          },
        }),
      ],
      1,
    );
    const plan = planTeamRun(team);
    const hits = hitFramesOf(plan.schedule!.activations.find((a) => a.slotIndex === 1)!);
    expect(hits).toHaveLength(3);
    const window = effectWindows(plan, 1, { resourceId: 22, skill: 'burst', stat: 'enemyDefenseDown' })[0];
    expect(window).toEqual({ start: hits[0], end: hits[0]! + gameSecondsToFrames(10) });
  });
});
