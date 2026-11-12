// キャラの画像（顔のアイコンと縦長の絵）のファイル名。scripts/fetch-images.ts が data/characters/images・portraits に置き、
// 画面（apps/web の CharacterVisual）が読む。コスチュームの番号は CDN の番号そのもの（0 が初期の絵。plan/design-costume-images.md）

/** コスチュームの番号の 2 桁の表記（CDN のファイル名と同じ） */
export function costumeCode(costume: number): string {
  return String(costume).padStart(2, '0');
}

/** キャラ resourceId のコスチューム costume の画像のファイル名（`{resourceId}_{2 桁}.webp`） */
export function characterImageFile(resourceId: number, costume = 0): string {
  return `${resourceId}_${costumeCode(costume)}.webp`;
}
