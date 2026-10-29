// 検証記録（V-NNNN）・結論（C-NNNN）・録画の番号の形。写しが散ると 1 つだけずれる（#731 の records-residual.ts の \d{4}）ので、
// 形を見る所はみなここを使う。ほかの文字と組み合わせる所（ファイル名・文の中など）は ID_DIGITS から正規表現を作る。
// import を持たない（skills/types.ts・scripts・tools のどこからでも読めるように）。

/** 検証記録・結論の番号の部分（4 桁以上の数字）。正規表現の文字列 */
export const ID_DIGITS = String.raw`\d{4,}`;

/** 検証記録の ID（V-NNNN） */
export const V_ID = new RegExp(`^V-${ID_DIGITS}$`);

/** 結論の ID（C-NNNN） */
export const C_ID = new RegExp(`^C-${ID_DIGITS}$`);

/** 文の中に検証記録の ID があるか（前後は見ない） */
export const V_ID_IN_TEXT = new RegExp(`V-${ID_DIGITS}`);

/**
 * 録画の番号（4 桁。0001〜9999。plan/design-recording-id-4digit.md 6 節）。台帳と、新しく付ける番号（intake・records:renumber）の形。
 * 古い文の 2〜3 桁の番号を読む所（renumber.ts の REC_ID など）はこれより広い
 */
export const RECORDING_ID = /^(?!0000)\d{4}$/;
