// 循環する import を探す道具と、リポジトリに循環が無いことの確かめ（plan/design-import-cycle.md 3.4 節）
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findImportCycles, readImportGraph, REPO_IMPORT_GRAPH, runtimeImportsOf } from './import-cycles.ts';

const graphOf = (edges: Record<string, string[]>): Map<string, Set<string>> =>
  new Map(Object.entries(edges).map(([from, to]) => [from, new Set(to)]));

describe('runtimeImportsOf', () => {
  it('keeps the imports and re-exports that stay at run time', () => {
    const text = [
      "import './side.ts';",
      "import a from './default.ts';",
      "import * as ns from './namespace.ts';",
      "import { b, type B } from './mixed.ts';",
      "import { type C } from './inlineTypeOnly.ts';",
      "export { d } from './reexport.ts';",
      "export * from './star.ts';",
    ].join('\n');
    expect(runtimeImportsOf('x.ts', text)).toEqual([
      './side.ts',
      './default.ts',
      './namespace.ts',
      './mixed.ts',
      './inlineTypeOnly.ts',
      './reexport.ts',
      './star.ts',
    ]);
  });

  it('drops the statements erased at run time, and the dynamic imports', () => {
    const text = [
      "import type { A } from './typeImport.ts';",
      "import type B from './typeDefault.ts';",
      "export type { C } from './typeReexport.ts';",
      "export type * from './typeStar.ts';",
      'const d = 1;',
      'export { d };',
      "export const lazy = (): Promise<unknown> => import('./dynamic.ts');",
    ].join('\n');
    expect(runtimeImportsOf('x.ts', text)).toEqual([]);
  });

  it('reads a .tsx source, and lists a target once', () => {
    const text = ["import { a } from './a.ts';", "export { b } from './a.ts';", 'export const C = () => <div />;'].join(
      '\n',
    );
    expect(runtimeImportsOf('x.tsx', text)).toEqual(['./a.ts']);
  });
});

describe('findImportCycles', () => {
  it('finds nothing in a graph without cycles', () => {
    expect(findImportCycles(graphOf({ a: ['b', 'c'], b: ['c'], c: [] }))).toEqual([]);
  });

  it('finds every group of files that reach each other, sorted', () => {
    const graph = graphOf({
      entry: ['z', 'm'],
      z: ['y'],
      y: ['x'],
      x: ['z', 'leaf'],
      leaf: [],
      m: ['n'],
      n: ['m'],
    });
    expect(findImportCycles(graph)).toEqual([
      ['m', 'n'],
      ['x', 'y', 'z'],
    ]);
  });

  it('counts a file that imports itself, and ignores edges to files outside the graph', () => {
    expect(findImportCycles(graphOf({ self: ['self'], a: ['outside'] }))).toEqual([['self']]);
  });

  it('walks a long chain without recursion', () => {
    const edges: Record<string, string[]> = {};
    for (let i = 0; i < 20000; i += 1) edges[`f${i}`] = [`f${i + 1}`];
    edges.f20000 = [];
    expect(findImportCycles(graphOf(edges))).toEqual([]);
  });
});

describe('リポジトリの import', () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const graph = readImportGraph(root, REPO_IMPORT_GRAPH);

  it('reads the sources of every package', () => {
    for (const dir of REPO_IMPORT_GRAPH.dirs) {
      expect([...graph.keys()].some((file) => file.startsWith(`${dir}/`))).toBe(true);
    }
    // パッケージの名前の import は、その入口のファイルへの辺になる
    expect([...graph.values()].some((targets) => targets.has('packages/core/src/index.ts'))).toBe(true);
  });

  // 循環があると、読み込みの順で、モジュールの最上位が相手の値をまだ読めないことがある（node は落ち、vitest は undefined を読む）。
  // 落ちたら、出たファイルのどれかの import を外す（型だけを読むなら `import type` にする）
  it('has no import cycle that stays at run time', () => {
    expect(findImportCycles(graph)).toEqual([]);
  });
});
