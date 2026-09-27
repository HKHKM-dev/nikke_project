// Stage 21: モデルの時間の単位（plan/design-stage21.md 3.1 節）。
// モデルの 1 フレーム = 録画の動画の 1 フレーム。ゲーム内の秒（戦闘の長さ・スキルの持続・CT・フルバーストの長さ・
// 的の出来事）と、秒で出す値は、ここで換算する。武器の CDN の秒・rpm は weapons.ts の WEAPON_FRAMES_PER_SECOND
// （21-C で決める）。

/**
 * ゲーム内の 1 秒あたりのフレーム数。21-A では今までと同じ 60（数値を変えない）。
 * 21-B で 1 ÷ 0.017（ゲーム内の時計は動画の 1 フレームに約 0.017 秒進む。C-0048・C-0050）にする。
 */
export const FRAMES_PER_GAME_SECOND = 60;

/** 長さ（持続・CT・フルバースト・戦闘の長さ）: ゲーム内の秒 → フレーム（切り上げ） */
export function gameSecondsToFrames(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError(`duration must be >= 0, got ${seconds}`);
  return Math.ceil(seconds * FRAMES_PER_GAME_SECOND);
}

/** 時刻（出来事の境目）: ゲーム内の秒 → フレーム（四捨五入） */
export function gameSecondsToFrame(seconds: number): number {
  return Math.round(seconds * FRAMES_PER_GAME_SECOND);
}

/** 出力: フレーム → ゲーム内の秒 */
export function framesToGameSeconds(frames: number): number {
  return frames / FRAMES_PER_GAME_SECOND;
}
