/** ErrorBoundary の resetKeys が変わっていないか（長さと、要素ごとの Object.is） */
export function sameKeys(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
}
