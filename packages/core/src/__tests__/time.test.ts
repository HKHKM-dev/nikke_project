// Stage 21: ゲーム内の秒とフレームの換算（plan/design-stage21.md 3.1 節）。21-B から 1 フレーム = ゲーム内の 0.017 秒。
import { describe, expect, it } from 'vitest';
import {
  FRAMES_PER_GAME_SECOND,
  GAME_SECONDS_PER_FRAME,
  framesToGameSeconds,
  gameSecondsToFrame,
  gameSecondsToFrames,
} from '../time.ts';
import { MAX_RPM, chargeSecondsToFrames, reloadSecondsToFrames } from '../weapons.ts';

describe('game time (Stage 21-B: 0.017 s per frame)', () => {
  it('uses 0.017 s per frame (about 58.82 frames per game second)', () => {
    expect(GAME_SECONDS_PER_FRAME).toBe(0.017);
    expect(FRAMES_PER_GAME_SECOND).toBeCloseTo(58.8235, 4);
  });

  it('converts lengths by rounding down (7 s = 411f as in recording 56), without dropping an exact frame count by float error', () => {
    expect(gameSecondsToFrames(180)).toBe(10588); // 10588.2…
    expect(gameSecondsToFrames(10)).toBe(588); // 588.2…
    expect(gameSecondsToFrames(7)).toBe(411); // 411.8…（クラウンの S2。録画 56 の▲の発の区間。056-04）
    expect(gameSecondsToFrames(0.017 * 3)).toBe(3);
    expect(gameSecondsToFrames(0.01)).toBe(0);
    expect(() => gameSecondsToFrames(-1)).toThrow(RangeError);
  });

  it('converts instants by rounding to the nearest frame', () => {
    expect(gameSecondsToFrame(31.62)).toBe(1860);
    expect(gameSecondsToFrame(0.008)).toBe(0);
  });

  it('converts frames back to game seconds', () => {
    expect(framesToGameSeconds(1000)).toBeCloseTo(17, 10);
  });
});

describe('weapon conversion (rpm: 21-C3, charge: Stage 23, reload: Stage 24)', () => {
  it('counts CDN seconds and rpm on the game clock, with 1 shot per frame at most', () => {
    // チャージは切り上げ（C-0140）、リロードは端数つき（射手が端数を持ち越す。C-0145）
    expect(chargeSecondsToFrames(1)).toBe(59);
    expect(chargeSecondsToFrames(0.3)).toBe(18);
    expect(chargeSecondsToFrames(0.017 * 3)).toBe(3);
    expect(reloadSecondsToFrames(2)).toBeCloseTo(117.647, 3);
    // 1 フレーム 1 発 = ゲーム内の 1 秒に約 58.82 発（C-0058）
    expect(MAX_RPM).toBeCloseTo(60 / 0.017, 9);
  });
});
