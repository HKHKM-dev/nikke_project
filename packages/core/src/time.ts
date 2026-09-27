// Stage 21: モデルの時間の単位（plan/design-stage21.md 3.1 節）。
// モデルの 1 フレーム = 録画の動画の 1 フレーム。ゲーム内の秒（戦闘の長さ・スキルの持続・CT・フルバーストの長さ・
// 的の出来事）と、秒で出す値は、ここで換算する。武器の CDN の秒・rpm は weapons.ts の WEAPON_FRAMES_PER_SECOND
// （21-C で決める）。

/** 動画の 1 フレームに進むゲーム内の秒（C-0048・C-0050。フルバーストの残り時間を 1 フレームずつ読んで 0.0170〜0.0171 秒） */
export const GAME_SECONDS_PER_FRAME = 0.017;

/** ゲーム内の 1 秒あたりのフレーム数（約 58.82。21-B） */
export const FRAMES_PER_GAME_SECOND = 1 / GAME_SECONDS_PER_FRAME;

/**
 * 長さ（持続・CT・フルバースト・戦闘の長さ）: ゲーム内の秒 → フレーム（切り捨て）。
 * 21-B: クラウンの S2 の 7 秒は、▲の付いた発の区間が 411f（056-04。7 ÷ 0.017 = 411.8 の切り捨て）。21-A までは切り上げだった
 */
export function gameSecondsToFrames(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError(`duration must be >= 0, got ${seconds}`);
  // 割り算の誤差で整数のすぐ下に出た値を切り捨てないよう、ごく小さな幅を足す
  return Math.floor(seconds / GAME_SECONDS_PER_FRAME + 1e-9);
}

/** 時刻（出来事の境目）: ゲーム内の秒 → フレーム（四捨五入） */
export function gameSecondsToFrame(seconds: number): number {
  return Math.round(seconds / GAME_SECONDS_PER_FRAME);
}

/** 出力: フレーム → ゲーム内の秒 */
export function framesToGameSeconds(frames: number): number {
  return frames * GAME_SECONDS_PER_FRAME;
}
