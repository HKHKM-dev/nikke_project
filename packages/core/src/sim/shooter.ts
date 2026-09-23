// Stage 5: 1 体の通常射撃をフレームごとに進める状態機械。
// cadence.ts と同じ規則（レート蓄積、チャージ + 解放遅延、リロード = 回数 × リロード時間、MG の初弾遅延）を逐次処理で書き直したもので、
// 発射フレーム列は k × cycleFrames + firstShotFrames + shotFrames[i] と 1 フレームもずれない（sim/__tests__/shooter.test.ts で固定）。
//
// wait は「撃てないフレームがあと何個残っているか」。stepShooter は先に判定してから減らす:
//   戦闘開始        wait = firstShotFrames                        → AR は f=0、MG は f=20、チャージ武器は f=82 に 1 発目
//   チャージ武器    発射したフレーム S で wait = charge + release − 1 → 次弾は S + 82
//   リロード        最終弾のフレーム L から、1 回分ずつ込めて最後の 1 回分を込め終えたところで 1 発目の遅延につなぐ
//                   → 次のマガジンの 1 発目は L + reload × chunks + first（最大装弾数が一定なら Stage 9 と同じ）
//
// Stage 10: 射撃に効くバフ（最大装弾数・リロード速度・チャージ速度）を FiringParams として毎フレーム受け取る（sim/firing.ts）。
// 分割リロードは 1 回分ずつ込め、1 回分の弾数は込めるたびにその時点の最大装弾数で決める（録画 37: 3 → 10 → 17 → 20、
// 録画 19: 0 → 5 → 8 → 9）。最大装弾数が増えても残弾は増えない（録画 37）。
// つなぎ目の −1 は「最終弾の直後」の 1 回だけにする（plan/design-stage10.md 3.3 節）。1 回分の完了ごとに −1 すると
// 1 回分につき 1 フレームずつ早くなる。
//
// Stage 11 モダニア: 装弾数無限（FiringParams.infiniteAmmo）の間は撃っても残弾を減らさない。使用武器の変更（殲滅モード）は
// sim/firstPass.ts が別の射手の状態で撃ち、終わったら resumeShooter で基礎の武器の状態に戻す（plan/design-stage11-modernia.md 3.4 節）。
import { firstShotFrames, rateAfterShots } from '../cadence.ts';
import type { ShotParams } from '../types.ts';
import { DEFAULT_WEAPON_MODEL, MAX_RPM, isChargeWeapon, type WeaponModel } from '../weapons.ts';
import { firingParams, reloadChunkAmmo, type FiringParams } from './firing.ts';

/**
 * 最大装弾数が残弾より小さくなった（最大装弾数▲が切れた）ときに残弾を削るか。
 * **2026-09-23 の録画 39（録画 A）で「削る」と確定**: リターの 5 秒窓が切れた瞬間に、デルタの表示が 9/9 → 6/6 になった
 */
export const MAX_AMMO_CLAMP_ON_DECREASE = true;

export type ShooterPhase =
  /** 撃てる（wait が切れたら撃つ） */
  | 'ready'
  /** リロード中（wait が切れたら 1 回分を込める） */
  | 'reloading'
  /** 込め終えて 1 発目の遅延中（wait が切れたら撃つ。マガジンの状態はここで戻す） */
  | 'priming';

export type ShooterState = {
  phase: ShooterPhase;
  /** 残弾 */
  ammo: number;
  /** このマガジンで撃った数（レート上昇と 1 発目判定に使う） */
  shotsInMagazine: number;
  /** 次に何かが起きるまでの残りフレーム（初弾遅延・チャージ・リロードの 1 回分） */
  wait: number;
  /** レート蓄積（非チャージ武器の 2 発目以降） */
  acc: number;
  /** 直前に撃った射撃で残弾が 0 になったか（「最後の弾丸」の印。stepShooter が撃ったフレームだけ意味を持つ） */
  lastShot: boolean;
};

export function initialShooter(
  shot: ShotParams,
  model: WeaponModel = DEFAULT_WEAPON_MODEL,
  params: FiringParams = firingParams(shot),
): ShooterState {
  if (shot.maxAmmo < 1) throw new RangeError(`maxAmmo must be >= 1, got ${shot.maxAmmo}`);
  if (shot.rateOfFire <= 0) throw new RangeError(`rateOfFire must be positive, got ${shot.rateOfFire}`);
  return {
    phase: 'ready',
    ammo: params.maxAmmo,
    shotsInMagazine: 0,
    wait: firstShotFrames(shot, model, params),
    acc: 0,
    lastShot: false,
  };
}

/**
 * リロード中に 1 回分を込め終えた（または込め始めの時点で 0 フレームの 1 回分が続く）ときの処理。
 * 最大に届いたら 1 発目の遅延（priming）へ。届かなければ次の 1 回分。
 * 1 回分が 0 フレーム（リロード速度 100% 以上）なら同じフレームで続けて込める。
 * @returns 1 発目の遅延が 0 で、このフレームにそのまま撃ってよいなら true
 */
function loadChunks(state: ShooterState, shot: ShotParams, model: WeaponModel, params: FiringParams): boolean {
  for (;;) {
    state.ammo = Math.min(params.maxAmmo, state.ammo + reloadChunkAmmo(params.maxAmmo, shot.reloadBullet));
    if (state.ammo < params.maxAmmo) {
      if (params.reloadChunkFrames > 0) {
        state.wait = params.reloadChunkFrames - 1;
        return false;
      }
      continue;
    }
    state.phase = 'priming';
    const first = firstShotFrames(shot, model, params);
    if (first === 0) return true;
    state.wait = first - 1;
    return false;
  }
}

/** 撃つ（残弾・マガジンの状態を進め、次の待ちを決める） */
function fire(state: ShooterState, shot: ShotParams, model: WeaponModel, params: FiringParams): void {
  state.shotsInMagazine += 1;
  if (params.infiniteAmmo) {
    // Stage 11 モダニア: 装弾数無限。残弾は減らず、リロードも最後の弾丸も起きない
    state.lastShot = false;
    if (isChargeWeapon(shot)) state.wait = Math.max(0, params.chargeFrames + model.chargeReleaseFrames - 1);
    return;
  }
  state.ammo -= 1;
  state.lastShot = state.ammo <= 0;
  if (state.ammo <= 0) {
    state.ammo = 0;
    state.phase = 'reloading';
    if (params.reloadChunkFrames > 0) {
      // 最終弾の直後の 1 回だけ −1 する（先に判定してから減らすため）。1 回分の完了は L + R、L + 2R…
      state.wait = params.reloadChunkFrames - 1;
      return;
    }
    // 1 回分が 0 フレーム: 最終弾のフレームで込め終える。1 発目は早くて次のフレーム（Stage 9 の Math.max(0, …) と同じ）
    const fireNow = loadChunks(state, shot, model, params);
    if (fireNow) state.wait = 0;
    return;
  }
  if (isChargeWeapon(shot)) {
    state.wait = Math.max(0, params.chargeFrames + model.chargeReleaseFrames - 1);
  }
}

/** マガジンを戻す（込め終えて 1 発目を撃つフレーム。MG のレートもここで戻す） */
function startMagazine(state: ShooterState): void {
  state.phase = 'ready';
  state.shotsInMagazine = 0;
  state.acc = 0;
}

/**
 * 1 フレーム進める（state を書き換える）。このフレームに発射したら true。
 * params はこのフレームの射撃の実効値（省略は基礎値）。最大装弾数が残弾より小さくなっていたら先に削る（MAX_AMMO_CLAMP_ON_DECREASE）
 */
export function stepShooter(
  state: ShooterState,
  shot: ShotParams,
  model: WeaponModel = DEFAULT_WEAPON_MODEL,
  params: FiringParams = firingParams(shot),
): boolean {
  if (MAX_AMMO_CLAMP_ON_DECREASE && state.ammo > params.maxAmmo) state.ammo = params.maxAmmo;
  if (state.wait > 0) {
    state.wait -= 1;
    return false;
  }
  if (state.phase === 'reloading') {
    // 1 回分を込め終えた。最大に届いて 1 発目の遅延が 0 ならこのフレームに撃つ（AR・SMG・SG など）
    if (!loadChunks(state, shot, model, params)) return false;
  }
  if (state.phase === 'priming') startMagazine(state);
  if (state.shotsInMagazine > 0 && !isChargeWeapon(shot)) {
    // simulateShotFrames と同じ: 前の発射の翌フレームから毎フレーム蓄積し、1 発分たまったフレームで撃つ
    state.acc += rateAfterShots(shot, state.shotsInMagazine) / MAX_RPM;
    if (state.acc < 1) return false;
    state.acc -= 1;
  }
  fire(state, shot, model, params);
  return true;
}

/**
 * Stage 10: 弾丸チャージ。残弾に amount を足し、最大で止める。リロード中に最大に届いたらリロードを終え、1 発目の遅延に入る
 * （遅延は次のフレームから数える。遅延 0 の武器は次のフレームに撃つ）。値の端数処理は呼ぶ側で行う
 */
export function refillAmmo(
  state: ShooterState,
  amount: number,
  shot: ShotParams,
  model: WeaponModel = DEFAULT_WEAPON_MODEL,
  params: FiringParams = firingParams(shot),
): void {
  if (amount <= 0) return;
  state.ammo = Math.min(params.maxAmmo, state.ammo + amount);
  if (state.phase === 'reloading' && state.ammo >= params.maxAmmo) {
    state.phase = 'priming';
    state.wait = Math.max(0, firstShotFrames(shot, model, params) - 1);
  }
}

/**
 * Stage 11 モダニア: 使用武器の変更が終わって基礎の武器に戻るときの扱い（仮。録画 44 の 6 で確かめる）。
 * 'resume' = しまっておいた基礎の武器の状態（残弾・リロードの途中）をそのまま戻し、撃てる状態ならスピンアップ
 * （1 発目の遅延とレートの蓄積）からやり直す
 */
export const WEAPON_CHANGE_RESTORE = 'resume' as const;

/** Stage 11 モダニア: 使用武器の変更が終わった枠の基礎の武器の状態を戻す（state を書き換える） */
export function resumeShooter(
  state: ShooterState,
  shot: ShotParams,
  model: WeaponModel = DEFAULT_WEAPON_MODEL,
  params: FiringParams = firingParams(shot),
): void {
  if (state.phase !== 'ready') return; // リロードの途中・1 発目の遅延の途中は、その続きから
  state.shotsInMagazine = 0;
  state.acc = 0;
  state.wait = firstShotFrames(shot, model, params);
}

/** 最初の frames フレームで発射したフレームの列（テスト・CLI 用） */
export function shotFramesUpTo(shot: ShotParams, frames: number, model: WeaponModel = DEFAULT_WEAPON_MODEL): number[] {
  const state = initialShooter(shot, model);
  const fired: number[] = [];
  for (let f = 0; f < frames; f++) if (stepShooter(state, shot, model)) fired.push(f);
  return fired;
}
