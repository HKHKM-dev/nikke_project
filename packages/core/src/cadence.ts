// マガジン 1 周期（1 発目までの遅延 + 発射 × 装弾数 + リロード）をフレーム単位で離散化し、平均の秒間トリガー数を求める。
// モデルは 2026-09-22 の射撃場録画（AR / SR / RL / MG）で較正済み。plan/verification.md 参照。
import type { ShotParams } from './types.ts';
import {
  DEFAULT_WEAPON_MODEL,
  FPS,
  MAX_RPM,
  hasSpinUp,
  isChargeWeapon,
  secondsToFrames,
  type WeaponModel,
} from './weapons.ts';

export type CadenceResult = {
  /** 各発の発射フレーム（1 発目 = 0） */
  shotFrames: number[];
  /** リロード完了（または戦闘開始）から 1 発目までのフレーム。チャージ武器はチャージ + 解放遅延、MG は初弾遅延、それ以外は 0 */
  firstShotFrames: number;
  /** 1 発目から最終弾までのフレーム */
  magazineFrames: number;
  /** 1 マガジン分を回復するのに必要なリロード回数（分割リロードは複数） */
  reloadChunks: number;
  reloadFrames: number;
  cycleFrames: number;
  cycleSeconds: number;
  /** 1 周期のトリガー数（= 装弾数） */
  triggersPerCycle: number;
  triggersPerSecond: number;
};

/** 分割リロードの回数。1 回で回復する弾数は round(装弾数 × 回復割合)（最低 1 発）。 */
export function reloadChunks(shot: Pick<ShotParams, 'maxAmmo' | 'reloadBullet'>): number {
  if (shot.reloadBullet >= 1) return 1;
  const ammoPerChunk = Math.max(1, Math.round(shot.maxAmmo * shot.reloadBullet));
  return Math.ceil(shot.maxAmmo / ammoPerChunk);
}

/** i 発目を撃った直後の発射レート（rpm）。MG は 1 発ごとに上昇し 1 フレーム 1 発（3600 rpm）で頭打ち。 */
export function rateAfterShots(shot: ShotParams, shotsFired: number): number {
  const rpm = hasSpinUp(shot)
    ? Math.min(shot.endRateOfFire, shot.rateOfFire + shotsFired * shot.rateOfFireChangePerShot)
    : shot.rateOfFire;
  return Math.min(MAX_RPM, rpm);
}

/**
 * 各発の発射フレーム（1 発目 = 0）。
 * - チャージ武器: 毎発 チャージ時間 + 解放遅延（実測 82f）
 * - それ以外: 発射レートを 1 フレームごとに蓄積し、1 発分たまったフレームで発射（端数は持ち越し）。
 *   AR 720rpm は 5f 固定、MG はレート上昇に従って間隔が縮む。
 */
export function simulateShotFrames(shot: ShotParams, model: WeaponModel = DEFAULT_WEAPON_MODEL): number[] {
  if (shot.maxAmmo < 1) throw new RangeError(`maxAmmo must be >= 1, got ${shot.maxAmmo}`);
  if (shot.rateOfFire <= 0) throw new RangeError(`rateOfFire must be positive, got ${shot.rateOfFire}`);
  const frames: number[] = [0];
  if (isChargeWeapon(shot)) {
    const interval = secondsToFrames(shot.chargeTime) + model.chargeReleaseFrames;
    for (let i = 1; i < shot.maxAmmo; i++) frames.push(i * interval);
    return frames;
  }
  let acc = 0;
  let t = 0;
  while (frames.length < shot.maxAmmo) {
    t += 1;
    acc += rateAfterShots(shot, frames.length) / MAX_RPM;
    if (acc >= 1) {
      acc -= 1;
      frames.push(t);
    }
  }
  return frames;
}

export function firstShotFrames(shot: ShotParams, model: WeaponModel = DEFAULT_WEAPON_MODEL): number {
  if (isChargeWeapon(shot)) return secondsToFrames(shot.chargeTime) + model.chargeReleaseFrames;
  if (hasSpinUp(shot)) return model.spinUpFirstShotFrames;
  return 0;
}

export function computeCadence(shot: ShotParams, model: WeaponModel = DEFAULT_WEAPON_MODEL): CadenceResult {
  const shotFrames = simulateShotFrames(shot, model);
  const first = firstShotFrames(shot, model);
  const magazineFrames = shotFrames[shotFrames.length - 1] ?? 0;
  const chunks = reloadChunks(shot);
  const reloadFrames = secondsToFrames(shot.reloadTime) * chunks;
  const cycleFrames = first + magazineFrames + reloadFrames;
  return {
    shotFrames,
    firstShotFrames: first,
    magazineFrames,
    reloadChunks: chunks,
    reloadFrames,
    cycleFrames,
    cycleSeconds: cycleFrames / FPS,
    triggersPerCycle: shot.maxAmmo,
    triggersPerSecond: (shot.maxAmmo * FPS) / cycleFrames,
  };
}
