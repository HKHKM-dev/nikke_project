// Stage 8: 各枠の射撃の列（純関数）。sim と calc が共有する 1 パス目の土台。
// Stage 8 の範囲では射撃のタイミングがバフにもバーストにも依存しない（弾数・リロード・チャージ速度のバフは Stage 10）ので、
// 射撃の列は編成だけで決まる。ゲージ（burst/dynamic.ts）も、回数トリガー（skills/timeline.ts）も、sim の本体（engine.ts）も
// この列を読む（plan/design-stage8.md 1 節・3.1 節）。
// Stage 10: 射撃に効くバフが入ると射撃の列はバフに依存するので、1 パス目は frame/firstPass.ts のフレームループが作る。
// planShots はバフなし（基礎値）の列で、射撃に効く効果の無い編成では firstPass と 1 フレームも違わない。
import type { CharacterData } from '../types.ts';
import { DEFAULT_WEAPON_MODEL, isChargeWeapon, type WeaponModel } from '../weapons.ts';
import { firingParams } from './firing.ts';
import { initialShooter, stepShooter } from './shooter.ts';

export type ShotLog = {
  /** 発射フレーム（昇順）。1 要素 = 1 トリガー（弾薬 1 消費。SG は全ペレットで 1 つ） */
  frames: number[];
  /** チャージ武器なら true。常にフルチャージで撃つモデルなので、fullChargeShot の列 = frames */
  fullCharge: boolean;
  /** Stage 10: 残弾を 0 にした射撃のフレーム（frames の部分列。「最後の弾丸」）。省略は無し（手で作る列のため） */
  lastShotFrames?: number[];
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
    const params = firingParams(shot);
    const state = initialShooter(shot, model, params);
    const fired: number[] = [];
    const lastShotFrames: number[] = [];
    for (let f = 0; f < frames; f++) {
      if (!stepShooter(state, shot, model, params)) continue;
      fired.push(f);
      if (state.lastShot) lastShotFrames.push(f);
    }
    return { frames: fired, fullCharge: isChargeWeapon(shot), lastShotFrames };
  });
}
