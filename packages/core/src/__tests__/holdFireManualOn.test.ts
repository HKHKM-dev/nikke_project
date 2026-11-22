// オート射撃を手で ON に戻した明け（TeamInput.holdFire の区間の終わり）の 1 発目（C-1550。V-0865）
import { describe, expect, it } from 'vitest';
import type { EnemyEvent } from '../damage.ts';
import { windowEndFirstShotFrames } from '../frame/shooter.ts';
import { runSimulation } from '../sim/engine.ts';
import type { FrameRange } from '../skills/timeline.ts';
import { framesToGameSeconds } from '../time.ts';
import { DEFAULT_WEAPON_MODEL } from '../weapons.ts';
import { characterOf } from './teamHelpers.ts';

const SHORTER = DEFAULT_WEAPON_MODEL.manualOnAimShorterFrames;

/** 単騎で [0, on) を撃たずに隠れ、on 以後の最初の発のフレーム */
function firstShotAfter(rid: number, hold: FrameRange, events: EnemyEvent[] = []): number {
  const sim = runSimulation({
    slots: [
      {
        character: characterOf(rid),
        growth: { level: 1, grade: 0, core: 0 },
        condition: { coreHitRate: 1, distanceBonus: false },
      },
    ],
    enemy: { defence: 100, element: null, hasCore: true, events },
    durationSeconds: 30,
    burst: false,
    holdFire: [{ slotIndex: 0, ranges: [hold] }],
  });
  return sim.shots[0]!.frames.find((f) => f >= hold.end)!;
}

describe('manual auto-fire ON (holdFire end, C-1550)', () => {
  const hold = { start: 0, end: 300 };

  it.each([
    ['AR (ブリッド)', 70, 5],
    ['SR, UP (エード：エージェントバニー)', 315, 63],
    ['RL, UP with fire stance (紅蓮：ブラックシャドウ)', 225, 22],
    ['RL, charge on press (アニス：スター)', 17, 62],
  ])('fires %s 7f earlier than at a window end (measured: AR 2–6f, SR 63–65f, RL 22f・62f)', (_, rid, expected) => {
    const shot = characterOf(rid).shot;
    expect(firstShotAfter(rid, hold) - hold.end).toBe(windowEndFirstShotFrames(shot) - SHORTER);
    expect(firstShotAfter(rid, hold) - hold.end).toBe(expected);
  });

  it.each([
    ['SMG (リター)', 82],
    ['SG (ギルティ)', 400],
    ['MG (マリアン：クイーン)', 19],
  ])('keeps the window-end wait for %s (not checked)', (_, rid) => {
    expect(firstShotAfter(rid, hold) - hold.end).toBe(windowEndFirstShotFrames(characterOf(rid).shot));
  });

  it('keeps the window-end wait when an untargetable window ends on the same frame', () => {
    const events: EnemyEvent[] = [
      { kind: 'untargetable', start: framesToGameSeconds(200), end: framesToGameSeconds(hold.end) },
    ];
    expect(firstShotAfter(70, hold, events) - hold.end).toBe(windowEndFirstShotFrames(characterOf(70).shot));
  });
});
