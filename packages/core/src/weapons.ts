// CDN には無い「解釈ルール」だけを置く。武器の数値自体はキャラごとの ShotParams を使う。
import { FRAMES_PER_GAME_SECOND } from './time.ts';
import type { ShotParams, WeaponType } from './types.ts';

/**
 * Stage 21: 武器の CDN の秒（チャージ・リロード・撃ち直し）をフレームに直す換算。射撃の刻みの較正
 * （C-0001・C-0002・C-0014 など）はこの換算との差として決めているので、ゲーム内の秒（time.ts）とは分けて持つ。
 * 21-C2 で録画を読み直し、1 秒 = 60f と 58.82f のどちらも ±1f で合って決まらなかったので、60f のまま
 * （plan/design-stage21.md 8.7 節、V-0011）
 */
export const WEAPON_FRAMES_PER_SECOND = 60;

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
  /** チャージ完了から発射・次チャージ開始までの追加フレーム。SR/RL とも実測 82f = チャージ 60f + 22f */
  chargeReleaseFrames: number;
  /**
   * スピンアップ武器（MG）がリロード完了から 1 発目を撃つまでのフレーム。実測 約 20f（C-0002）。
   * Stage 22-C: 戦闘開始・窓の明けには使わない（aimInFrames。戦闘開始に 20f の初弾遅延は無い。C-0114）
   */
  spinUpFirstShotFrames: number;
  /**
   * 21-C3: チャージもスピンアップも無い武器（AR・SMG・SG）が、リロードを込め終えてから 1 発目を撃つまでのフレーム。
   * 最終弾 → 次の 1 発目がリロードの時間より 20〜24f 長い（C-0059）。武器種で分けず、チャージの解放遅延と同じ 22f。
   * 戦闘開始・窓の明けの 1 発目には使わない（Stage 22-C の aimInFrames）
   */
  reloadFirstShotFrames: number;
  /**
   * Stage 22-A: チャージ武器の構え解除モーション（紅蓮BS 等は射撃後の硬直を含む）のフレーム。発と発の間
   * （チャージ + chargeReleaseFrames）は「構え解除 → 構え → チャージ → 射撃」で、ハイドしていた状態（戦闘開始・窓の明け）からの
   * 1 発目は構え解除が無いぶん早い（C-0110。紅蓮BS 43f → 30f、ラム 82f → 70f）。リロードの後の 1 発目は発と発の間と同じ
   */
  aimOutFrames: number;
  /**
   * Stage 22-C: チャージの無い武器（AR・SMG・SG・MG）の構えモーションのフレーム。ハイドしていた状態（戦闘開始・窓の明け）から
   * 1 発目を撃つまで（C-0114。戦闘開始は 11〜13f、窓の明けは MG 11f。SG はノワール 12f）。武器種で分けない
   * （plan/design-stage22.md 8 節）。チャージ武器の構えは発と発の間から aimOutFrames を引いた長さに含まれる（Stage 22-A）
   */
  aimInFrames: number;
};

export const DEFAULT_WEAPON_MODEL: WeaponModel = {
  chargeReleaseFrames: 22,
  spinUpFirstShotFrames: 20,
  reloadFirstShotFrames: 22,
  aimOutFrames: 13,
  aimInFrames: 12,
};

/** 武器の CDN の秒 → フレーム（切り上げ） */
export function secondsToFrames(seconds: number): number {
  return Math.ceil(seconds * WEAPON_FRAMES_PER_SECOND);
}

export function isChargeWeapon(shot: Pick<ShotParams, 'chargeTime' | 'inputType'>): boolean {
  return shot.chargeTime > 0 && shot.inputType !== 'DOWN';
}

export function hasSpinUp(shot: Pick<ShotParams, 'rateOfFireChangePerShot' | 'endRateOfFire' | 'rateOfFire'>): boolean {
  return shot.rateOfFireChangePerShot > 0 && shot.endRateOfFire > shot.rateOfFire;
}
