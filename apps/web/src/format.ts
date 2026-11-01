const formatters = new Map<number, Intl.NumberFormat>();

export function formatNumber(value: number, maximumFractionDigits = 0): string {
  let f = formatters.get(maximumFractionDigits);
  if (!f) {
    f = new Intl.NumberFormat('ja-JP', { maximumFractionDigits });
    formatters.set(maximumFractionDigits, f);
  }
  return f.format(value);
}
