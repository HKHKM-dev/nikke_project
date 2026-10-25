// 回復の起きるフレーム（skills/heals.ts の healFrameOf）: 射撃の回数起点は、受ける枠が撃った枠より後ろならトリガーと同じフレーム、
// 自分と前の枠には次のフレーム。射撃の回数起点でない回復は、いつも同じフレーム（V-0490、C-0628）。
// 編成で通すのは __tests__/yuniAsukaTeam.test.ts（後ろの枠・自分）と __tests__/manaAsukaTeam.test.ts（前の枠）
import { describe, expect, it } from 'vitest';
import { healFrameOf } from '../heals.ts';
import type { ResolvedInstantEffect } from '../resolve.ts';

type Trigger = Pick<ResolvedInstantEffect, 'trigger' | 'delayFrames'>;

const SHOT_COUNT: Trigger = { trigger: { count: 'normalShot', every: 10 } };
const FIRE = 57;

describe('healFrameOf', () => {
  it('heals a slot behind the shooter on the trigger frame (shot count)', () => {
    expect(healFrameOf(SHOT_COUNT, FIRE, 0, 1)).toBe(FIRE);
    expect(healFrameOf(SHOT_COUNT, FIRE, 1, 4)).toBe(FIRE);
  });

  it('heals the shooter itself on the next frame (shot count)', () => {
    expect(healFrameOf(SHOT_COUNT, FIRE, 1, 1)).toBe(FIRE + 1);
  });

  it('heals a slot in front of the shooter on the next frame (shot count)', () => {
    expect(healFrameOf(SHOT_COUNT, FIRE, 1, 0)).toBe(FIRE + 1);
    expect(healFrameOf(SHOT_COUNT, FIRE, 4, 1)).toBe(FIRE + 1);
  });

  it('heals every slot on the trigger frame when the trigger is not a shot count', () => {
    const triggers: Trigger[] = [
      { trigger: 'burstUse' },
      { trigger: 'fullBurstStart' },
      { trigger: { count: 'burstUse', atLeast: 1 } },
      { trigger: { everySeconds: 5 } },
    ];
    for (const t of triggers) {
      for (const target of [0, 1, 2]) expect(healFrameOf(t, FIRE, 1, target)).toBe(FIRE);
    }
  });

  // 回数トリガーの遅れ編（plan/design-shot-count-trigger-frame.md 6 節の論点 2）: delayFrames を書いた回復は、どの枠にも d 後（C-0652）
  it('heals every slot delayFrames after the trigger when the shot count heal is delayed', () => {
    const delayed: Trigger = { ...SHOT_COUNT, delayFrames: 6 };
    for (const [source, target] of [
      [1, 0],
      [1, 1],
      [0, 1],
      [4, 1],
    ] as const) {
      expect(healFrameOf(delayed, FIRE, source, target)).toBe(FIRE + 6);
    }
  });
});
