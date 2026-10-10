// CDN には無い「解釈ルール」だけを置く。武器の数値自体はキャラごとの ShotParams を使う。
import { FRAMES_PER_GAME_SECOND, GAME_SECONDS_PER_FRAME } from './time.ts';
import type { ShotParams, WeaponType } from './types.ts';

/**
 * rpm の蓄積の分母: 1 フレームに 1 発になる rpm（= 60 × ゲーム内の 1 秒のフレーム数、約 3529 rpm）。これが上限。
 * 21-C3: rpm はゲーム内の時計で進む（C-0058。AR 720 rpm は 60 発で 290f、SMG 1440 rpm は 120 発で 292f）。
 * 21-B までは 3600（1 秒 = 60f）だった
 */
export const MAX_RPM = 60 * FRAMES_PER_GAME_SECOND;

export const WEAPON_TYPES = ['AR', 'SMG', 'SR', 'RL', 'SG', 'MG'] as const satisfies readonly WeaponType[];

export const WEAPON_LABEL: Record<WeaponType, { ja: string; en: string }> = {
  AR: { ja: 'アサルトライフル', en: 'Assault Rifle' },
  SMG: { ja: 'サブマシンガン', en: 'Submachine Gun' },
  SR: { ja: 'スナイパーライフル', en: 'Sniper Rifle' },
  RL: { ja: 'ロケットランチャー', en: 'Rocket Launcher' },
  SG: { ja: 'ショットガン', en: 'Shotgun' },
  MG: { ja: 'マシンガン', en: 'Machine Gun' },
};

/**
 * 実測で較正する定数（2026-09-22 射撃場の 60fps 録画で較正。plan/verification.md 参照）。
 */
export type WeaponModel = {
  /**
   * チャージ武器の発と発の間のうち、チャージ（chargeSecondsToFrames）の外の長さ。Stage 23: 23f（C-0535）。
   * 撃った後に表示が出ない 13f・100% のまま待つ 9f・満ちてから撃つまで 1f の和（075-05）。発と発の間は
   * 1 秒チャージで 59 + 23 = 82f、1.5 秒チャージで 89 + 23 = 112f。22 までは 1 秒 = 60f のチャージとの差だった（C-0001）。
   * 押下チャージ型（DOWN_Charge）は発と発の間に足さない（C-0222。frame/firing.ts の chargeShotIntervalFrames）
   * 射撃姿勢維持型（frame/firing.ts の stanceFrames）には使わない（姿勢の長さ + aimInFrames。plan/design-fire-stance-cadence.md）
   */
  chargeReleaseFrames: number;
  /**
   * 使用武器の変更（殲滅モード）で持ち替えたスピンアップ武器の 1 発目までのフレーム（frame/shooter.ts の weaponChangeShooter）。
   * Stage 24 で、MG のリロード明けは reloadFirstShotFrames（24f。C-0148）に移したので、使うのはここだけ。値は MG のリロード明けの
   * 初弾遅延だった 20f（C-0002。棄却）のままで、持ち替えについては較正していない
   */
  spinUpFirstShotFrames: number;
  /**
   * 21-C3: チャージもスピンアップも無い武器（AR・SMG・SG）が、リロードを込め終えてから 1 発目を撃つまでのフレーム。
   * Stage 24: リロードをゲーム内の時計で数えると、最終弾 → 次の 1 発目はリロードの時間より 23〜24.5f 長く、武器種によらない
   * （C-0148。MG も同じ値）。最終弾 → リロード完了の約 12f（C-0135）と、完了 → 1 発目の約 12f（C-0115・C-0117）の和。
   * 22f までは、リロードを 1 秒 = 60f で数えたときの差だった（C-0059）。戦闘開始・窓の明けの 1 発目には使わない（aimInFrames）
   */
  reloadFirstShotFrames: number;
  /**
   * Stage 22-A: チャージ武器の構え解除モーション（紅蓮BS 等は射撃後の硬直を含む）のフレーム。発と発の間
   * （チャージ + chargeReleaseFrames）は「構え解除 → 構え → チャージ → 射撃」で、ハイドしていた状態（戦闘開始・窓の明け）からの
   * 1 発目は構え解除が無いぶん早い（C-0537。紅蓮BS 43f → 30f、ラム 82f → 70f）。リロードの完了から 1 発目までも同じく
   * 構え解除が無い長さだが、モデルは最後の発からの長さ（C-0149）を「完了まで + 完了から発と発の間」に分けたままにし、
   * 窓の明けにだけ frame/shooter.ts の unhideShooter で扱う（V-0135）。
   * いまハイドからの 1 発目に使うのは押下チャージ型（DOWN_Charge）だけ。入力が UP のチャージ武器は、射撃姿勢維持型
   * （plan/design-fire-stance-cadence.md）もそうでない武器（C-0232。V-0149）も、aimInFrames + チャージ + 満ちてから撃つまで − 1
   */
  aimOutFrames: number;
  /**
   * Stage 22-C: チャージの無い武器（AR・SMG・SG・MG）の構えモーションのフレーム。ハイドしていた状態（戦闘開始・窓の明け）から
   * 1 発目を撃つまで（C-0114。戦闘開始は 11〜13f、窓の明けは MG 11f。SG はノワール 12f）。武器種で分けない
   * （plan/design-stage22.md 8 節）。チャージ武器の構えは発と発の間から aimOutFrames を引いた長さに含まれる（Stage 22-A）。
   * 射撃姿勢維持型のチャージ武器は、姿勢が終わってから 100% のまま待つ構えにも使う（紅蓮BS・レイヴン・A2 とも 12f。C-0216）。
   * 入力が UP のチャージ武器のハイドからの 1 発目の構え（ハイド → チャージの表示が 100% を超える）にも使う（C-0537・C-0232）
   */
  aimInFrames: number;
  /**
   * 射撃姿勢維持型でない入力が UP のチャージ武器が、チャージが満ちてから撃つまで（マガジンの中もハイドからも 1f。
   * 075-05・077-26。C-0232）。chargeReleaseFrames（23f）の内訳の 1 つで、ハイドからの 1 発目（cadence.ts の firstShotFrames）にだけ使う
   */
  chargeFullToShotFrames: number;
  /**
   * 入力が UP の SR（即着弾のチャージ武器。fireType が Instant）は、ハイドからの 1 発目の構えが aimInFrames より 1f 短い
   * （戦闘開始・敵のジャンプの明けとも 11f。ラム・ヘルム・アリス。C-0232。V-0149）。RL は戦闘開始 12f・明け 11f
   * （rlWindowEndShorterFrames）。理由は分かっていない
   */
  srHideAimShorterFrames: number;
  /**
   * 射撃姿勢維持型のリロードに足すフレーム（最終弾から次のマガジンの 1 発目までが、リロード + これ + 発と発の間）。
   * 紅蓮BS 11f（C-0149）。レイヴン・A2 も約 11〜12f（V-0130「条件」）。内訳は分かっていない（plan/design-fire-stance-cadence.md 3.4 節）
   */
  stanceReloadExtraFrames: number;
  /**
   * 入力が UP の RL（飛ぶ弾の武器。fireType が Instant 以外は RL だけ）は、敵のジャンプの明けからの 1 発目の構えが、
   * 戦闘開始より 1f 短い（明け 11f・戦闘開始 12f。レイヴン・A2・I-DOLL・フラワーで、チャージと満ちてから撃つまでは同じ。C-0229。
   * V-0143）。frame/shooter.ts の unhideShooter で firstShotFrames から引く。SR は戦闘開始も明けも 11f で（C-0232）、
   * 明けで引かない（windowEndShorterFrames。戦闘開始からの短さは srHideAimShorterFrames）
   */
  rlWindowEndShorterFrames: number;
};

export const DEFAULT_WEAPON_MODEL: WeaponModel = {
  chargeReleaseFrames: 23,
  spinUpFirstShotFrames: 20,
  reloadFirstShotFrames: 24,
  aimOutFrames: 13,
  aimInFrames: 12,
  chargeFullToShotFrames: 1,
  srHideAimShorterFrames: 1,
  stanceReloadExtraFrames: 11,
  rlWindowEndShorterFrames: 1,
};

/**
 * Stage 24: リロードの秒 → フレーム（端数つき）。ゲーム内の時計（1 フレーム 0.017 秒）で数え、丸めない（C-0145・C-0142。
 * plan/design-weapon-seconds.md 10.5 節）。射手は 1 回分ごとに、前の回の端数を足して切り捨て、残りを次へ持ち越す
 * （frame/shooter.ts の nextChunkFrames）。rpm の蓄積（C-0058）と同じ形。21-C〜23 は 1 秒 = 60f の切り上げだった。
 * 分割リロードの段は、この長さを段ごとに切り上げる（C-0154）
 */
export function reloadSecondsToFrames(seconds: number): number {
  return seconds / GAME_SECONDS_PER_FRAME;
}

/**
 * Stage 23: チャージの秒 → フレーム。ゲーム内の時計（1 フレーム 0.017 秒）で数え、切り上げる（C-0140。
 * plan/design-weapon-seconds.md 9 節の 7・10.4 節）。割り算の誤差で整数のすぐ上に出た値を切り上げないよう、ごく小さな幅を引く
 */
export function chargeSecondsToFrames(seconds: number): number {
  return Math.ceil(seconds / GAME_SECONDS_PER_FRAME - 1e-9);
}

export function isChargeWeapon(shot: Pick<ShotParams, 'chargeTime' | 'inputType'>): boolean {
  return shot.chargeTime > 0 && shot.inputType !== 'DOWN';
}

/**
 * 敵のジャンプの明けからの 1 発目を、戦闘開始（firstShotFrames）より何フレーム早く撃つか。入力が UP の RL だけ
 * WeaponModel.rlWindowEndShorterFrames（C-0229）。ほかは 0
 */
export function windowEndShorterFrames(
  shot: Pick<ShotParams, 'chargeTime' | 'inputType' | 'fireType'>,
  model: Pick<WeaponModel, 'rlWindowEndShorterFrames'>,
): number {
  return isChargeWeapon(shot) && shot.inputType === 'UP' && shot.fireType !== 'Instant'
    ? model.rlWindowEndShorterFrames
    : 0;
}

/**
 * 入力が UP のチャージ武器のハイドからの 1 発目の構えを、aimInFrames より何フレーム短くするか。即着弾（SR）だけ
 * WeaponModel.srHideAimShorterFrames（C-0232）。ほかは 0
 */
export function hideAimShorterFrames(
  shot: Pick<ShotParams, 'chargeTime' | 'inputType' | 'fireType'>,
  model: Pick<WeaponModel, 'srHideAimShorterFrames'>,
): number {
  return isChargeWeapon(shot) && shot.inputType === 'UP' && shot.fireType === 'Instant'
    ? model.srHideAimShorterFrames
    : 0;
}

export function hasSpinUp(shot: Pick<ShotParams, 'rateOfFireChangePerShot' | 'endRateOfFire' | 'rateOfFire'>): boolean {
  return shot.rateOfFireChangePerShot > 0 && shot.endRateOfFire > shot.rateOfFire;
}
