// マガジン 1 周期（発射 × 装弾数 + リロード）をフレーム単位で離散化し、平均の秒間トリガー数を求める。
import type { ShotParams } from './types.ts';
import {
  DEFAULT_WEAPON_MODEL,
  FPS,
  framesPerShot,
  hasSpinUp,
  isChargeWeapon,
  secondsToFrames,
  type WeaponModel,
} from './weapons.ts';

export type CadenceResult = {
  /** 各発の所要フレーム（その発を撃ってから次の発が撃てるまで） */
  shotFrames: number[];
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

/** shotIndex 発目（0 始まり）の所要フレーム。 */
export function shotIntervalFrames(shot: ShotParams, shotIndex: number, model: WeaponModel = DEFAULT_WEAPON_MODEL): number {
  if (isChargeWeapon(shot)) {
    return Math.max(framesPerShot(shot.rateOfFire), secondsToFrames(shot.chargeTime)) + model.chargeReleaseFrames;
  }
  if (hasSpinUp(shot)) {
    const rpm = Math.min(shot.endRateOfFire, shot.rateOfFire + shotIndex * shot.rateOfFireChangePerShot);
    return framesPerShot(rpm);
  }
  return framesPerShot(shot.rateOfFire);
}

/** 分割リロードの回数。1 回で回復する弾数は round(装弾数 × 回復割合)（最低 1 発）。 */
export function reloadChunks(shot: Pick<ShotParams, 'maxAmmo' | 'reloadBullet'>): number {
  if (shot.reloadBullet >= 1) return 1;
  const ammoPerChunk = Math.max(1, Math.round(shot.maxAmmo * shot.reloadBullet));
  return Math.ceil(shot.maxAmmo / ammoPerChunk);
}

export function computeCadence(shot: ShotParams, model: WeaponModel = DEFAULT_WEAPON_MODEL): CadenceResult {
  if (shot.maxAmmo < 1) throw new RangeError(`maxAmmo must be >= 1, got ${shot.maxAmmo}`);
  // スピンアップはリロード中にレートが初期化される前提（リロード時間 >= リセット時間）。
  // 初期化されないケースはデータ上存在しないため、その場合も毎マガジン初期化として扱う。
  const shotFrames = Array.from({ length: shot.maxAmmo }, (_, i) => shotIntervalFrames(shot, i, model));
  const magazineFrames = shotFrames.reduce((sum, f) => sum + f, 0);
  const chunks = reloadChunks(shot);
  const reloadFrames = secondsToFrames(shot.reloadTime) * chunks;
  const cycleFrames = magazineFrames + reloadFrames;
  return {
    shotFrames,
    magazineFrames,
    reloadChunks: chunks,
    reloadFrames,
    cycleFrames,
    cycleSeconds: cycleFrames / FPS,
    triggersPerCycle: shot.maxAmmo,
    triggersPerSecond: (shot.maxAmmo * FPS) / cycleFrames,
  };
}
