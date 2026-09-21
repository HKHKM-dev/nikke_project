// CDN には無い「解釈ルール」だけを置く。武器の数値自体はキャラごとの ShotParams を使う。
import type { ShotParams, WeaponType } from './types.ts';

export const FPS = 60;

/** 1 フレームに 1 発が上限（3600 rpm） */
export const MAX_RPM = FPS * 60;

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

export function secondsToFrames(seconds: number): number {
  return Math.ceil(seconds * FPS);
}

export function isChargeWeapon(shot: Pick<ShotParams, 'chargeTime' | 'inputType'>): boolean {
  return shot.chargeTime > 0 && shot.inputType !== 'DOWN';
}

export function hasSpinUp(shot: Pick<ShotParams, 'rateOfFireChangePerShot' | 'endRateOfFire' | 'rateOfFire'>): boolean {
  return shot.rateOfFireChangePerShot > 0 && shot.endRateOfFire > shot.rateOfFire;
}
