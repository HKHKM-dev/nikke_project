// キャラの画像（顔のアイコンと縦長の絵）のファイル名。scripts/fetch-images.ts が data/characters/images・portraits に置き、
// 画面（apps/web の CharacterVisual）が読む。コスチュームの番号は CDN の番号そのもの（0 が初期の絵。plan/design-costume-images.md）

/** キャラ resourceId のコスチューム costume の画像のファイル名（`{resourceId}_{番号 2 桁}.webp`） */
export function characterImageFile(resourceId: number, costume = 0): string {
  return `${resourceId}_${String(costume).padStart(2, '0')}.webp`;
}
