// Stage 10: 射撃に効くバフ（最大装弾数・リロード速度・チャージ速度）から、射手が使う実効値を作る（plan/design-stage10.md 3 節）。
// 最大装弾数は録画 37・39（比率は加算、端数は四捨五入）、速度の式は録画 40（時間 × (1 − 速度)）で確定した。
// Stage 11 モダニア: 装弾数無限と使用武器の変更（殲滅モード）も射撃の実効値に入れた（plan/design-stage11-modernia.md 3.4 節）。
// 射撃姿勢維持型（maintainFireStance > 0）の刻みも、CDN の項目からここで作る（plan/design-fire-stance-cadence.md。
// Stage 11 の紅蓮BS の較正表 MEASURED_CHARGE_CADENCE を置き換えた）。
import type { BuffTotals, ChangedWeapon } from '../skills/buffs.ts';
import { GAME_SECONDS_PER_FRAME } from '../time.ts';
import type { ShotParams } from '../types.ts';
import {
  chargeSecondsToFrames,
  DEFAULT_WEAPON_MODEL,
  isChargeWeapon,
  reloadSecondsToFrames,
  type WeaponModel,
} from '../weapons.ts';

/** 射撃に効くバフの合計（BuffTotals のうち射撃に効くフィールド） */
export type FiringBuffs = Pick<
  BuffTotals,
  | 'maxAmmoRatio'
  | 'maxAmmoFlat'
  | 'reloadSpeed'
  | 'chargeSpeed'
  | 'chargeTimeFlat'
  | 'fixedChargeTime'
  | 'infiniteAmmo'
  | 'weapon'
>;

export const ZERO_FIRING_BUFFS: Readonly<FiringBuffs> = Object.freeze({
  maxAmmoRatio: 0,
  maxAmmoFlat: 0,
  reloadSpeed: 0,
  chargeSpeed: 0,
  chargeTimeFlat: 0,
  fixedChargeTime: 0,
  infiniteAmmo: 0,
  weapon: null,
});

/** 射手が各フレームで使う実効値 */
export type FiringParams = {
  /** 最大装弾数（1 以上の整数） */
  maxAmmo: number;
  /**
   * 分割リロードの 1 回分（reloadBullet ≥ 1 の武器は 1 回で満タン）のフレーム数。Stage 24: 端数つき（reloadSecondsToFrames）。
   * 射手は端数を持ち越して整数の待ちにする（frame/shooter.ts の nextChunkFrames）。分割リロードは段ごとに切り上げる（C-0154）。
   * 射撃姿勢維持型は WeaponModel.stanceReloadExtraFrames を足した値（C-0149。plan/design-fire-stance-cadence.md 3.4 節）
   */
  reloadChunkFrames: number;
  /**
   * 分割リロード（reloadBullet < 1）か。込め始めの前に弾を込めない 1 段を待ち、段の長さは切り上げた整数（C-0154。
   * plan/design-sg-split-reload.md）
   */
  splitReload: boolean;
  /** チャージ時間のフレーム数（チャージ武器だけ意味を持つ。解放遅延は含まない。チャージ速度はここにだけ効く） */
  chargeFrames: number;
  /** 射撃姿勢維持型のチャージ武器の姿勢（stanceFrames）。ほかの武器は null */
  stance: StanceFrames | null;
  /**
   * 押下チャージ型（inputType が DOWN_Charge）のチャージ武器か。押下チャージ型は、発と発の間がチャージ時間だけで、
   * 解放の分（WeaponModel.chargeReleaseFrames）を足さない（アニス：スターで、窓の外 59f・チャージ時間の固定の窓 42f。C-0222）。
   * リロードの後の 1 発目は今までどおり足す。チャージの途中でチャージ時間が変わったら、前の発（リロードの後は、込め終えてから
   * 解放の分の後）からの経過を持ち越す（frame/shooter.ts の chargeElapsed。C-0380）。ほかの 5 体はアニス：スターの形を当てている（未確認。V-0134）
   */
  downCharge: boolean;
  /** Stage 11 モダニア: 装弾数無限（撃っても残弾を減らさない） */
  infiniteAmmo: boolean;
  /** Stage 11 モダニア: 使用武器の変更（無ければ null = 基礎の武器）。射手は変更後の武器を別の状態で撃つ（frame/firstPass.ts） */
  weapon: ChangedWeapon | null;
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
  return (
    buffs.maxAmmoRatio === 0 &&
    buffs.maxAmmoFlat === 0 &&
    buffs.reloadSpeed === 0 &&
    buffs.chargeSpeed === 0 &&
    buffs.chargeTimeFlat === 0 &&
    buffs.fixedChargeTime === 0 &&
    buffs.infiniteAmmo === 0 &&
    buffs.weapon === null
  );
}

/** 射撃姿勢維持型の姿勢（plan/design-fire-stance-cadence.md 3.2 節。C-0217） */
export type StanceFrames = {
  /** 姿勢の長さ ⌈S⌉。S = maintainFireStance ÷ 100 秒をゲーム内の時計で数えた長さ。満ちたフレームから表示が 100% に戻るまで */
  frames: number;
  /** 満ちてから撃つまで H = max(1, ⌈S × uptypeFireTiming ÷ 10000⌉)。射撃姿勢維持型でない武器は 1f（075-05） */
  holdFrames: number;
};

/**
 * 射撃姿勢維持型（maintainFireStance > 0）のチャージ武器の姿勢。ほかは null。
 * 項目を持つのは紅蓮：ブラックシャドウ（13.53f → 14・1）・A2（49.41f → 50・24）・レイヴン（48.82f → 49・16）の 3 体だけで、
 * 3 体とも発と発の間・ハイドからの 1 発目が実測とフレーム単位で合う（C-0149・C-0216・C-0218）。丸め（切り上げ）は 3 体に合うものを
 * 選んだ（四捨五入では A2 が 1f 合わない。設計書 3.3 節）。割り算の誤差で整数のすぐ上に出た値を切り上げないよう、ごく小さな幅を引く
 */
export function stanceFrames(shot: ShotParams): StanceFrames | null {
  if (!isChargeWeapon(shot) || shot.maintainFireStance <= 0) return null;
  const s = shot.maintainFireStance / 100 / GAME_SECONDS_PER_FRAME;
  return {
    frames: Math.ceil(s - 1e-9),
    holdFrames: Math.max(1, Math.ceil((s * shot.uptypeFireTiming) / 10000 - 1e-9)),
  };
}

/** 速度のバフで縮めた秒数 */
export function speedScaledSeconds(seconds: number, speed: number): number {
  if (speed === 0) return seconds;
  return SPEED_FORMULA === 'subtract' ? seconds * Math.max(0, 1 - speed) : seconds / (1 + Math.max(0, speed));
}

/** max(1, 丸め(基礎 × (1 + Σ比率)) + Σ固定)。比率は加算（録画 37。OL の行とキューブも同じ和に入る: C-0328・C-0329） */
export function effectiveMaxAmmo(baseMaxAmmo: number, buffs: FiringBuffs): number {
  if (buffs.maxAmmoRatio === 0 && buffs.maxAmmoFlat === 0) return baseMaxAmmo;
  const scaled = baseMaxAmmo * (1 + buffs.maxAmmoRatio);
  // 1e-9 は 9 × 2.2232 のような積の浮動小数の誤差で 1 つ下に落ちないため
  const rounded = MAX_AMMO_ROUNDING === 'floor' ? Math.floor(scaled + 1e-9) : Math.round(scaled);
  return Math.max(1, rounded + buffs.maxAmmoFlat);
}

/**
 * バフ込みの実効値。buffs 省略は基礎値（Stage 9 までの射手と同じ）。
 * Stage 11 モダニア: 使用武器の変更が効いていれば、装弾数・リロード・チャージは変更後の武器から取る
 */
export function firingParams(
  base: ShotParams,
  buffs: FiringBuffs = ZERO_FIRING_BUFFS,
  model: Pick<WeaponModel, 'stanceReloadExtraFrames'> = DEFAULT_WEAPON_MODEL,
): FiringParams {
  const shot = buffs.weapon?.shot ?? base;
  const stance = stanceFrames(shot);
  return {
    maxAmmo: effectiveMaxAmmo(shot.maxAmmo, buffs),
    reloadChunkFrames:
      reloadSecondsToFrames(speedScaledSeconds(shot.reloadTime, buffs.reloadSpeed)) +
      (stance === null ? 0 : model.stanceReloadExtraFrames),
    splitReload: shot.reloadBullet < 1,
    // max(0, …) は、0 秒のチャージで切り上げが −0 を出すのを 0 にそろえる
    chargeFrames: isChargeWeapon(shot) ? Math.max(0, chargeSecondsToFrames(chargeSecondsOf(shot, buffs))) : 0,
    stance,
    downCharge: isChargeWeapon(shot) && shot.inputType === 'DOWN_Charge',
    infiniteAmmo: buffs.infiniteAmmo > 0,
    weapon: buffs.weapon,
  };
}

/**
 * チャージ武器の発と発の間。
 * - 射撃姿勢維持型: 姿勢の長さ ⌈S⌉ + 構え（aimInFrames）+ チャージ − 1（姿勢の残り ⌈S⌉ − H・構え・チャージの伸び C − 1・
 *   満ちてから撃つまで H の和。plan/design-fire-stance-cadence.md 3.2 節。紅蓮BS 43f・レイヴン 119f・A2 120f）。
 *   押下チャージ型と重なるキャラはいない（重なれば姿勢を優先する）
 * - ほか: チャージ + 解放（chargeReleaseFrames）。押下チャージ型は解放を足さない（FiringParams.downCharge。C-0222）
 */
export function chargeShotIntervalFrames(
  params: FiringParams,
  model: Pick<WeaponModel, 'chargeReleaseFrames' | 'aimInFrames'>,
): number {
  if (params.stance !== null) return params.stance.frames + model.aimInFrames + params.chargeFrames - 1;
  return params.chargeFrames + (params.downCharge ? 0 : model.chargeReleaseFrames);
}

/**
 * チャージ時間の秒数。Stage 11 アリス編: 発動者基準のチャージ速度は、比率で縮めた後の秒数からさらに引く（アリス自身は比率と同じ値になる）。
 * アニス：スター編: チャージ時間の固定が効いていれば、チャージ速度を無視してその秒数（plan/design-anis-star-s2-burst.md 2.3 節）
 */
function chargeSecondsOf(shot: ShotParams, buffs: FiringBuffs): number {
  if (buffs.fixedChargeTime > 0) return buffs.fixedChargeTime;
  return Math.max(0, speedScaledSeconds(shot.chargeTime, buffs.chargeSpeed) - buffs.chargeTimeFlat);
}

/** 分割リロードの 1 回分の弾数: max(1, round(最大 × reloadBullet))。reloadBullet ≥ 1 は満タン（録画 37・19: 9 → 3、20 → 7、14 → 5） */
export function reloadChunkAmmo(maxAmmo: number, reloadBullet: number): number {
  if (reloadBullet >= 1) return maxAmmo;
  return Math.max(1, Math.round(maxAmmo * reloadBullet));
}
