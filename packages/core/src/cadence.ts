// マガジン 1 周期（1 発目までの遅延 + 発射 × 装弾数 + リロード）をフレーム単位で離散化し、平均の秒間トリガー数を求める。
// モデルは 2026-09-22 の射撃場録画（AR / SR / RL / MG）で較正済み。plan/verification.md 参照。
// Stage 10: 射撃に効くバフの実効値（frame/firing.ts の FiringParams）を受け取れるようにした。省略は基礎値（Stage 9 と同じ）。
// calc は常時分の射撃バフをここで平均レートに畳み込む（plan/design-stage10.md 3.4 節）。
// Stage 21-C3: rpm の蓄積をゲーム内の時計にし（C-0058）、AR・SMG・SG のリロード明けの遅れを足した（C-0059。
// plan/design-stage21.md 8.8 節、V-0011）。
import { firingParams, type FiringParams } from './frame/firing.ts';
import type { ShotParams } from './types.ts';
import { framesToGameSeconds } from './time.ts';
import { DEFAULT_WEAPON_MODEL, MAX_RPM, hasSpinUp, isChargeWeapon, type WeaponModel } from './weapons.ts';

export type CadenceResult = {
  /** 各発の発射フレーム（1 発目 = 0） */
  shotFrames: number[];
  /** 戦闘開始から 1 発目までのフレーム。チャージ武器はチャージ + 解放遅延 − 構え解除、それ以外は構え（Stage 22-C） */
  firstShotFrames: number;
  /** 21-C3: リロード完了から次のマガジンの 1 発目までのフレーム。AR・SMG・SG は reloadFirstShotFrames、MG は初弾遅延、チャージ武器は発と発の間 */
  reloadFirstShotFrames: number;
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

/** i 発目を撃った直後の発射レート（rpm）。MG は 1 発ごとに上昇し 1 フレーム 1 発（MAX_RPM）で頭打ち。 */
export function rateAfterShots(shot: ShotParams, shotsFired: number): number {
  const rpm = hasSpinUp(shot)
    ? Math.min(shot.endRateOfFire, shot.rateOfFire + shotsFired * shot.rateOfFireChangePerShot)
    : shot.rateOfFire;
  return Math.min(MAX_RPM, rpm);
}

/** 1 発分たまったか。rpm ÷ MAX_RPM の和が割り算の誤差で整数のすぐ下に出ても 1 発にする */
export const ACC_EPSILON = 1e-9;

/**
 * 各発の発射フレーム（1 発目 = 0）。
 * - チャージ武器: 毎発 チャージ時間 + 解放遅延（実測 82f）
 * - それ以外: 発射レートを 1 フレームごとに蓄積し、1 発分たまったフレームで発射（端数は持ち越し）。
 *   21-C3: 蓄積はゲーム内の時計（C-0058）。AR 720rpm は 5f が 9 回と 4f が 1 回の繰り返し、MG はレート上昇に従って間隔が縮む。
 */
export function simulateShotFrames(
  shot: ShotParams,
  model: WeaponModel = DEFAULT_WEAPON_MODEL,
  params: FiringParams = firingParams(shot),
): number[] {
  if (shot.maxAmmo < 1) throw new RangeError(`maxAmmo must be >= 1, got ${shot.maxAmmo}`);
  if (shot.rateOfFire <= 0) throw new RangeError(`rateOfFire must be positive, got ${shot.rateOfFire}`);
  const frames: number[] = [0];
  if (isChargeWeapon(shot)) {
    const interval = params.chargeFrames + model.chargeReleaseFrames;
    for (let i = 1; i < params.maxAmmo; i++) frames.push(i * interval);
    return frames;
  }
  let acc = 0;
  let t = 0;
  while (frames.length < params.maxAmmo) {
    t += 1;
    acc += rateAfterShots(shot, frames.length) / MAX_RPM;
    if (acc >= 1 - ACC_EPSILON) {
      acc -= 1;
      frames.push(t);
    }
  }
  return frames;
}

export function firstShotFrames(
  shot: ShotParams,
  model: WeaponModel = DEFAULT_WEAPON_MODEL,
  params: FiringParams = firingParams(shot),
): number {
  // Stage 22-A: チャージ武器はハイドから構えてチャージするので、発と発の間から構え解除のぶんを引く（C-0110）
  if (isChargeWeapon(shot)) return Math.max(0, params.chargeFrames + model.chargeReleaseFrames - model.aimOutFrames);
  // Stage 22-C: チャージの無い武器（MG を含む）も、ハイドから構えてから撃つ（C-0114）
  return model.aimInFrames;
}

/** リロード完了から次のマガジンの 1 発目まで。Stage 24: チャージの無い武器は武器種によらず 24f（MG を含む。C-0148） */
export function reloadFirstShotFrames(
  shot: ShotParams,
  model: WeaponModel = DEFAULT_WEAPON_MODEL,
  params: FiringParams = firingParams(shot),
): number {
  // Stage 22-A: チャージ武器のリロードの後は、発と発の間と同じ（構え解除を含む。C-0144 の紅蓮BS 172f・ラム 200f）
  if (isChargeWeapon(shot)) return params.chargeFrames + model.chargeReleaseFrames;
  // Stage 24: MG も AR・SMG・SG と同じ（22 までは MG だけ初弾遅延 20f。C-0002）
  return model.reloadFirstShotFrames;
}

export function computeCadence(
  shot: ShotParams,
  model: WeaponModel = DEFAULT_WEAPON_MODEL,
  params: FiringParams = firingParams(shot),
): CadenceResult {
  const shotFrames = simulateShotFrames(shot, model, params);
  const first = firstShotFrames(shot, model, params);
  const reloadFirst = reloadFirstShotFrames(shot, model, params);
  const magazineFrames = shotFrames[shotFrames.length - 1] ?? 0;
  const chunks = reloadChunks({ maxAmmo: params.maxAmmo, reloadBullet: shot.reloadBullet });
  const reloadFrames = params.reloadChunkFrames * chunks;
  // 1 周期 = リロード明けの 1 発目の遅れ + マガジン + リロード。戦闘開始のマガジンだけ first から始まる
  const cycleFrames = reloadFirst + magazineFrames + reloadFrames;
  return {
    shotFrames,
    firstShotFrames: first,
    reloadFirstShotFrames: reloadFirst,
    magazineFrames,
    reloadChunks: chunks,
    reloadFrames,
    cycleFrames,
    cycleSeconds: framesToGameSeconds(cycleFrames),
    triggersPerCycle: params.maxAmmo,
    triggersPerSecond: params.maxAmmo / framesToGameSeconds(cycleFrames),
  };
}
