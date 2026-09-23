// Stage 8: 各枠の射撃の列（純関数）。sim と calc が共有する 1 パス目の土台。
// Stage 8 の範囲では射撃のタイミングがバフにもバーストにも依存しない（弾数・リロード・チャージ速度のバフは Stage 10）ので、
// 射撃の列は編成だけで決まる。ゲージ（burst/dynamic.ts）も、回数トリガー（skills/timeline.ts）も、sim の本体（engine.ts）も
// この列を読む（plan/design-stage8.md 1 節・3.1 節）。
import type { CharacterData } from '../types.ts';
import { DEFAULT_WEAPON_MODEL, isChargeWeapon, type WeaponModel } from '../weapons.ts';
import { initialShooter, stepShooter } from './shooter.ts';

export type ShotLog = {
  /** 発射フレーム（昇順）。1 要素 = 1 トリガー（弾薬 1 消費。SG は全ペレットで 1 つ） */
  frames: number[];
  /** チャージ武器なら true。常にフルチャージで撃つモデルなので、fullChargeShot の列 = frames */
  fullCharge: boolean;
};

/** 各枠の射手を frames フレーム回し、発射フレームを記録する。空枠は null */
export function planShots(
  slots: readonly ({ character: CharacterData } | null)[],
  frames: number,
  model: WeaponModel = DEFAULT_WEAPON_MODEL,
): (ShotLog | null)[] {
  if (!Number.isInteger(frames) || frames < 0) {
    throw new RangeError(`frames must be a non-negative integer, got ${frames}`);
  }
  return slots.map((slot) => {
    if (slot === null) return null;
    const shot = slot.character.shot;
    const state = initialShooter(shot, model);
    const fired: number[] = [];
    for (let f = 0; f < frames; f++) if (stepShooter(state, shot, model)) fired.push(f);
    return { frames: fired, fullCharge: isChargeWeapon(shot) };
  });
}
