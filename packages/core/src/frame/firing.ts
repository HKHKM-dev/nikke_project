// 射撃に効くバフ（最大装弾数・リロード速度・チャージ速度・攻撃速度）と装弾数無限・使用武器の変更から、射手が使う実効値
// （FiringParams）を作る（plan/design-stage10.md 3 節、plan/design-stage11-modernia.md 3.4 節）。
// 最大装弾数は録画 0037・0039（比率は加算、端数は四捨五入）、速度の式は録画 0040（時間 × (1 − 速度)）で確定した。
// 攻撃速度▲は、レートの蓄積の倍率（rateScale）として掛ける（plan/design-skill-stage9.md 1.2 節。V-0458）。
// 射撃姿勢維持型（maintainFireStance > 0）の刻みも、CDN の項目からここで作る（plan/design-fire-stance-cadence.md）。
import type { BuffTotals, ChangedWeapon } from '../skills/buffs.ts';
import { GAME_SECONDS_PER_FRAME } from '../time.ts';
import type { ShotParams } from '../types.ts';
import {
  chargeSecondsToFrames,
  DEFAULT_WEAPON_MODEL,
  hasSpinUp,
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
  | 'reloadRatio'
  | 'chargeSpeed'
  | 'attackSpeed'
  | 'spinUpSpeed'
  | 'chargeTimeFlat'
  | 'fixedChargeTime'
  | 'fireStanceScale'
  | 'infiniteAmmo'
  | 'weapon'
>;

export const ZERO_FIRING_BUFFS: Readonly<FiringBuffs> = Object.freeze({
  maxAmmoRatio: 0,
  maxAmmoFlat: 0,
  reloadSpeed: 0,
  reloadRatio: 0,
  chargeSpeed: 0,
  attackSpeed: 0,
  spinUpSpeed: 0,
  chargeTimeFlat: 0,
  fixedChargeTime: 0,
  fireStanceScale: 1,
  infiniteAmmo: 0,
  weapon: null,
});

/** 射手が各フレームで使う実効値 */
export type FiringParams = {
  /** 最大装弾数（1 以上の整数） */
  maxAmmo: number;
  /**
   * 分割リロードの 1 回分（reloadBullet ≥ 1 の武器は 1 回で満タン）のフレーム数。端数つき（reloadSecondsToFrames）。
   * 射手が待つ整数は、全弾リロードは 1 回ごとに丸める（cadence.ts の fullReloadFrames。plan/design-reload-rounding.md 案 E）、
   * 分割リロードは段ごとに切り上げる（C-0154）。
   * 射撃姿勢維持型は WeaponModel.stanceReloadExtraFrames を足した値（C-0149。plan/design-fire-stance-cadence.md 3.4 節）
   */
  reloadChunkFrames: number;
  /**
   * 分割リロード（reloadBullet < 1）か。込め始めの前に弾を込めない 1 段を待ち、段の長さは切り上げた整数（C-0154。
   * plan/design-sg-split-reload.md）
   */
  splitReload: boolean;
  /**
   * 分割リロードの 1 段で込める割合（CDN の reloadBullet）。リロード比率で reloadBullet × max(0, 1 + Σ) にする（▼50% で 0.5 → 0.25。
   * V-0735。plan/design-grave.md 2.3 節）。段の弾数は reloadChunkAmmo。分割リロードでない武器（reloadBullet ≥ 1）は変えない
   */
  reloadBullet: number;
  /** チャージ時間のフレーム数（チャージ武器だけ意味を持つ。解放遅延は含まない。チャージ速度はここにだけ効く） */
  chargeFrames: number;
  /** 射撃姿勢維持型のチャージ武器の姿勢（stanceFrames）。ほかの武器は null */
  stance: StanceFrames | null;
  /**
   * 押下チャージ型（inputType が DOWN_Charge）のチャージ武器か。押下チャージ型は、発と発の間がチャージ時間だけで、
   * 解放の分（WeaponModel.chargeReleaseFrames）を足さない（アニス：スターで、窓の外 59f・チャージ時間の固定の窓 42f。C-0222）。
   * リロードの後の 1 発目は今までどおり足す。チャージの途中でチャージ時間が変わったら、前の発（リロードの後は、込め終えてから
   * 解放の分の後）からの経過を持ち越す（frame/shooter.ts の chargeElapsed。C-0541・C-0542）。ほかの 5 体も同じ刻み（C-0222。シンデレラ・ラプラス：UH・ベスティー：TU はチャージ速度▲の絡む形で C-0603・C-0698・C-0700・C-0804）
   */
  downCharge: boolean;
  /**
   * レートの蓄積に掛ける倍率 1 + 攻撃速度（チャージ武器は 1。plan/design-skill-stage9.md 1.2 節）。
   * マガジンの中の発と発の間だけを縮め、リロード・リロード明けの待ち・構えは変えない（V-0458 の録画 0510〜0512。C-0600）
   */
  rateScale: number;
  /**
   * MG のレートの上がり方（rateOfFireChangePerShot）に掛ける倍率
   * 1 + 立ち上げ速度（スピンアップの無い武器は 1。plan/design-new-chars-1029.md 5.6 節）。
   * 最高レート（endRateOfFire）と初弾の遅れは変えない（読みは仮説。論点 I）
   */
  spinUpScale: number;
  /** 装弾数無限（撃っても残弾を減らさない） */
  infiniteAmmo: boolean;
  /** 使用武器の変更（無ければ null = 基礎の武器）。射手は変更後の武器を別の状態で撃つ（frame/firstPass.ts） */
  weapon: ChangedWeapon | null;
};

/**
 * 最大装弾数の比率の端数の扱い。**録画 0039（録画 A）で四捨五入と確定**:
 * リターの最大装弾数 45.17% でデルタ（SR 6 発）が 6 × 1.4517 = 8.71 → **9**（切り捨てなら 8）、
 * リター自身（SMG 120 発）が 174.2 → **174**（切り上げなら 175）、ドレイクは 3 つ重ねて 9 × 2.6749 = 24.07 → 24
 */
export const MAX_AMMO_ROUNDING: 'floor' | 'round' = 'round';

/**
 * リロード速度・チャージ速度の式。'subtract' = 時間 × max(0, 1 − 速度)、'divide' = 時間 ÷ (1 + 速度)。
 * **録画 0040（録画 B）で subtract と確定**: アドミのリロード速度 50.91% の間のラム（SR・リロード 2 秒）の
 * リロードが 66f（窓の外は 126f。表示の遅れ 6f を引いて 60f ≒ 120 × 0.4909 = 59f。divide なら 80f）、
 * ユニのチャージ速度 8.97% のフルバースト中のラムの射撃間隔が 4 発平均 77.0f（窓の外は 82.0f。divide なら 78f）
 */
export const SPEED_FORMULA: 'subtract' | 'divide' = 'subtract';

export function isZeroFiring(buffs: FiringBuffs): boolean {
  return (
    buffs.maxAmmoRatio === 0 &&
    buffs.maxAmmoFlat === 0 &&
    buffs.reloadSpeed === 0 &&
    buffs.reloadRatio === 0 &&
    buffs.chargeSpeed === 0 &&
    buffs.attackSpeed === 0 &&
    buffs.spinUpSpeed === 0 &&
    buffs.chargeTimeFlat === 0 &&
    buffs.fixedChargeTime === 0 &&
    buffs.fireStanceScale === 1 &&
    buffs.infiniteAmmo === 0 &&
    buffs.weapon === null
  );
}

/** 射撃姿勢維持型の姿勢（plan/design-fire-stance-cadence.md 3.2 節。C-0217） */
export type StanceFrames = {
  /** 姿勢の長さ ⌈S⌉。S = maintainFireStance ÷ 100 秒をゲーム内の時計で数えた長さ。満ちたフレームから表示が 100% に戻るまで */
  frames: number;
  /** 満ちてから撃つまで H = max(1, ⌈S × uptypeFireTiming ÷ 10000⌉)。射撃姿勢維持型でない武器は 1f（0075-05） */
  holdFrames: number;
};

/**
 * 射撃姿勢維持型（maintainFireStance > 0）のチャージ武器の姿勢。ほかは null。
 * 項目を持つのは紅蓮：ブラックシャドウ（13.53f → 14・1）・A2（49.41f → 50・24）・レイヴン（48.82f → 49・16）の 3 体だけで、
 * 3 体とも発と発の間・ハイドからの 1 発目が実測とフレーム単位で合う（C-0149・C-0216・C-0218）。丸め（切り上げ）は 3 体に合うものを
 * 選んだ（四捨五入では A2 が 1f 合わない。設計書 3.3 節）。割り算の誤差で整数のすぐ上に出た値を切り上げないよう、ごく小さな幅を引く。
 * scale は射撃の姿勢の長さの倍率（BuffTotals.fireStanceScale）で、丸める前の S に掛ける（A2 の B モードの 0.5 で 25・12。C-1155。
 * plan/design-a2-bmode-stance.md 3.2 節）
 */
export function stanceFrames(shot: ShotParams, scale = 1): StanceFrames | null {
  if (!isChargeWeapon(shot) || shot.maintainFireStance <= 0) return null;
  const s = (shot.maintainFireStance / 100 / GAME_SECONDS_PER_FRAME) * scale;
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

/** max(1, 丸め(基礎 × (1 + Σ比率)) + Σ固定)。比率は加算（録画 0037。OL の行とキューブも同じ和に入る: C-0328・C-0329） */
export function effectiveMaxAmmo(baseMaxAmmo: number, buffs: FiringBuffs): number {
  if (buffs.maxAmmoRatio === 0 && buffs.maxAmmoFlat === 0) return baseMaxAmmo;
  const scaled = baseMaxAmmo * (1 + buffs.maxAmmoRatio);
  // 1e-9 は 9 × 2.2232 のような積の浮動小数の誤差で 1 つ下に落ちないため
  const rounded = MAX_AMMO_ROUNDING === 'floor' ? Math.floor(scaled + 1e-9) : Math.round(scaled);
  return Math.max(1, rounded + buffs.maxAmmoFlat);
}

/**
 * バフ込みの実効値。buffs 省略は基礎値。
 * 使用武器の変更が効いていれば、装弾数・リロード・チャージは変更後の武器から取る
 */
export function firingParams(
  base: ShotParams,
  buffs: FiringBuffs = ZERO_FIRING_BUFFS,
  model: Pick<WeaponModel, 'stanceReloadExtraFrames'> = DEFAULT_WEAPON_MODEL,
): FiringParams {
  const shot = buffs.weapon?.shot ?? base;
  const stance = stanceFrames(shot, buffs.fireStanceScale);
  return {
    maxAmmo: effectiveMaxAmmo(shot.maxAmmo, buffs),
    reloadChunkFrames:
      reloadSecondsToFrames(speedScaledSeconds(shot.reloadTime, buffs.reloadSpeed)) +
      (stance === null ? 0 : model.stanceReloadExtraFrames),
    splitReload: shot.reloadBullet < 1,
    reloadBullet: shot.reloadBullet < 1 ? shot.reloadBullet * Math.max(0, 1 + buffs.reloadRatio) : shot.reloadBullet,
    // max(0, …) は、0 秒のチャージで切り上げが −0 を出すのを 0 にそろえる
    chargeFrames: isChargeWeapon(shot) ? Math.max(0, chargeSecondsToFrames(chargeSecondsOf(shot, buffs))) : 0,
    stance,
    downCharge: isChargeWeapon(shot) && shot.inputType === 'DOWN_Charge',
    // 攻撃速度▲は AR・SMG・SG にだけ書ける（味方へは skills/parse/timed.ts の validateAttackSpeed、自分へは
    // skills/__tests__/definitions.test.ts がキャラの武器で見る。plan/design-sugar.md 2.1 節）。チャージ武器は発と発の間を
    // チャージで決めるので掛けない
    rateScale: isChargeWeapon(shot) ? 1 : Math.max(0, 1 + buffs.attackSpeed),
    spinUpScale: hasSpinUp(shot) ? Math.max(0, 1 + buffs.spinUpSpeed) : 1,
    // 変更後の武器そのものが残弾を減らさない変更（WeaponChangeEffect.infiniteAmmo。たきなのバースト）
    infiniteAmmo: buffs.infiniteAmmo > 0 || buffs.weapon?.infiniteAmmo === true,
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
  // 使用武器の変更の解放の長さ（端数あり。射手が発ごとに持ち越す。plan/design-red-hood.md 7.1 節の論点 10）
  return (
    params.chargeFrames + (params.downCharge ? 0 : (params.weapon?.chargeReleaseFrames ?? model.chargeReleaseFrames))
  );
}

/**
 * チャージ時間の秒数。発動者基準のチャージ速度は、比率で縮めた後の秒数からさらに引く（アリス自身は比率と同じ値になる）。
 * チャージ時間の固定が効いていれば、チャージ速度を無視してその秒数（plan/design-anis-star-s2-burst.md 2.3 節）。
 * 使用武器の変更の武器のチャージ時間の固定（ChangedWeapon.fixedChargeTime）も同じ
 */
function chargeSecondsOf(shot: ShotParams, buffs: FiringBuffs): number {
  if (buffs.fixedChargeTime > 0) return buffs.fixedChargeTime;
  // チャージ時間を固定した使用武器の変更の武器も、チャージ速度▲を受けない（plan/design-nayuta.md 2.4 節）
  if (buffs.weapon?.fixedChargeTime === true) return shot.chargeTime;
  return Math.max(0, speedScaledSeconds(shot.chargeTime, buffs.chargeSpeed) - buffs.chargeTimeFlat);
}

/** 分割リロードの 1 回分の弾数: max(1, round(最大 × reloadBullet))。reloadBullet ≥ 1 は満タン（録画 0037・0019: 9 → 3、20 → 7、14 → 5） */
export function reloadChunkAmmo(maxAmmo: number, reloadBullet: number): number {
  if (reloadBullet >= 1) return maxAmmo;
  return Math.max(1, Math.round(maxAmmo * reloadBullet));
}
