// オート射撃を手で ON に戻した明け（TeamInput.holdFire の区間の終わり）の 1 発目（C-1550・C-1564。V-0865・V-0874）
import { describe, expect, it } from 'vitest';
import type { EnemyEvent } from '../damage.ts';
import { windowEndFirstShotFrames } from '../frame/shooter.ts';
import { runSimulation } from '../sim/engine.ts';
import type { FrameRange } from '../skills/timeline.ts';
import { framesToGameSeconds } from '../time.ts';
import { DEFAULT_WEAPON_MODEL } from '../weapons.ts';
import { characterOf } from './teamHelpers.ts';

const SHORTER = DEFAULT_WEAPON_MODEL.manualOnAimShorterFrames;

/** 単騎で [0, on) を撃たずに隠れ、from（既定は on）以後の最初の発のフレーム */
function firstShotAfter(rid: number, hold: FrameRange, events: EnemyEvent[] = [], from = hold.end): number {
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
  return sim.shots[0]!.frames.find((f) => f >= from)!;
}

describe('manual auto-fire ON (holdFire end, C-1550, C-1564)', () => {
  const hold = { start: 0, end: 300 };

  it.each([
    ['AR (ブリッド)', 70, 5],
    ['SR, UP (エード：エージェントバニー)', 315, 63],
    ['RL, UP with fire stance (紅蓮：ブラックシャドウ)', 225, 22],
    ['RL, charge on press (アニス：スター)', 17, 62],
    ['SMG (I-DOLL・オーシャン)', 305, 5],
    ['SG (ノワール)', 271, 5],
    ['MG (エマ)', 90, 5],
  ])(
    'fires %s 7f earlier than at a window end (measured: AR 2–6f, SR 63–65f, RL 22f・62f, SMG・SG 4–7f, MG 4–5f)',
    (_, rid, expected) => {
      const shot = characterOf(rid).shot;
      expect(firstShotAfter(rid, hold) - hold.end).toBe(windowEndFirstShotFrames(shot) - SHORTER);
      expect(firstShotAfter(rid, hold) - hold.end).toBe(expected);
    },
  );

  it('keeps the window-end wait when an untargetable window ends on the same frame', () => {
    const events: EnemyEvent[] = [
      { kind: 'untargetable', start: framesToGameSeconds(200), end: framesToGameSeconds(hold.end) },
    ];
    expect(firstShotAfter(70, hold, events) - hold.end).toBe(windowEndFirstShotFrames(characterOf(70).shot));
  });

  // C-1562・C-1565: ジャンプの窓の中で ON にした枠は、武器種によらず、オート射撃を ON のままにしていたときと同じく窓の明けから撃ち、
  // 窓の明けの後に ON にした枠は ON から C-1550・C-1564 の長さで撃つ
  // （SR はエード：エージェントバニー。1094・1229。SMG・SG は I-DOLL・オーシャン、ノワール。1404〜1406）
  describe.each([
    ['SR (エード：エージェントバニー, C-1562)', 315, 63],
    ['SMG (I-DOLL・オーシャン, C-1565)', 305, 5],
    ['SG (ノワール, C-1565)', 271, 5],
  ])('with a jump window, %s', (_, rid, afterOn) => {
    const windowEnd = 400;
    const events: EnemyEvent[] = [
      { kind: 'untargetable', start: framesToGameSeconds(windowEnd - 118), end: framesToGameSeconds(windowEnd) },
    ];

    // C-1565 の ON の時刻（敵が浮く 10f 前〜浮いた 40f 後）の両端と、C-1562 の SR の時刻
    it.each([windowEnd - 118 + 1, windowEnd - 62, windowEnd - 118 + 40])(
      'fires on the same frame as with auto-fire left on when turned on inside the window (on at %i)',
      (on) => {
        const shot = firstShotAfter(rid, { start: 0, end: on }, events);
        // オート射撃を ON のままにしていた枠（holdFire の区間を戦闘の始まりの 1 フレームだけにする）の、窓の明けの後の最初の発
        const autoOn = firstShotAfter(rid, { start: 0, end: 1 }, events, windowEnd);
        expect(shot).toBe(autoOn);
        expect(shot - windowEnd).toBe(windowEndFirstShotFrames(characterOf(rid).shot));
      },
    );

    it('fires as C-1550 when turned on after the window end', () => {
      const on = windowEnd + 18;
      expect(firstShotAfter(rid, { start: 0, end: on }, events) - on).toBe(afterOn);
    });
  });
});
