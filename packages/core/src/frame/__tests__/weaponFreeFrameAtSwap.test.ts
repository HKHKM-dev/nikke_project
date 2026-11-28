import { describe, expect, it } from 'vitest';
import { makeCharacter } from '../../__tests__/fixtures.ts';
import { DEFAULT_WEAPON_MODEL } from '../../weapons.ts';
import { initialShooter, stepShooter, weaponFreeFrameAtSwap, type ShooterState } from '../shooter.ts';

// 持ち替えの時の基礎の武器の状態で、武器が空くフレーム（C-0897・C-1566）
const aimOut = DEFAULT_WEAPON_MODEL.aimOutFrames;
const swap = 1000;

function state(phase: ShooterState['phase']): ShooterState {
  const s = initialShooter(makeCharacter().shot);
  s.phase = phase;
  return s;
}

describe('weaponFreeFrameAtSwap', () => {
  it('チャージ武器は、毎発の後の構え解除の途中なら構え解除の終わり、明けていれば構え解除 1 回分の後', () => {
    expect(weaponFreeFrameAtSwap(state('ready'), swap - 5, swap, DEFAULT_WEAPON_MODEL, true)).toBe(swap - 5 + aimOut);
    expect(weaponFreeFrameAtSwap(state('ready'), swap - 20, swap, DEFAULT_WEAPON_MODEL, true)).toBe(swap + aimOut);
    expect(weaponFreeFrameAtSwap(state('ready'), undefined, swap, DEFAULT_WEAPON_MODEL, true)).toBe(swap + aimOut);
  });

  it('チャージの無い武器を撃っている途中は、最後の発からの経過によらず構え解除 1 回分の後（V-0879 の 1295-27・1296-28）', () => {
    expect(weaponFreeFrameAtSwap(state('ready'), swap - 7, swap, DEFAULT_WEAPON_MODEL, false)).toBe(swap + aimOut);
    expect(weaponFreeFrameAtSwap(state('ready'), swap - 38, swap, DEFAULT_WEAPON_MODEL, false)).toBe(swap + aimOut);
  });

  it('リロード中は、マガジンの最後の発の後の構え解除の途中なら構え解除の終わり、明けていれば持ち替えのフレーム（1296-29・1295-27）', () => {
    for (const charge of [false, true]) {
      expect(weaponFreeFrameAtSwap(state('reloading'), swap - 7, swap, DEFAULT_WEAPON_MODEL, charge)).toBe(
        swap - 7 + aimOut,
      );
      expect(weaponFreeFrameAtSwap(state('reloading'), swap - 47, swap, DEFAULT_WEAPON_MODEL, charge)).toBe(swap);
    }
  });

  it('aimedNoAimOut（マクスウェル）は、構えたままでも持ち替えのフレームで、構え解除の途中なら構え解除の終わり（C-1598。1428-08・1429-09）', () => {
    const at = (phase: ShooterState['phase'], last: number | undefined) =>
      weaponFreeFrameAtSwap(state(phase), last, swap, DEFAULT_WEAPON_MODEL, true, true);
    expect(at('ready', swap - 20)).toBe(swap);
    expect(at('ready', undefined)).toBe(swap);
    expect(at('ready', swap - 5)).toBe(swap - 5 + aimOut);
    expect(at('reloading', swap - 16)).toBe(swap);
    expect(at('reloading', swap - 9)).toBe(swap - 9 + aimOut);
  });

  it('最終弾から始めた全弾リロードは、射手が残弾を満たした後も、ゲームの込め終わりまではリロード中（C-1566。cadence.ts の fullReloadFrames）', () => {
    const at = (wait: number, last: number) => {
      const s = state('priming');
      s.lastShotReload = true;
      s.reloadEndWait = 11;
      s.wait = wait;
      return weaponFreeFrameAtSwap(s, last, swap, DEFAULT_WEAPON_MODEL, false);
    };
    expect(at(12, swap - 40)).toBe(swap);
    expect(at(11, swap - 40)).toBe(swap + aimOut);
  });

  it('マガジンの最後の発の後の構え解除は、リロードが先に終わっても最後の発から構え解除 1 回分（C-1566）', () => {
    for (const phase of ['priming', 'ready'] as const) {
      const s = state(phase);
      s.lastShotReload = true;
      expect(weaponFreeFrameAtSwap(s, swap - 5, swap, DEFAULT_WEAPON_MODEL, false)).toBe(swap - 5 + aimOut);
    }
    // 最後の発がマガジンの最後でなければ、撃っている途中と同じ
    expect(weaponFreeFrameAtSwap(state('priming'), swap - 5, swap, DEFAULT_WEAPON_MODEL, false)).toBe(swap + aimOut);
  });

  it('射手は、最終弾からの全弾リロードの priming の始めの k フレーム（チャージの無い武器は 12）をリロード中にする', () => {
    const shot = makeCharacter().shot;
    const s = initialShooter(shot);
    let reloadingFrames = 0;
    let primingFrames = 0;
    // 最初のマガジンを撃ち切り、リロードを込め終えて 1 発目を撃つまで
    for (let f = 0; f < 3000; f++) {
      stepShooter(s, shot);
      if (s.phase !== 'priming') {
        if (primingFrames > 0) break;
        continue;
      }
      primingFrames += 1;
      if (weaponFreeFrameAtSwap(s, -1000, swap, DEFAULT_WEAPON_MODEL, false) === swap) reloadingFrames += 1;
    }
    expect(primingFrames).toBeGreaterThan(12);
    expect(reloadingFrames).toBe(12);
  });
});
