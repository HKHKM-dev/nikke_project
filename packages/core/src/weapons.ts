// CDN には無い「解釈ルール」だけを置く。武器の数値自体はキャラごとの ShotParams を使う。
import type { ShotParams, WeaponType } from './types.ts';

/**
 * Stage 21: 武器の CDN の秒（チャージ・リロード・撃ち直し）と rpm をフレームに直す換算。射撃の刻みの較正
 * （C-0001・C-0002・C-0014 など）はこの換算との差として決めているので、ゲーム内の秒（time.ts）とは分けて持つ。
 * 1 秒 = 58.82f にするかは 21-C で録画と照らして決める（plan/design-stage21.md 0.3 節）
 */
export const WEAPON_FRAMES_PER_SECOND = 60;

/** 1 フレームに 1 発が上限（3600 rpm） */
export const MAX_RPM = WEAPON_FRAMES_PER_SECOND * 60;

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
  /** スピンアップ武器（MG）がリロード完了・戦闘開始から 1 発目を撃つまでのフレーム。実測 約 20f */
  spinUpFirstShotFrames: number;
};

export const DEFAULT_WEAPON_MODEL: WeaponModel = {
  chargeReleaseFrames: 22,
  spinUpFirstShotFrames: 20,
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
