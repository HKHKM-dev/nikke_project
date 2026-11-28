import { describe, expect, it } from 'vitest';
import { makeCharacter } from '../../__tests__/fixtures.ts';
import { DEFAULT_WEAPON_MODEL } from '../../weapons.ts';
import { initialShooter, weaponFreeFrameAtSwap, type ShooterState } from '../shooter.ts';

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
});
