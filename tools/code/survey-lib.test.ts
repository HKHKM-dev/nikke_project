// コードの作り替えの候補を測る道具の、ファイルと git を読まない部分（plan/design-workflow-simplification-17.md 10 節）
import { describe, expect, it } from 'vitest';
import {
  coChangePairs,
  findDuplicates,
  functionLengths,
  parseNameOnlyLog,
  readModule,
  unusedExports,
  type ModuleInfo,
} from './survey-lib.ts';
import { parseSource } from './import-cycles.ts';

const lines = (...rows: string[]): string => rows.join('\n');

describe('functionLengths', () => {
  it('names each function with a body by its declaration, owner or callee', () => {
    const text = lines(
      'export function top(a: number): number {', // 1
      '  const inner = (b: number) => {', // 2
      '    return b;', // 3
      '  };', // 4
      '  return inner(a);', // 5
      '}', // 6
      'class Box {', // 7
      '  constructor() {}', // 8
      '  get size() { return 1; }', // 9
      '}', // 10
      'declare function bodiless(): void;', // 11
      '[1].map(function (x) {', // 12
      '  return x;', // 13
      '});', // 14
    );
    const found = functionLengths('a.ts', parseSource('a.ts', text));
    expect(found.map((f) => [f.name, f.line, f.lines, f.own])).toEqual([
      ['top', 1, 6, 3],
      ['inner', 2, 3, 3],
      ['Box.constructor', 8, 1, 1],
      ['Box.size', 9, 1, 1],
      ['[1].map(…) の引数', 12, 3, 3],
    ]);
  });

  it('skips the functions passed to describe and it, but not the helpers inside them', () => {
    const text = lines(
      "describe('x', () => {",
      '  const helper = () => 1;',
      "  it('y', () => {",
      '    expect(helper()).toBe(1);',
      '  });',
      "  it.each([1])('z', (n) => {});",
      '});',
    );
    expect(functionLengths('a.test.ts', parseSource('a.test.ts', text)).map((f) => f.name)).toEqual(['helper']);
  });
});

describe('findDuplicates', () => {
  const block = (name: string, value: string): string =>
    lines(
      `export function ${name}(input: number[]): number {`,
      '  let total = 0;',
      `  for (const v of input) total += v * ${value};`,
      '  if (total > 10) {',
      '    total = 10;',
      '  }',
      '  return total;',
      '}',
    );
  const sourcesOf = (files: Record<string, string>) =>
    Object.entries(files).map(([file, text]) => ({ file, source: parseSource(file, text) }));

  it('groups statements of the same shape whatever their names and values', () => {
    const groups = findDuplicates(
      sourcesOf({ 'a.ts': block('sumA', '2'), 'b.ts': lines('// 前置き', '', block('sumB', "'x'")) }),
      5,
    );
    expect(groups).toEqual([
      {
        lines: 8,
        occurrences: [
          { file: 'a.ts', start: 1, end: 8 },
          { file: 'b.ts', start: 3, end: 10 },
        ],
      },
    ]);
  });

  it('extends a run as far as it stays the same, and drops the smaller groups inside it', () => {
    const body = (op: string) =>
      lines('  const a = f(1);', '  const b = g(a);', `  const c = a ${op} b;`, '  log(c);', '  return c;');
    const groups = findDuplicates(
      sourcesOf({
        'a.ts': lines('function x() {', body('+'), '}'),
        'b.ts': lines('function y() {', body('+'), '  extra();', '}'),
        'c.ts': lines('function z() {', body('-'), '}'),
      }),
      2,
    );
    // a と b は本体の全部（5 行）が同じ。c は演算子が違うので、前の 2 文と後の 2 文だけが同じ
    expect(groups.map((g) => g.occurrences.map((o) => `${o.file}:${o.start}-${o.end}`))).toEqual([
      ['a.ts:2-6', 'b.ts:2-6'],
      ['a.ts:2-3', 'b.ts:2-3', 'c.ts:2-3'],
      ['a.ts:5-6', 'b.ts:5-6', 'c.ts:5-6'],
    ]);
  });

  it('ignores runs shorter than minLines, overlapping repeats, imports and test bodies', () => {
    const repeated = lines('a();', 'b(1);', 'a();', 'b(1);', 'a();', 'b(1);');
    // 1〜4 行と 3〜6 行も同じ形だが、重なるので数えない
    expect(findDuplicates(sourcesOf({ 'r.ts': repeated }), 2).map((g) => g.occurrences)).toEqual([
      [
        { file: 'r.ts', start: 1, end: 2 },
        { file: 'r.ts', start: 3, end: 4 },
        { file: 'r.ts', start: 5, end: 6 },
      ],
    ]);
    const imports = lines("import { a } from './a.ts';", "import { b } from './b.ts';");
    expect(findDuplicates(sourcesOf({ 'x.ts': imports, 'y.ts': imports }), 1)).toEqual([]);
    const test = lines("it('t', () => {", '  const v = f();', '  expect(v).toBe(1);', '});');
    expect(findDuplicates(sourcesOf({ 'x.test.ts': test, 'y.test.ts': test }), 1)).toEqual([]);
    expect(findDuplicates(sourcesOf({ 'x.ts': 'f();\ng();', 'y.ts': 'f();\ng();' }), 3)).toEqual([]);
  });
});

describe('readModule', () => {
  const read = (text: string, file = 'm.ts'): ModuleInfo =>
    readModule(parseSource(file, text), (specifier) => (specifier.startsWith('.') ? specifier.slice(2) : undefined));

  it('reads the declared exports, re-exports and imports', () => {
    const info = read(
      lines(
        "import def, { a, b as bee, type T } from './x.ts';",
        "import * as ns from './ns.ts';",
        "import type { Only } from './types.ts';",
        "import './side.ts';",
        "import { ext } from 'vitest';",
        "export { r, s as t } from './re.ts';",
        "export * from './star.ts';",
        "export * as all from './all.ts';",
        'export const one = 1, { two, three: [four] } = obj;',
        'export function f() {}',
        'export default class C {}',
        'export type U = typeof import("./lazy.ts").Lazy.Inner;',
        'const local = 1;',
        'export { local as renamed };',
        "export const load = () => import('./dyn.ts');",
      ),
    );
    expect(info.exports.map((e) => [e.name, e.local])).toEqual([
      ['one', 'one'],
      ['two', 'two'],
      ['four', 'four'],
      ['f', 'f'],
      ['default', 'C'],
      ['U', 'U'],
      ['renamed', 'local'],
      ['load', 'load'],
    ]);
    expect(info.reexports).toEqual([
      { name: 'r', target: 're.ts', imported: 'r' },
      { name: 't', target: 're.ts', imported: 's' },
      { name: 'all', target: 'all.ts', imported: '*' },
    ]);
    expect(info.stars).toEqual(['star.ts']);
    expect(info.uses).toEqual([
      { target: 'x.ts', names: ['default', 'a', 'b', 'T'] },
      { target: 'ns.ts', names: '*' },
      { target: 'types.ts', names: ['Only'] },
      { target: 'side.ts', names: [] },
      { target: 'lazy.ts', names: ['Lazy'] },
      { target: 'dyn.ts', names: '*' },
    ]);
    // 型だけの文（import type）は実行時に残らない
    expect(info.runtime).toEqual(['x.ts', 'ns.ts', 'side.ts', 're.ts', 'star.ts', 'all.ts']);
  });

  it('counts the identifiers outside property names and export lists', () => {
    const info = read(lines('const a = 1;', 'const o = { a: a };', 'o.a;', 'export { a };'));
    expect(info.identifiers.get('a')).toBe(2);
  });
});

describe('unusedExports', () => {
  const module = (partial: Partial<ModuleInfo>): ModuleInfo => ({
    exports: [],
    reexports: [],
    stars: [],
    uses: [],
    runtime: [],
    identifiers: new Map(),
    ...partial,
  });
  const exportsOf = (...names: string[]) => names.map((name, i) => ({ name, line: i + 1, local: name }));

  it('follows imports through re-exports and stars, and tells the exports read only by tests', () => {
    const modules = new Map<string, ModuleInfo>([
      ['main.ts', module({ uses: [{ target: 'index.ts', names: ['viaStar', 'renamed'] }] })],
      [
        'index.ts',
        module({ stars: ['lib.ts'], reexports: [{ name: 'renamed', target: 'other.ts', imported: 'orig' }] }),
      ],
      [
        'lib.ts',
        module({
          exports: exportsOf('viaStar', 'dead', 'selfUsed', 'tested'),
          identifiers: new Map([['selfUsed', 2]]),
        }),
      ],
      ['other.ts', module({ exports: exportsOf('orig', 'unread') })],
      ['lib.test.ts', module({ exports: exportsOf('helper'), uses: [{ target: 'lib.ts', names: ['tested'] }] })],
      ['script.ts', module({ exports: exportsOf('cli') })],
    ]);
    expect(unusedExports(modules).map((u) => [u.file, u.name, u.usedBy, u.usedInFile])).toEqual([
      ['lib.ts', 'dead', 'none', false],
      ['other.ts', 'unread', 'none', false],
      ['lib.ts', 'selfUsed', 'none', true],
      ['lib.ts', 'tested', 'tests', false],
    ]);
  });

  it('counts a namespace or dynamic import as reading every export, through stars too', () => {
    const modules = new Map<string, ModuleInfo>([
      ['main.ts', module({ uses: [{ target: 'barrel.ts', names: '*' }] })],
      ['barrel.ts', module({ stars: ['a.ts'], exports: exportsOf('own') })],
      ['a.ts', module({ exports: exportsOf('x', 'y') })],
    ]);
    expect(unusedExports(modules)).toEqual([]);
  });
});

describe('co-changes', () => {
  it('parses the name-only log', () => {
    expect(parseNameOnlyLog('\x01\n\na.ts\nb.ts\n\x01\n\nc.ts\n')).toEqual([['a.ts', 'b.ts'], ['c.ts']]);
  });

  it('counts pairs changed together at least twice, skipping linked files and large commits', () => {
    const commits = [
      ['a', 'b', 'c'],
      ['a', 'b'],
      ['a', 'c'],
      ['c', 'a'],
      ['d', 'e'],
      ['e', 'd'],
      ['d', 'e'],
      ['d', 'e', 'x', 'y', 'z'],
    ];
    // c は a を読む（a と c は 3 回一緒に変わったが出さない）。b と c は 1 回だけ。5 ファイルの commit は数えない
    const linked = (from: string, to: string) => from === 'c' && to === 'a';
    expect(coChangePairs(commits, linked, 4)).toEqual([
      { a: 'd', b: 'e', together: 3, commitsA: 3, commitsB: 3 },
      { a: 'a', b: 'b', together: 2, commitsA: 4, commitsB: 2 },
    ]);
  });
});
