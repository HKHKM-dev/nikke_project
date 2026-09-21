// git diff を読みやすくするための JSON 整形。
// オブジェクトは複数行、プリミティブだけの配列（レベル曲線など）は 1 行にまとめる。

function isPrimitive(value: unknown): boolean {
  return value === null || (typeof value !== 'object' && typeof value !== 'function');
}

export function formatJson(value: unknown, indent = 0): string {
  const pad = '  '.repeat(indent);
  const padInner = '  '.repeat(indent + 1);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (value.every(isPrimitive)) return `[${value.map((v) => JSON.stringify(v) ?? 'null').join(', ')}]`;
    return `[\n${value.map((v) => padInner + formatJson(v, indent + 1)).join(',\n')}\n${pad}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return '{}';
    return `{\n${entries
      .map(([key, v]) => `${padInner}${JSON.stringify(key)}: ${formatJson(v, indent + 1)}`)
      .join(',\n')}\n${pad}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
