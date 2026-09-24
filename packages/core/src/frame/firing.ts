// Stage 10: 射撃に効くバフ（最大装弾数・リロード速度・チャージ速度）から、射手が使う実効値を作る（plan/design-stage10.md 3 節）。
// 最大装弾数は録画 37・39（比率は加算、端数は四捨五入）、速度の式は録画 40（時間 × (1 − 速度)）で確定した。
// Stage 11 モダニア: 装弾数無限と使用武器の変更（殲滅モード）も射撃の実効値に入れた（plan/design-stage11-modernia.md 3.4 節）。
// Stage 11 紅蓮BS: 射撃の刻みを実測で較正する武器（MEASURED_CHARGE_CADENCE）の分もここで足す（plan/design-stage11-scarlet-bs.md 3.3 節）。
import type { BuffTotals, ChangedWeapon } from '../skills/buffs.ts';
import type { ShotParams } from '../types.ts';
import { isChargeWeapon, secondsToFrames } from '../weapons.ts';

/** 射撃に効くバフの合計（BuffTotals のうち射撃に効くフィールド） */
export type FiringBuffs = Pick<
  BuffTotals,
  'maxAmmoRatio' | 'maxAmmoFlat' | 'reloadSpeed' | 'chargeSpeed' | 'chargeTimeFlat' | 'infiniteAmmo' | 'weapon'
>;

export const ZERO_FIRING_BUFFS: Readonly<FiringBuffs> = Object.freeze({
  maxAmmoRatio: 0,
  maxAmmoFlat: 0,
  reloadSpeed: 0,
  chargeSpeed: 0,
  chargeTimeFlat: 0,
  infiniteAmmo: 0,
  weapon: null,
});

/** 射手が各フレームで使う実効値 */
export type FiringParams = {
  /** 最大装弾数（1 以上の整数） */
  maxAmmo: number;
  /** 分割リロードの 1 回分（reloadBullet ≥ 1 の武器は 1 回で満タン）のフレーム数 */
  reloadChunkFrames: number;
  /**
   * チャージ時間のフレーム数（チャージ武器だけ意味を持つ。解放遅延は含まない）。
   * Stage 11 紅蓮BS: 較正表（MEASURED_CHARGE_CADENCE）の武器は chargeExtraFrames を足した値（チャージ速度はチャージ時間の側にだけ効く）
   */
  chargeFrames: number;
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
    buffs.infiniteAmmo === 0 &&
    buffs.weapon === null
  );
}

/** Stage 11 紅蓮BS: 実測の較正値。チャージの後に足すフレームと、リロード 1 回分に足すフレーム（どちらも速度のバフで縮まない） */
export type MeasuredChargeCadence = { chargeExtraFrames: number; reloadExtraFrames: number };

/**
 * Stage 11 紅蓮BS: 射撃の刻みを実測で較正する武器（plan/design-stage11-scarlet-bs.md 3.3 節）。
 * 202 体で射撃のパラメータ（チャージ 0.3 秒・maintainFireStance 23・uptypeFireTiming 1）が紅蓮：ブラックシャドウだけ違い、
 * 1 秒チャージの較正（チャージ 60f + 解放 22f = 82f）が当てはまらない。**録画 46・47** で間隔 43f = チャージ 18f + 3f + 22f、
 * 9 発目 → 次の 1 発目 172f = リロード 120f + 9f + 43f。
 * ShotParams に resourceId が無く、キャラの読み込みの経路（アプリ・テスト・CLI）も複数あるので、射撃のパラメータの組で引く
 * （resourceIds は出どころの記録）。同じ組のキャラが出たら実測で確かめる
 */
export const MEASURED_CHARGE_CADENCE: readonly {
  resourceIds: readonly number[];
  match: Pick<ShotParams, 'chargeTime' | 'maintainFireStance' | 'uptypeFireTiming'>;
  cadence: MeasuredChargeCadence;
}[] = [
  {
    resourceIds: [225],
    match: { chargeTime: 0.3, maintainFireStance: 23, uptypeFireTiming: 1 },
    cadence: { chargeExtraFrames: 3, reloadExtraFrames: 9 },
  },
];

/** 較正表に載っている武器ならその較正値、無ければ null */
export function measuredChargeCadence(shot: ShotParams): MeasuredChargeCadence | null {
  if (!isChargeWeapon(shot)) return null;
  const row = MEASURED_CHARGE_CADENCE.find(
    (r) =>
      r.match.chargeTime === shot.chargeTime &&
      r.match.maintainFireStance === shot.maintainFireStance &&
      r.match.uptypeFireTiming === shot.uptypeFireTiming,
  );
  return row?.cadence ?? null;
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

/**
 * バフ込みの実効値。buffs 省略は基礎値（Stage 9 までの射手と同じ）。
 * Stage 11 モダニア: 使用武器の変更が効いていれば、装弾数・リロード・チャージは変更後の武器から取る
 */
export function firingParams(base: ShotParams, buffs: FiringBuffs = ZERO_FIRING_BUFFS): FiringParams {
  const shot = buffs.weapon?.shot ?? base;
  const measured = measuredChargeCadence(shot);
  return {
    maxAmmo: effectiveMaxAmmo(shot.maxAmmo, buffs),
    reloadChunkFrames:
      secondsToFrames(speedScaledSeconds(shot.reloadTime, buffs.reloadSpeed)) + (measured?.reloadExtraFrames ?? 0),
    // Stage 11 アリス編: 発動者基準のチャージ速度は、比率で縮めた後の秒数からさらに引く（アリス自身は比率と同じ値になる）
    chargeFrames: isChargeWeapon(shot)
      ? secondsToFrames(Math.max(0, speedScaledSeconds(shot.chargeTime, buffs.chargeSpeed) - buffs.chargeTimeFlat)) +
        (measured?.chargeExtraFrames ?? 0)
      : 0,
    infiniteAmmo: buffs.infiniteAmmo > 0,
    weapon: buffs.weapon,
  };
}

/** 分割リロードの 1 回分の弾数: max(1, round(最大 × reloadBullet))。reloadBullet ≥ 1 は満タン（録画 37・19: 9 → 3、20 → 7、14 → 5） */
export function reloadChunkAmmo(maxAmmo: number, reloadBullet: number): number {
  if (reloadBullet >= 1) return maxAmmo;
  return Math.max(1, Math.round(maxAmmo * reloadBullet));
}
