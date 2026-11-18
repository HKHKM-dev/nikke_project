// 実行時に残る import のグラフから、循環する import の組を探す（plan/design-import-cycle.md 3.4 節）。
// このリポジトリは verbatimModuleSyntax なので、消えるのは `import type …`・`export type …` の文だけ。型の名前だけを並べた文
// （`import { type A } from …`）は中身が空の import として残り、読み込みが起きる。import()（動的な読み込み）は、モジュールの
// 読み込みの時の順に効かないので辺に数えない。
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

/** ファイル → そのファイルが実行時に読み込むファイル */
export type ImportGraph = ReadonlyMap<string, ReadonlySet<string>>;

/** グラフを作る時の、リポジトリの決まり */
export type ImportGraphOptions = {
  /** 探すフォルダ（root からの相対パス） */
  dirs: readonly string[];
  /** パッケージの名前 → 入口のファイル（root からの相対パス） */
  packages?: Readonly<Record<string, string>>;
};

/** このリポジトリで循環を見る範囲 */
export const REPO_IMPORT_GRAPH: ImportGraphOptions = {
  dirs: ['packages/core/src', 'packages/core/scripts', 'apps/web/src', 'apps/web/scripts', 'tools'],
  packages: { '@nikke/core': 'packages/core/src/index.ts' },
};

const SOURCE = /\.tsx?$/;

/** ソース 1 つの、実行時に残る import・再公開の先（書いてあるとおりの指定。同じ先は 1 回） */
export function runtimeImportsOf(fileName: string, text: string): string[] {
  const source = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    false,
    fileName.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const specifiers = new Set<string>();
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement)) {
      if (statement.importClause?.isTypeOnly) continue;
    } else if (ts.isExportDeclaration(statement)) {
      if (statement.isTypeOnly || statement.moduleSpecifier === undefined) continue;
    } else continue;
    if (ts.isStringLiteral(statement.moduleSpecifier!)) specifiers.add(statement.moduleSpecifier.text);
  }
  return [...specifiers];
}

function sourceFilesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFilesUnder(path));
    else if (SOURCE.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(path);
  }
  return out;
}

/** root の下の dirs のソース（.ts・.tsx）の、実行時に残る import のグラフ。キーと値は root からの相対パス（区切りは /） */
export function readImportGraph(root: string, options: ImportGraphOptions): Map<string, Set<string>> {
  const key = (path: string): string => relative(root, path).split(sep).join('/');
  const graph = new Map<string, Set<string>>();
  for (const dir of options.dirs) {
    for (const file of sourceFilesUnder(join(root, dir))) {
      const targets = new Set<string>();
      for (const specifier of runtimeImportsOf(file, readFileSync(file, 'utf8'))) {
        const packageEntry = options.packages?.[specifier];
        const target =
          packageEntry !== undefined
            ? join(root, packageEntry)
            : specifier.startsWith('.')
              ? resolve(dirname(file), specifier)
              : undefined;
        // ソースでない先（JSON・画像・外のパッケージ）は辺にしない
        if (target === undefined || !SOURCE.test(target)) continue;
        if (!existsSync(target) || !statSync(target).isFile()) {
          throw new Error(`${key(file)}: import の先 "${specifier}" が無い`);
        }
        targets.add(key(target));
      }
      graph.set(key(file), targets);
    }
  }
  return graph;
}

/**
 * 循環する import の組（互いに辿り着けるファイルの集まりで、2 つ以上のものと、自分を読み込む 1 つ）。組の中と組どうしは名前の順。
 * グラフに無いファイルへの辺は見ない
 */
export function findImportCycles(graph: ImportGraph): string[][] {
  // Tarjan の強連結成分。深い import の鎖でスタックが溢れないように、再帰でなく手持ちのスタックで辿る
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const cycles: string[][] = [];
  let next = 0;
  for (const start of graph.keys()) {
    if (index.has(start)) continue;
    const work: { node: string; targets: string[]; at: number }[] = [];
    const enter = (node: string): void => {
      index.set(node, next);
      low.set(node, next);
      next += 1;
      stack.push(node);
      onStack.add(node);
      work.push({ node, targets: [...(graph.get(node) ?? [])].filter((target) => graph.has(target)), at: 0 });
    };
    enter(start);
    while (work.length > 0) {
      const frame = work.at(-1)!;
      const target = frame.targets[frame.at];
      if (target !== undefined) {
        frame.at += 1;
        if (!index.has(target)) enter(target);
        else if (onStack.has(target)) low.set(frame.node, Math.min(low.get(frame.node)!, index.get(target)!));
        continue;
      }
      work.pop();
      const parent = work.at(-1);
      if (parent !== undefined) low.set(parent.node, Math.min(low.get(parent.node)!, low.get(frame.node)!));
      if (low.get(frame.node) !== index.get(frame.node)) continue;
      const component: string[] = [];
      for (;;) {
        const member = stack.pop()!;
        onStack.delete(member);
        component.push(member);
        if (member === frame.node) break;
      }
      if (component.length > 1 || graph.get(frame.node)?.has(frame.node)) cycles.push(component.sort());
    }
  }
  return cycles.sort((a, b) => (a[0]! < b[0]! ? -1 : a[0]! > b[0]! ? 1 : 0));
}
