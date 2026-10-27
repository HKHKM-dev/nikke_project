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
  /**
   * チャージ武器なら true。部分チャージの発（partialShots）を除いた frames が fullChargeShot の列
   * （Stage 22-B まではすべての発をフルチャージとして扱っていた）
   */
  fullCharge: boolean;
  /**
   * Stage 22-B: 攻撃できる的がいなくなった瞬間に、チャージの途中で撃った発（frames の部分列）と、そのチャージの進み（0〜1）。
   * 省略・空は無し（C-0109）
   */
  partialShots?: PartialShot[];
  /** Stage 10: 残弾を 0 にした射撃のフレーム（frames の部分列。「最後の弾丸」）。省略は無し（手で作る列のため） */
  lastShotFrames?: number[];
  /**
   * 使用武器変更の武器のパラメータ編（plan/design-true-damage-element.md 9 節）: 撃ち切りで終わる使用武器の変更が終わったフレーム
   * （最後の弾丸の発 + 1。基礎の武器に戻るフレーム。昇順）。1 パス目が書き、持ち主ごとの一覧（skills/holders.ts）が件の終わりに使う。省略は無し
   */
  weaponChangeEnds?: number[];
  /**
   * シンデレラ S1 編（plan/design-cinderella-s1-charge.md 1.1 節）: 基礎の武器のリロードが最大装弾数まで込め終わったフレームの次のフレーム
   * （込め終わったフレームまでが「リロード完了時に解除」の窓。昇順）。ハイド中のリロードの込め終わりも入る。弾丸チャージで最大に届いた
   * リロードは入れない（使い手に弾丸チャージが無い）。1 パス目が書き、持ち主ごとの一覧（skills/holders.ts）が件の終わりに使う。省略は無し
   */
  reloadEnds?: number[];
  /**
   * 同 9.6 節: 使用武器の変更で持ち替えた武器で撃った射撃のフレーム（frames の部分列。回数トリガー weaponChangeShot の列）。
   * 1 パス目が書く。省略は無し
   */
  weaponChangeShotFrames?: number[];
  /**
   * 2 段目の段 11（plan/design-skill-stage11.md 2.1 節）: チャージしない変更後の武器（instantFire）で撃った射撃のフレーム（frames の
   * 部分列）。fullChargeShot に数えない。1 パス目が書く。省略は無し
   */
  unchargedShotFrames?: number[];
  /**
   * ルドミラ：ウィンターオーナー編（plan/design-ludmilla-wo.md 2.2・2.3 節）: frames と同じ並びの、発ごとの命中の期待値と
   * コアの命中の期待値（1 パス目が書く）。省略は命中 1・コア 0（手で作る列・planShots の列）
   */
  hits?: number[];
  coreHits?: number[];
  /**
   * ペレットの命中編（plan/design-pellet-hit.md 2 節）: frames と同じ並びの、発ごとに的に当たったペレットの数（期待値か、録画で
   * 数えた入力。1 パス目が書く）。省略は hits
   */
  pelletHits?: number[];
};

export type PartialShot = { frame: number; progress: number };

/** Stage 22-B: fullChargeShot に数える発か（チャージ武器で、部分チャージの発でない） */
export function fullChargeFrameSet(log: ShotLog): (frame: number) => boolean {
  if (!log.fullCharge) return () => false;
  // 2 段目の段 11: チャージしない変更後の武器の発も除く
  const partial = new Set([...(log.partialShots ?? []).map((p) => p.frame), ...(log.unchargedShotFrames ?? [])]);
  return (frame) => !partial.has(frame);
}

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

/**
 * Stage 10: 射撃の列 frames（昇順）のうち、区間の列 ranges（[start, end)、昇順・重なりなし）に入る発数。
 * 区間は BuffTimeline の [0, frames) を隙間・重なりなく覆う区間から作るので、どの射撃もちょうど 1 つの区間に入る
 * （一本化の段 A-2 で calc/model.ts から移した。sim の 2 パス目が区間ごとに引く）
 */
export function countShotsInRanges(
  frames: readonly number[],
  ranges: readonly { start: number; end: number }[],
): number {
  let count = 0;
  for (const r of ranges) count += lowerBound(frames, r.end) - lowerBound(frames, r.start);
  return count;
}

/** Stage 22-B: 部分チャージの発のうち、区間の列 ranges に入るもののチャージの進み（発の順） */
export function partialShotsInRanges(
  partial: readonly PartialShot[] | undefined,
  ranges: readonly { start: number; end: number }[],
): number[] {
  if (!partial || partial.length === 0) return [];
  return partial.filter((p) => ranges.some((r) => r.start <= p.frame && p.frame < r.end)).map((p) => p.progress);
}

/** frames の中で value 以上の最初の添字 */
function lowerBound(frames: readonly number[], value: number): number {
  let lo = 0;
  let hi = frames.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (frames[mid]! < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
