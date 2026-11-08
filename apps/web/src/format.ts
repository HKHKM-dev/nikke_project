const formatters = new Map<number, Intl.NumberFormat>();

export function formatNumber(value: number, maximumFractionDigits = 0): string {
  let f = formatters.get(maximumFractionDigits);
  if (!f) {
    f = new Intl.NumberFormat('ja-JP', { maximumFractionDigits });
    formatters.set(maximumFractionDigits, f);
  }
  return f.format(value);
}

const compactFormatter = new Intl.NumberFormat('ja-JP', { notation: 'compact', maximumFractionDigits: 2 });

/** ダメージの短い表記（「21.01億」「1179.06万」） */
export function formatCompact(value: number): string {
  return compactFormatter.format(value);
}

/**
 * 画面のダメージの値。値が無い（計算中で前の結果も無い・エラー・空）か、ちょうど 0 なら「—」。丸めて 0 になる値は「0」のまま出す
 */
export function formatDamage(value: number | null): string {
  return value === null || value === 0 ? '—' : formatCompact(value);
}
