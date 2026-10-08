// Stage 21: モデルの時間の単位（plan/design-stage21.md 3.1 節）。
// モデルの 1 フレーム = 録画の動画の 1 フレーム。ゲーム内の秒（戦闘の長さ・スキルの持続・CT・フルバーストの長さ・
// 的の出来事）と、秒で出す値は、ここで換算する。武器の CDN の秒は weapons.ts の chargeSecondsToFrames（チャージ。Stage 23）・
// reloadSecondsToFrames（リロード。Stage 24）、rpm は weapons.ts の MAX_RPM（21-C）で、どれもこの時計で数える。

/** 動画の 1 フレームに進むゲーム内の秒（C-0260・C-0050。フルバーストの残り時間を 1 フレームずつ読んで 0.0170〜0.0171 秒） */
export const GAME_SECONDS_PER_FRAME = 0.017;

/** ゲーム内の 1 秒あたりのフレーム数（約 58.82。21-B） */
export const FRAMES_PER_GAME_SECOND = 1 / GAME_SECONDS_PER_FRAME;

/**
 * 長さ（持続・CT・フルバースト）: ゲーム内の秒 → フレーム（切り捨て）。戦闘の長さは battleSecondsToFrames。
 * 21-B: クラウンの S2 の 7 秒は、▲の付いた発の区間が 411f（056-04。7 ÷ 0.017 = 411.8 の切り捨て）。21-A までは切り上げだった
 */
export function gameSecondsToFrames(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError(`duration must be >= 0, got ${seconds}`);
  // 割り算の誤差で整数のすぐ下に出た値を切り捨てないよう、ごく小さな幅を足す
  return Math.floor(seconds / GAME_SECONDS_PER_FRAME + 1e-9);
}

/**
 * 戦闘の長さ: ゲーム内の秒 → 回すフレーム数（0 から数えて、ゲーム内の時刻が戦闘の長さより前のフレームを全部含む。切り上げ）。
 * V-0086: 180 秒の戦闘では、戦闘開始から 10,588f（179.996 秒）の発も総ダメージに入る（録画 074・102）。
 * 持続などの長さ（gameSecondsToFrames。切り捨て）とは別の規則
 */
export function battleSecondsToFrames(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError(`duration must be >= 0, got ${seconds}`);
  // 割り算の誤差で整数のすぐ上に出た値を切り上げないよう、ごく小さな幅を引く
  return Math.max(0, Math.ceil(seconds / GAME_SECONDS_PER_FRAME - 1e-9));
}

/**
 * ゲーム内の時刻 seconds に達した最初のフレーム（切り上げ）。周期のスキルの発動（C-0432）と持続ダメージの tick（C-0454）は、
 * 起点からの時刻がこの値に達したフレームで起きる（plan/design-timer-ceil.md）
 */
export function gameSecondsToFirstFrame(seconds: number): number {
  return Math.ceil(seconds / GAME_SECONDS_PER_FRAME - 1e-9);
}

/** 時刻（出来事の境目）: ゲーム内の秒 → フレーム（四捨五入） */
export function gameSecondsToFrame(seconds: number): number {
  return Math.round(seconds / GAME_SECONDS_PER_FRAME);
}

/**
 * 区間の終わりの時刻 → フレーム（四捨五入）。ただし、戦闘の最後のフレームより後に終わる区間（終わりが戦闘の長さの区間など）は、
 * 戦闘の終わり（frames）まで覆う（battleSecondsToFrames の最後のフレームを取りこぼさない。V-0086）
 */
export function endSecondsToFrame(seconds: number, frames: number): number {
  return seconds > (frames - 1) * GAME_SECONDS_PER_FRAME + 1e-9
    ? frames
    : Math.min(frames, gameSecondsToFrame(seconds));
}

/** 出力: フレーム → ゲーム内の秒 */
export function framesToGameSeconds(frames: number): number {
  return frames * GAME_SECONDS_PER_FRAME;
}
