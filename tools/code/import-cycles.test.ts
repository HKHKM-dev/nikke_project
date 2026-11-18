// 循環する import を探す道具と、リポジトリに循環が無いことの確かめ（plan/design-import-cycle.md 3.4 節）
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
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

  it('reads a .tsx source', () => {
    const text = ["import { a } from './a.ts';", 'export const C = () => <div>{a}</div>;'].join('\n');
    expect(runtimeImportsOf('x.tsx', text)).toEqual(['./a.ts']);
  });
});

describe('readImportGraph', () => {
  const OPTIONS = { dirs: ['src'], packages: { '@x/lib': 'src/lib/index.ts' } };
  const withFiles = (files: Record<string, string>, run: (root: string) => void): void => {
    const root = mkdtempSync(join(tmpdir(), 'import-cycles-'));
    try {
      for (const [path, text] of Object.entries(files)) {
        mkdirSync(join(root, path, '..'), { recursive: true });
        writeFileSync(join(root, path), text);
      }
      run(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  };

  it('follows relative sources and package entries, and skips the other targets and folders', () => {
    withFiles(
      {
        'src/a.ts': [
          "import { b } from './b.tsx';",
          "import { lib } from '@x/lib';",
          "import data from './data.json';",
          "import { it } from 'vitest';",
        ].join('\n'),
        'src/b.tsx': "import type { A } from './a.ts';",
        'src/lib/index.ts': "export * from '../b.tsx';",
        'src/data.json': '{}',
        'src/types.d.ts': "import './a.ts';",
        'src/node_modules/dep/index.ts': "import '../../a.ts';",
        'src/.cache/c.ts': "import '../a.ts';",
      },
      (root) => {
        expect(readImportGraph(root, OPTIONS)).toEqual(
          graphOf({
            'src/a.ts': ['src/b.tsx', 'src/lib/index.ts'],
            'src/b.tsx': [],
            'src/lib/index.ts': ['src/b.tsx'],
          }),
        );
      },
    );
  });

  it('refuses a target it cannot follow', () => {
    withFiles({ 'src/a.ts': "import './missing.ts';" }, (root) => {
      expect(() => readImportGraph(root, OPTIONS)).toThrow(/src\/a\.ts: import の先 ".\/missing\.ts" が無い/);
    });
    withFiles({ 'src/a.ts': "import '@x/lib/inner.ts';" }, (root) => {
      expect(() => readImportGraph(root, OPTIONS)).toThrow(/辿れない/);
    });
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
});

describe('リポジトリの import', () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  let graph: Map<string, Set<string>>;
  beforeAll(() => {
    graph = readImportGraph(root, REPO_IMPORT_GRAPH);
  });

  it('reads the sources of every workspace and the tools', () => {
    for (const dir of ['packages/core/src', 'packages/core/scripts', 'apps/web/src', 'apps/web/scripts', 'tools/git']) {
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
