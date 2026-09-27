// Stage 21: ゲーム内の秒とフレームの換算（plan/design-stage21.md 3.1 節）。21-A では 1 秒 = 60f のまま。
import { describe, expect, it } from 'vitest';
import { FRAMES_PER_GAME_SECOND, framesToGameSeconds, gameSecondsToFrame, gameSecondsToFrames } from '../time.ts';
import { MAX_RPM, WEAPON_FRAMES_PER_SECOND, secondsToFrames } from '../weapons.ts';

describe('game time (Stage 21-A: still 60 frames per game second)', () => {
  it('converts lengths by rounding up', () => {
    expect(FRAMES_PER_GAME_SECOND).toBe(60);
    expect(gameSecondsToFrames(180)).toBe(10800);
    expect(gameSecondsToFrames(0.01)).toBe(1);
    expect(() => gameSecondsToFrames(-1)).toThrow(RangeError);
  });

  it('converts instants by rounding to the nearest frame', () => {
    expect(gameSecondsToFrame(31)).toBe(1860);
    expect(gameSecondsToFrame(0.008)).toBe(0);
  });

  it('converts frames back to game seconds', () => {
    expect(framesToGameSeconds(600)).toBe(10);
  });
});

describe('weapon conversion stays separate (decided in 21-C)', () => {
  it('keeps 60 frames per CDN second and 1 shot per frame', () => {
    expect(WEAPON_FRAMES_PER_SECOND).toBe(60);
    expect(secondsToFrames(0.3)).toBe(18);
    expect(MAX_RPM).toBe(3600);
  });
});
