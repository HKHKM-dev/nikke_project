// Stage 10: 射撃に効くバフ（最大装弾数・リロード速度・チャージ速度）から、射手が使う実効値を作る（plan/design-stage10.md 3 節）。
// 最大装弾数は録画 37・39（比率は加算、端数は四捨五入）、速度の式は録画 40（時間 × (1 − 速度)）で確定した。
import type { BuffTotals } from '../skills/buffs.ts';
import type { ShotParams } from '../types.ts';
import { isChargeWeapon, secondsToFrames } from '../weapons.ts';

/** 射撃に効くバフの合計（BuffTotals の 4 フィールド） */
export type FiringBuffs = Pick<BuffTotals, 'maxAmmoRatio' | 'maxAmmoFlat' | 'reloadSpeed' | 'chargeSpeed'>;

export const ZERO_FIRING_BUFFS: Readonly<FiringBuffs> = Object.freeze({
  maxAmmoRatio: 0,
  maxAmmoFlat: 0,
  reloadSpeed: 0,
  chargeSpeed: 0,
});

/** 射手が各フレームで使う実効値 */
export type FiringParams = {
  /** 最大装弾数（1 以上の整数） */
  maxAmmo: number;
  /** 分割リロードの 1 回分（reloadBullet ≥ 1 の武器は 1 回で満タン）のフレーム数 */
  reloadChunkFrames: number;
  /** チャージ時間のフレーム数（チャージ武器だけ意味を持つ。解放遅延は含まない） */
  chargeFrames: number;
};

/**
 * 最大装弾数の比率の端数の扱い。**2026-09-23 の録画 39（録画 A）で四捨五入と確定**:
 * リターの最大装弾数 45.17% でデルタ（SR 6 発）が 6 × 1.4517 = 8.71 → **9**（切り捨てなら 8）、
 * リター自身（SMG 120 発）が 174.2 → **174**（切り上げなら 175）、ドレイクは 3 つ重ねて 9 × 2.6749 = 24.07 → 24
 */
export const MAX_AMMO_ROUNDING: 'floor' | 'round' = 'round';

/**
 * リロード速度・チャージ速度の式。'subtract' = 時間 × max(0, 1 − 速度)、'divide' = 時間 ÷ (1 + 速度)。
 * **2026-09-23 の録画 40（録画 B）で subtract と確定**: アドミのリロード速度 50.91% の間のラム（SR・リロード 2 秒）の
 * リロードが 66f（窓の外は 126f。表示の遅れ 6f を引いて 60f ≒ 120 × 0.4909 = 59f。divide なら 80f）、
 * ユニのチャージ速度 8.97% のフルバースト中のラムの射撃間隔が 4 発平均 77.0f（窓の外は 82.0f。divide なら 78f）
 */
export const SPEED_FORMULA: 'subtract' | 'divide' = 'subtract';

export function isZeroFiring(buffs: FiringBuffs): boolean {
  return buffs.maxAmmoRatio === 0 && buffs.maxAmmoFlat === 0 && buffs.reloadSpeed === 0 && buffs.chargeSpeed === 0;
}

/** 速度のバフで縮めた秒数 */
export function speedScaledSeconds(seconds: number, speed: number): number {
  if (speed === 0) return seconds;
  return SPEED_FORMULA === 'subtract' ? seconds * Math.max(0, 1 - speed) : seconds / (1 + Math.max(0, speed));
}

/** max(1, 丸め(基礎 × (1 + Σ比率)) + Σ固定)。比率は加算（録画 37） */
export function effectiveMaxAmmo(baseMaxAmmo: number, buffs: FiringBuffs): number {
  if (buffs.maxAmmoRatio === 0 && buffs.maxAmmoFlat === 0) return baseMaxAmmo;
  const scaled = baseMaxAmmo * (1 + buffs.maxAmmoRatio);
  // 1e-9 は 9 × 2.2232 のような積の浮動小数の誤差で 1 つ下に落ちないため
  const rounded = MAX_AMMO_ROUNDING === 'floor' ? Math.floor(scaled + 1e-9) : Math.round(scaled);
  return Math.max(1, rounded + buffs.maxAmmoFlat);
}

/** バフ込みの実効値。buffs 省略は基礎値（Stage 9 までの射手と同じ） */
export function firingParams(shot: ShotParams, buffs: FiringBuffs = ZERO_FIRING_BUFFS): FiringParams {
  return {
    maxAmmo: effectiveMaxAmmo(shot.maxAmmo, buffs),
    reloadChunkFrames: secondsToFrames(speedScaledSeconds(shot.reloadTime, buffs.reloadSpeed)),
    chargeFrames: isChargeWeapon(shot) ? secondsToFrames(speedScaledSeconds(shot.chargeTime, buffs.chargeSpeed)) : 0,
  };
}

/** 分割リロードの 1 回分の弾数: max(1, round(最大 × reloadBullet))。reloadBullet ≥ 1 は満タン（録画 37・19: 9 → 3、20 → 7、14 → 5） */
export function reloadChunkAmmo(maxAmmo: number, reloadBullet: number): number {
  if (reloadBullet >= 1) return maxAmmo;
  return Math.max(1, Math.round(maxAmmo * reloadBullet));
}
