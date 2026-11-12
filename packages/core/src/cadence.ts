// マガジン 1 周期（1 発目までの遅延 + 発射 × 装弾数 + リロード）をフレーム単位で離散化し、平均の秒間トリガー数を求める。
// モデルは 2026-09-22 の射撃場録画（AR / SR / RL / MG）で較正済み。plan/verification.md 参照。
// Stage 10: 射撃に効くバフの実効値（frame/firing.ts の FiringParams）を受け取れるようにした。省略は基礎値（Stage 9 と同じ）。
// 平均の秒間トリガー数（computeCadence）は、枠の結果の cadence（sim/engine.ts）と 1 区間の静的 DPS（damage.ts の computeDamage）が持つ。
// Stage 21-C3: rpm の蓄積をゲーム内の時計にし（C-0058）、AR・SMG・SG のリロード明けの遅れを足した（C-0059。
// plan/design-stage21.md 8.8 節、V-0011）。
import { chargeShotIntervalFrames, firingParams, type FiringParams } from './frame/firing.ts';
import type { ShotParams } from './types.ts';
import { framesToGameSeconds } from './time.ts';
import {
  DEFAULT_WEAPON_MODEL,
  MAX_RPM,
  aimLongerFrames,
  hasSpinUp,
  hideAimShorterFrames,
  isChargeWeapon,
  type WeaponModel,
} from './weapons.ts';

export type CadenceResult = {
  /** 各発の発射フレーム（1 発目 = 0） */
  shotFrames: number[];
  /** 戦闘開始から 1 発目までのフレーム。入力が UP のチャージ武器は構え + チャージ + 満ちてから撃つまで − 1（C-0232）、押下チャージ型はチャージ + 解放遅延 − 構え解除、それ以外は構え（Stage 22-C） */
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

/**
 * i 発目を撃った直後の発射レート（rpm）。MG は 1 発ごとに上昇し 1 フレーム 1 発（MAX_RPM）で頭打ち。
 * 2 段目の段 9 の PR 2: rateScale（攻撃速度▲の 1 + Σ。frame/firing.ts の FiringParams）を掛けてから頭打ちにする（C-0600）
 */
export function rateAfterShots(shot: ShotParams, shotsFired: number, rateScale = 1, spinUpScale = 1): number {
  // 2026-10-29 のキャラの編（plan/design-new-chars-1029.md 5.6 節）: 立ち上げ速度▲は 1 発ごとの上がり幅に掛ける
  const rpm = hasSpinUp(shot)
    ? Math.min(shot.endRateOfFire, shot.rateOfFire + shotsFired * shot.rateOfFireChangePerShot * spinUpScale)
    : shot.rateOfFire;
  return Math.min(MAX_RPM, rpm * rateScale);
}

/** 1 発分たまったか。rpm ÷ MAX_RPM の和が割り算の誤差で整数のすぐ下に出ても 1 発にする */
export const ACC_EPSILON = 1e-9;

/**
 * 各発の発射フレーム（1 発目 = 0）。
 * - チャージ武器: 毎発 チャージ時間 + 解放遅延（実測 82f）。押下チャージ型は解放遅延を足さない（C-0222）。
 *   シンデレラ S1 編（plan/design-cinderella-s1-charge.md 1.2 節）: 押下チャージ型は、発射レートの 1 発分より短くなったら、射手（frame/shooter.ts）と同じく
 *   発射レートの蓄積も待つ（チャージを待つ間は 1 発分で止める）
 * - それ以外: 発射レートを 1 フレームごとに蓄積し、1 発分たまったフレームで発射（端数は持ち越し）。
 *   21-C3: 蓄積はゲーム内の時計（C-0058）。AR 720rpm は 5f が 9 回と 4f が 1 回の繰り返し、MG はレート上昇に従って間隔が縮む。
 */
export function simulateShotFrames(
  shot: ShotParams,
  model: WeaponModel = DEFAULT_WEAPON_MODEL,
  params: FiringParams = firingParams(shot),
): number[] {
  return simulateMagazine(shot, model, params).frames;
}

/**
 * simulateShotFrames の 1 マガジンと、最終弾のフレームの発射レートの蓄積の余り（lastAcc。チャージ武器は使わないので 0）。
 * 全弾リロードの始まりのずれ（reloadStartOffset）に使う
 */
function simulateMagazine(
  shot: ShotParams,
  model: WeaponModel = DEFAULT_WEAPON_MODEL,
  params: FiringParams = firingParams(shot),
): { frames: number[]; lastAcc: number } {
  if (shot.maxAmmo < 1) throw new RangeError(`maxAmmo must be >= 1, got ${shot.maxAmmo}`);
  if (shot.rateOfFire <= 0) throw new RangeError(`rateOfFire must be positive, got ${shot.rateOfFire}`);
  const frames: number[] = [0];
  if (isChargeWeapon(shot)) {
    const interval = chargeShotIntervalFrames(params, model);
    const rate = rateAfterShots(shot, 1) / MAX_RPM;
    if (!params.downCharge || interval * rate >= 1 - ACC_EPSILON) {
      for (let i = 1; i < params.maxAmmo; i++) frames.push(i * interval);
      return { frames, lastAcc: 0 };
    }
    let charged = 0;
    let gate = 0;
    let t = 0;
    while (frames.length < params.maxAmmo) {
      t += 1;
      charged += 1;
      gate += rate;
      if (charged < interval) {
        gate = Math.min(gate, 1);
        continue;
      }
      if (gate < 1 - ACC_EPSILON) continue;
      gate -= 1;
      charged = 0;
      frames.push(t);
    }
    return { frames, lastAcc: 0 };
  }
  let acc = 0;
  let t = 0;
  while (frames.length < params.maxAmmo) {
    t += 1;
    acc += rateAfterShots(shot, frames.length, params.rateScale, params.spinUpScale) / MAX_RPM;
    if (acc >= 1 - ACC_EPSILON) {
      acc -= 1;
      frames.push(t);
    }
  }
  return { frames, lastAcc: acc };
}

export function firstShotFrames(
  shot: ShotParams,
  model: WeaponModel = DEFAULT_WEAPON_MODEL,
  params: FiringParams = firingParams(shot),
): number {
  // 射撃姿勢維持型: ハイドからは姿勢の残りが無く、構え + チャージ + 満ちてから撃つまで − 1（C-0537。紅蓮BS 30f・レイヴン 86f・A2 94f。
  // plan/design-fire-stance-cadence.md 3.2 節）
  if (params.stance !== null) return model.aimInFrames + params.chargeFrames + params.stance.holdFrames - 1;
  // 射撃姿勢維持型でない入力が UP のチャージ武器も同じ形で、満ちてから撃つまでは 1f（RL 71f・SR 70f。SR は構えが 1f 短い。
  // C-0232。V-0149）。Stage 22-A の「発と発の間 − 構え解除 13f」（69f）は構えを 10f と置いていた
  if (isChargeWeapon(shot) && shot.inputType === 'UP') {
    const aim = model.aimInFrames - hideAimShorterFrames(shot, model);
    return aim + params.chargeFrames + model.chargeFullToShotFrames - 1;
  }
  // Stage 22-A: 押下チャージ型は確かめていないので、発と発の間から構え解除のぶんを引いたまま（C-0537）
  if (isChargeWeapon(shot)) return Math.max(0, params.chargeFrames + model.chargeReleaseFrames - model.aimOutFrames);
  // Stage 22-C: チャージの無い武器（MG を含む）も、ハイドから構えてから撃つ（C-0114）。InstantBox は構えが長い（V-0675）
  return model.aimInFrames + aimLongerFrames(shot, model);
}

/** リロード完了から次のマガジンの 1 発目まで。Stage 24: チャージの無い武器は武器種によらず 24f（MG を含む。C-0148） */
export function reloadFirstShotFrames(
  shot: ShotParams,
  model: WeaponModel = DEFAULT_WEAPON_MODEL,
  params: FiringParams = firingParams(shot),
): number {
  // Stage 22-A: チャージ武器のリロードの後は、発と発の間と同じ（構え解除を含む。C-0149 の紅蓮BS 172f・ラム 200f）。
  // ゲームの完了（RELOADING のバーが消える）は構え解除のぶん遅く、完了からは firstShotFrames で撃つ（C-0537）。
  // 最後の発からの長さは同じなので分け方はそのままにし、窓の明けだけ unhideShooter で合わせる（V-0135）
  // 射撃姿勢維持型も発と発の間と同じ（リロードの側に stanceReloadExtraFrames を足してある。C-0149）
  if (params.stance !== null) return chargeShotIntervalFrames(params, model);
  // 押下チャージ型でも、リロードの後は解放を足す（C-0222）
  if (isChargeWeapon(shot)) return params.chargeFrames + model.chargeReleaseFrames;
  // Stage 24: MG も AR・SMG・SG と同じ（22 までは MG だけ初弾遅延 20f。C-0002）。InstantBox は構えが長い（V-0675）
  return model.reloadFirstShotFrames + aimLongerFrames(shot, model);
}

/**
 * 全弾リロード（分割でない）の 1 回分のフレーム数（最終弾のフレームから、射手が残弾を満たすまで。整数）。plan/design-reload-rounding.md
 * 案 E（V-0681）: ゲームの込め終わり（RELOADING のバーが消える）は、リロードの始まり（最終弾のフレーム + startOffset）から数えて
 * ⌈startOffset + x + c⌉（x は reloadChunkFrames、c は reloadCompleteExtraFrames）で、1 回ごとに丸め、端数を持ち越さない。
 * 射手は込め終わりの k 前に残弾を満たし、k をリロード明けの待ち（reloadFirstShotFrames）に入れてある。k はリロード明けの待ちのうち
 * 込め終わりより前の分で、チャージの無い武器は reloadFirstShotFrames − reloadCompleteToShotFrames、チャージ武器は解放 −
 * reloadCompleteToShotFrames（リロード明けの待ちは チャージ + 解放、込め終わり → 1 発目は チャージ + reloadCompleteToShotFrames）。
 * 射撃姿勢維持型は、x に stanceReloadExtraFrames（C-0149）が入っていて、同じ式で録画の値になる（設計書 10 節）
 */
export function fullReloadFrames(
  shot: ShotParams,
  model: WeaponModel,
  params: FiringParams,
  startOffset: number,
): number {
  const before = fullReloadLeadFrames(shot, model, params);
  // 割り算の誤差で整数のすぐ上に出た値を切り上げないよう、ごく小さな幅を引く。max(0, …) はリロード速度 100% 以上の 0
  return Math.max(
    0,
    Math.ceil(startOffset + params.reloadChunkFrames + model.reloadCompleteExtraFrames - before - 1e-9),
  );
}

/** 全弾リロードの k（射手が残弾を満たしてから込め終わりまで。fullReloadFrames） */
function fullReloadLeadFrames(shot: ShotParams, model: WeaponModel, params: FiringParams): number {
  return reloadWaitOutsideChargeFrames(shot, model, params) - model.reloadCompleteToShotFrames;
}

/**
 * 込め終わり（RELOADING のバーが消える）から次のマガジンの 1 発目までのフレーム数。射手は、全弾リロードでは込め終わりの k 前に
 * 残弾を満たしてリロード明けの待ち（reloadFirstShotFrames）に入り、分割リロードでは込め終わりに満たす（C-0154）
 */
export function reloadCompleteToFirstShotFrames(shot: ShotParams, model: WeaponModel, params: FiringParams): number {
  const wait = reloadFirstShotFrames(shot, model, params);
  return params.splitReload ? wait : wait - fullReloadLeadFrames(shot, model, params);
}

/** リロード明けの待ちのうちチャージの外の長さ（チャージの無い武器は reloadFirstShotFrames、チャージ武器は解放。fullReloadFrames の k） */
function reloadWaitOutsideChargeFrames(shot: ShotParams, model: WeaponModel, params: FiringParams): number {
  if (!isChargeWeapon(shot)) return model.reloadFirstShotFrames;
  // 射撃姿勢維持型と押下チャージ型は解放を武器で変えない（射撃姿勢維持型の k が 11 になるのは設計書 10 節の打ち消し合い）
  if (params.stance !== null || params.downCharge) return model.chargeReleaseFrames;
  return params.weapon?.chargeReleaseFrames ?? model.chargeReleaseFrames;
}

/**
 * 全弾リロードの始まりの、最終弾のフレームからのずれ（負は前。V-0681）。入力が UP のチャージ武器（射撃姿勢維持型を含む）は
 * upChargeReloadStartFrames、押下チャージ型は 0。チャージの無い武器は、最終弾の本当の発の時刻（最終弾のフレームの発射レートの蓄積の
 * 余り acc を、そのフレームの 1 フレームぶんの蓄積で割ったぶん前。lastShotIndex は最終弾がマガジンの何発目か（0 始まり））。
 * 毎フレーム撃つ速さ（MG）では 0
 */
export function reloadStartOffset(
  shot: ShotParams,
  model: WeaponModel,
  params: FiringParams,
  acc: number,
  lastShotIndex: number,
): number {
  if (isChargeWeapon(shot)) return params.downCharge ? 0 : model.upChargeReloadStartFrames;
  const inc = rateAfterShots(shot, lastShotIndex, params.rateScale, params.spinUpScale) / MAX_RPM;
  return inc >= 1 - ACC_EPSILON || inc <= 0 ? 0 : -acc / inc;
}

/** 分割リロードの段と、ハイド中のリロードの 1 回分のフレーム数（端数つきの長さを切り上げた整数。C-0154・C-0959） */
export function ceilChunkFrames(params: FiringParams): number {
  // 割り算の誤差で整数のすぐ上に出た値を切り上げないよう、ごく小さな幅を引く
  return Math.ceil(params.reloadChunkFrames - 1e-9);
}

export function computeCadence(
  shot: ShotParams,
  model: WeaponModel = DEFAULT_WEAPON_MODEL,
  params: FiringParams = firingParams(shot),
): CadenceResult {
  const magazine = simulateMagazine(shot, model, params);
  const shotFrames = magazine.frames;
  const first = firstShotFrames(shot, model, params);
  const reloadFirst = reloadFirstShotFrames(shot, model, params);
  const magazineFrames = shotFrames[shotFrames.length - 1] ?? 0;
  const chunks = reloadChunks({ maxAmmo: params.maxAmmo, reloadBullet: params.reloadBullet });
  // 1 回分は射手と同じ整数。全弾リロードはマガジンの最終弾の蓄積の余りから（fullReloadFrames）、分割リロードは込めない 1 段 +
  // 段の数を、それぞれ切り上げた整数で数える（C-0154）
  const reloadFrames = params.splitReload
    ? ceilChunkFrames(params) * (chunks + 1)
    : fullReloadFrames(
        shot,
        model,
        params,
        reloadStartOffset(shot, model, params, magazine.lastAcc, shotFrames.length - 1),
      );
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
