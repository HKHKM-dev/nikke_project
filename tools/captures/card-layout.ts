// 画面下の顔のカードの置き場所（1920×1080）。HP のバー（recipes/hp-bars）と残弾の表示（ammo.ts）の読み取りが使う。
import type { Crop } from './ffmpeg.ts';

/**
 * カードの置き場所（左から 5 つ。水色のバーの左端と右端の x）。編成の人数によらず同じ所に出て、空きの置き場所には
 * カードが無い（4 人の録画 1090 は 1〜4 つ目、3 人の 1220 は 1〜3 つ目、2 人の 1235 は 3・4 つ目）
 */
export const CARD_SLOTS = [
  { left: 672, right: 759 },
  { left: 792, right: 879 },
  { left: 924, right: 1012 },
  { left: 1056, right: 1144 },
  { left: 1176, right: 1264 },
] as const;

/** 置き場所の残弾の表示を含む crop（x は水色のバーの左端 − 7、y 902、110×26） */
export function ammoCrop(slot: (typeof CARD_SLOTS)[number]): Crop {
  return { x: slot.left - 7, y: 902, w: 110, h: 26 };
}
