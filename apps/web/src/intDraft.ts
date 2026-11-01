import { clampInt } from './team.ts';

// 整数の入力欄の打ちかけの文字列（components/IntInput.tsx）。欄を空にして打ち直す途中の値を、丸めて state に入れない
// （丸めた値を欄に書き戻すと、空欄が最小値になり、続けて打った数字がその後ろに付く）

/** 打ちかけの文字列が min..max の整数なら、その数。空欄・小数・範囲外は null（まだ反映しない） */
export function parseIntDraft(raw: string, min: number, max: number): number | null {
  if (raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

/**
 * フォーカスが外れたときに確定する値。min..max の整数ならそのまま、数の範囲外・小数は min..max に丸める。
 * 空欄や数でないものは、いまの値 current に戻す
 */
export function settleIntDraft(raw: string, current: number, min: number, max: number): number {
  const n = Number(raw);
  if (raw.trim() === '' || !Number.isFinite(n)) return current;
  return clampInt(n, min, max);
}
