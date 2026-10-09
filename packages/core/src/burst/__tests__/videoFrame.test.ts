// フルバーストの入りの止まり（C-0069〜C-0071）と I・II の発動の止まり（C-0289・C-0261）: モデルのフレーム（ゲーム内の時間）→ 録画の動画のフレーム
import { describe, expect, it } from 'vitest';
import { planFixedCycle } from '../fixedCycle.ts';
import { gameSecondsToFrames } from '../../time.ts';
import {
  ACTIVATION_STOP_VIDEO_FRAMES,
  FULL_BURST_ENTRY_STOP_VIDEO_FRAMES,
  HEXAGON_AFTER_ACTIVATION_FRAMES,
  activationVideoFrameOf,
  hexagonFrameOf,
  videoFrameOf,
  type BurstSchedule,
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

  it('puts the hexagon change of the I / II activation 5 frames after it, past its own activation stop (C-0220, C-0285, V-0382)', () => {
    // 動的サイクルの形: I・II・III が 29f おきに並ぶ（C-0285）
    const chain = {
      activations: [
        { frame: 100, step: 'Step1', slotIndex: 0, startsFullBurst: false, enteredStep: 'Step2' },
        { frame: 129, step: 'Step2', slotIndex: 1, startsFullBurst: false, enteredStep: 'Step3' },
        { frame: 158, step: 'Step3', slotIndex: 2, startsFullBurst: true, enteredStep: null },
      ],
    } as unknown as BurstSchedule;
    const [i, ii, iii] = chain.activations;
    expect(HEXAGON_AFTER_ACTIVATION_FRAMES).toBe(5);
    expect([hexagonFrameOf(i!), hexagonFrameOf(ii!), hexagonFrameOf(iii!)]).toEqual([105, 134, 158]);
    // I の替わり目は I 自身の止まりの後
    expect(activationVideoFrameOf(chain, i!)).toBe(105 + 1);
    // II の替わり目は I・II の止まりの後
    expect(activationVideoFrameOf(chain, ii!)).toBe(134 + 2);
    // III は入りの止まりの前のまま
    expect(activationVideoFrameOf(chain, iii!)).toBe(158 + 2);
  });

  it('is the identity without a schedule', () => {
    expect(videoFrameOf(null, 1234)).toBe(1234);
  });
});
