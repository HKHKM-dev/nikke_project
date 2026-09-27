// フルバーストの入りの止まり（C-0069〜C-0071）: モデルのフレーム（ゲーム内の時間）→ 録画の動画のフレーム
import { describe, expect, it } from 'vitest';
import { planFixedCycle } from '../fixedCycle.ts';
import { gameSecondsToFrames } from '../../time.ts';
import { FULL_BURST_ENTRY_STOP_VIDEO_FRAMES, videoFrameOf } from '../schedule.ts';

describe('videoFrameOf', () => {
  const s = planFixedCycle([{ burstStep: 'Step1' }, { burstStep: 'Step2' }, { burstStep: 'Step3' }], 3000);
  // 固定サイクルは 588f に I・II・III が同じフレームで並び、III でフルバーストに入る。次の入りは 1,764f
  const first = gameSecondsToFrames(10);
  const second = first + gameSecondsToFrames(20);

  it('adds the stop once per full burst entry before the frame', () => {
    expect(FULL_BURST_ENTRY_STOP_VIDEO_FRAMES).toBe(22);
    expect([first, second]).toEqual([588, 1764]);
    expect(videoFrameOf(s, 0)).toBe(0);
    // III の発動のフレームそのものは止まりの前
    expect(videoFrameOf(s, first)).toBe(first);
    expect(videoFrameOf(s, first + 1)).toBe(first + 1 + 22);
    expect(videoFrameOf(s, second + 1)).toBe(second + 1 + 44);
  });

  it('is the identity without a schedule', () => {
    expect(videoFrameOf(null, 1234)).toBe(1234);
  });
});
