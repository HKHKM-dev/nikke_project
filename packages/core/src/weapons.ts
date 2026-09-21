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

/** 実測で較正する定数。 */
export type WeaponModel = {
  /** チャージ完了から発射・次チャージ開始までの追加フレーム（参考 OSS は約 22f。既定 0） */
  chargeReleaseFrames: number;
};

export const DEFAULT_WEAPON_MODEL: WeaponModel = {
  chargeReleaseFrames: 0,
};

/** 60fps 量子化した発射間隔（フレーム）。AR 720rpm→5f、SMG 1440rpm→3f、MG 上限 1f */
export function framesPerShot(rpm: number): number {
  if (rpm <= 0) throw new RangeError(`rpm must be positive, got ${rpm}`);
  return Math.max(1, Math.ceil(MAX_RPM / Math.min(rpm, MAX_RPM)));
}

export function secondsToFrames(seconds: number): number {
  return Math.ceil(seconds * FPS);
}

export function isChargeWeapon(shot: Pick<ShotParams, 'chargeTime' | 'inputType'>): boolean {
  return shot.chargeTime > 0 && shot.inputType !== 'DOWN';
}

export function hasSpinUp(
  shot: Pick<ShotParams, 'rateOfFireChangePerShot' | 'endRateOfFire' | 'rateOfFire'>,
): boolean {
  return shot.rateOfFireChangePerShot > 0 && shot.endRateOfFire > shot.rateOfFire;
}
