// フルバーストの入りの止まり（C-0069〜C-0071）と I・II の発動の止まり（C-0289・C-0261）: モデルのフレーム（ゲーム内の時間）→ 録画の動画のフレーム
import { describe, expect, it } from 'vitest';
import { planFixedCycle } from '../fixedCycle.ts';
import { gameSecondsToFrames } from '../../time.ts';
import {
  ACTIVATION_STOP_VIDEO_FRAMES,
  FULL_BURST_ENTRY_STOP_VIDEO_FRAMES,
  activationVideoFrameOf,
  videoFrameOf,
} from '../schedule.ts';

describe('videoFrameOf', () => {
  const s = planFixedCycle([{ burstStep: 'Step1' }, { burstStep: 'Step2' }, { burstStep: 'Step3' }], 3000);
  // 固定サイクルは 588f に I・II・III が同じフレームで並び、III でフルバーストに入る。次の入りは 1,764f
  const first = gameSecondsToFrames(10);
  const second = first + gameSecondsToFrames(20);

  it('adds the entry stop per full burst entry and the activation stop per I / II activation before the frame', () => {
    expect(FULL_BURST_ENTRY_STOP_VIDEO_FRAMES).toBe(22);
    expect(ACTIVATION_STOP_VIDEO_FRAMES).toBe(1);
    expect([first, second]).toEqual([588, 1764]);
    expect(videoFrameOf(s, 0)).toBe(0);
    // 発動のフレームそのものは止まりの前
    expect(videoFrameOf(s, first)).toBe(first);
    // 入り 1 回（22f）と I・II の発動 2 回（1f ずつ）
    expect(videoFrameOf(s, first + 1)).toBe(first + 1 + 22 + 2);
    expect(videoFrameOf(s, second + 1)).toBe(second + 1 + 44 + 4);
  });

  it('counts the activation stop of the I / II activation itself as before its hexagon change', () => {
    const [i, ii, iii] = s.activations;
    expect([i?.step, ii?.step, iii?.step]).toEqual(['Step1', 'Step2', 'Step3']);
    expect(activationVideoFrameOf(s, i!)).toBe(first + 1);
    // II の前には同じフレームの I があるが、止まりは発動のフレームより後（a.frame < frame）なので II 自身の 1f だけ
    expect(activationVideoFrameOf(s, ii!)).toBe(first + 1);
    // III は入りの止まりの前のまま
    expect(activationVideoFrameOf(s, iii!)).toBe(first);
  });

  it('is the identity without a schedule', () => {
    expect(videoFrameOf(null, 1234)).toBe(1234);
  });
});
