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

/** ダメージの短い表記（「21.01億」「1179.06万」）。全部の桁は formatNumber で title に出す */
export function formatCompact(value: number): string {
  return compactFormatter.format(value);
}
