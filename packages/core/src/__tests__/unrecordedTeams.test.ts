// 語彙はあるのに撮っていない効果の撮影（plan/design-skill-unrecorded.md）で定義したキャラを含む編成。定義の形（遅れの表の行・
// 同じ発動の▲の印）を見る。
import { describe, expect, it } from 'vitest';
import { burstDelaysOf, sameActivationBuffsOnHit } from '../burst/landing.ts';
import { characterOf } from './data.ts';

describe('遅れの表の行', () => {
  it('puts the burst hits at the measured delays and marks the same-activation buffs', () => {
    expect(burstDelaysOf(characterOf(190))).toMatchObject({ hitFrames: 73 });
    expect(burstDelaysOf(characterOf(60))).toMatchObject({ hitFrames: 16 });
    expect(burstDelaysOf(characterOf(313))).toMatchObject({ hitFrames: 26, hitOffsets: [0, 21] });
    expect(burstDelaysOf(characterOf(90))).toMatchObject({ effectFrames: 20 });
    expect(sameActivationBuffsOnHit(characterOf(103))).toBe(true);
    expect(sameActivationBuffsOnHit(characterOf(313))).toBe(true);
    expect(sameActivationBuffsOnHit(characterOf(190))).toBe(false);
  });
});
