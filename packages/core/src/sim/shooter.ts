// Stage 5: 1 体の通常射撃をフレームごとに進める状態機械。
// cadence.ts と同じ規則（レート蓄積、チャージ + 解放遅延、リロード = 回数 × リロード時間、MG の初弾遅延）を逐次処理で書き直したもので、
// 発射フレーム列は k × cycleFrames + firstShotFrames + shotFrames[i] と 1 フレームもずれない（sim/__tests__/shooter.test.ts で固定）。
//
// wait は「撃てないフレームがあと何個残っているか」。stepShooter は先に判定してから減らす:
//   戦闘開始        wait = firstShotFrames                        → AR は f=0、MG は f=20、チャージ武器は f=82 に 1 発目
//   チャージ武器    発射したフレーム S で wait = charge + release − 1 → 次弾は S + 82
//   リロード        最終弾のフレーム L で wait = reload × chunks + first − 1 → 次のマガジンの 1 発目は L + reload + first
import { firstShotFrames, rateAfterShots, reloadChunks } from '../cadence.ts';
import type { ShotParams } from '../types.ts';
import { DEFAULT_WEAPON_MODEL, MAX_RPM, isChargeWeapon, secondsToFrames, type WeaponModel } from '../weapons.ts';

export type ShooterState = {
  /** 残弾 */
  ammo: number;
  /** このマガジンで撃った数（レート上昇と 1 発目判定に使う） */
  shotsInMagazine: number;
  /** 次に撃てるまでの残りフレーム（初弾遅延・チャージ・リロード） */
  wait: number;
  /** レート蓄積（非チャージ武器の 2 発目以降） */
  acc: number;
  /** wait が切れたらマガジンを戻して 1 発目を撃つ */
  reloading: boolean;
};

export function initialShooter(shot: ShotParams, model: WeaponModel = DEFAULT_WEAPON_MODEL): ShooterState {
  if (shot.maxAmmo < 1) throw new RangeError(`maxAmmo must be >= 1, got ${shot.maxAmmo}`);
  if (shot.rateOfFire <= 0) throw new RangeError(`rateOfFire must be positive, got ${shot.rateOfFire}`);
  return { ammo: shot.maxAmmo, shotsInMagazine: 0, wait: firstShotFrames(shot, model), acc: 0, reloading: false };
}

/** 1 フレーム進める（state を書き換える）。このフレームに発射したら true */
export function stepShooter(state: ShooterState, shot: ShotParams, model: WeaponModel = DEFAULT_WEAPON_MODEL): boolean {
  if (state.wait > 0) {
    state.wait -= 1;
    return false;
  }
  if (state.reloading) {
    state.reloading = false;
    state.ammo = shot.maxAmmo;
    state.shotsInMagazine = 0;
    state.acc = 0;
  }
  const charge = isChargeWeapon(shot);
  if (state.shotsInMagazine > 0 && !charge) {
    // simulateShotFrames と同じ: 前の発射の翌フレームから毎フレーム蓄積し、1 発分たまったフレームで撃つ
    state.acc += rateAfterShots(shot, state.shotsInMagazine) / MAX_RPM;
    if (state.acc < 1) return false;
    state.acc -= 1;
  }
  state.shotsInMagazine += 1;
  state.ammo -= 1;
  if (state.ammo <= 0) {
    state.reloading = true;
    const reloadFrames = secondsToFrames(shot.reloadTime) * reloadChunks(shot);
    state.wait = Math.max(0, reloadFrames + firstShotFrames(shot, model) - 1);
  } else if (charge) {
    state.wait = Math.max(0, secondsToFrames(shot.chargeTime) + model.chargeReleaseFrames - 1);
  }
  return true;
}

/** 最初の frames フレームで発射したフレームの列（テスト・CLI 用） */
export function shotFramesUpTo(shot: ShotParams, frames: number, model: WeaponModel = DEFAULT_WEAPON_MODEL): number[] {
  const state = initialShooter(shot, model);
  const fired: number[] = [];
  for (let f = 0; f < frames; f++) if (stepShooter(state, shot, model)) fired.push(f);
  return fired;
}
