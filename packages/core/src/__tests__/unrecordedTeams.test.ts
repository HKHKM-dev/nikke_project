// 語彙はあるのに撮っていない効果の撮影（plan/design-skill-unrecorded.md）で定義したキャラを含む編成。撮った編成（3 節の撮り方 A〜E・G）で、
// 射撃の列がどのグループにも 1 回ずつ入る。定義の形（遅れの表の行・同じ発動の▲の印）も見る。
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { countShotsInRanges } from '../frame/shots.ts';
import { runTeam } from './runTeam.ts';
import { planTeamRun } from '../frame/plan.ts';
import { burstDelaysOf, sameActivationBuffsOnHit } from '../burst/landing.ts';
import type { TeamInput } from '../team.ts';
import { characterOf } from './data.ts';
import { fixedSlot } from './teamHelpers.ts';

const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: null, hasCore: true };
const team = (ids: number[], controlledSlot: number): TeamInput => ({
  slots: ids.map((id) => fixedSlot(id)),
  enemy,
  durationSeconds: 180,
  burst: true,
  controlledSlot,
});

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

const TEAMS: Record<string, TeamInput> = {
  'A: ナガ + I-DOLL・サン + ラム': team([450, 308, 822], 2),
  'B: ルドミラ + ベロータ + ラプラス：アルティメットヒーロー + プリバティ：アンカインド・メイド': team(
    [190, 60, 103, 313],
    2,
  ),
  'C: デルタ + I-DOLL・サン + プロダクト08': team([20, 308, 302], 2),
  'D: デルタ + I-DOLL・サン + ラプンツェル：ピュアグレイス': team([20, 308, 226], 2),
  'E: エマ + アスカ': team([90, 830], 0),
  'F: ラム + I-DOLL・サン + ブラン + アスカ': team([822, 308, 270, 830], 2),
  'G: ナガ + アスカ': team([450, 830], 1),
};

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const calc = runTeam(input);
  const plan = planTeamRun(input);

  it('partitions every shot into exactly one group (start ≤ shot < end)', () => {
    input.slots.forEach((_, i) => {
      const frames = plan.shots[i]!.frames;
      const total = calc.slots[i]!.segments.reduce((sum, g) => sum + countShotsInRanges(frames, g.ranges), 0);
      expect(total).toBe(frames.length);
    });
  });
});
