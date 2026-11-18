// 実行時に残る import のグラフから、循環する import の組を探す（plan/design-import-cycle.md 3.4 節）。
// このリポジトリは verbatimModuleSyntax なので、消えるのは `import type …`・`export type …` の文だけ。型の名前だけを並べた文
// （`import { type A } from …`）は中身が空の import として残り、読み込みが起きる。import()（動的な読み込み）は辺に数えない
// （関数の中から呼ぶ形は、モジュールの読み込みの時の順に効かない。モジュールの最上位で await する形は、ここでは見ない）。
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

/** ファイル → そのファイルが実行時に読み込むファイル */
export type ImportGraph = ReadonlyMap<string, ReadonlySet<string>>;

/** グラフを作る時の、リポジトリの決まり */
export type ImportGraphOptions = {
  /** 探すフォルダ（root からの相対パス。node_modules・dist・名前が . で始まるフォルダには入らない） */
  dirs: readonly string[];
  /** パッケージの名前 → 入口のファイル（root からの相対パス。各パッケージの package.json の exports と同じにする） */
  packages: Readonly<Record<string, string>>;
};

/** このリポジトリで循環を見る範囲（ワークスペースの全部と tools） */
export const REPO_IMPORT_GRAPH: ImportGraphOptions = {
  dirs: ['packages', 'apps', 'tools'],
  packages: { '@nikke/core': 'packages/core/src/index.ts' },
};

const SOURCE = /\.tsx?$/;

/** ソース 1 つの、実行時に残る import・再公開の先（書いてあるとおりの指定） */
export function runtimeImportsOf(fileName: string, text: string): string[] {
  const source = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    false,
    fileName.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const specifiers: string[] = [];
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue;
    const typeOnly = ts.isImportDeclaration(statement)
      ? statement.importClause?.phaseModifier === ts.SyntaxKind.TypeKeyword
      : statement.isTypeOnly;
    const specifier = statement.moduleSpecifier;
    if (typeOnly || specifier === undefined || !ts.isStringLiteral(specifier)) continue;
    specifiers.push(specifier.text);
  }
  return specifiers;
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
  const packageNames = Object.keys(options.packages);
  const graph = new Map<string, Set<string>>();
  for (const dir of options.dirs) {
    for (const file of sourceFilesUnder(join(root, dir))) {
      const targets = new Set<string>();
      for (const specifier of runtimeImportsOf(file, readFileSync(file, 'utf8'))) {
        // パッケージの中のパス（@nikke/core/…）は入口の表に無いので、黙って辺から落とさない
        if (packageNames.some((name) => specifier.startsWith(`${name}/`))) {
          throw new Error(`${key(file)}: import の先 "${specifier}" を辿れない（パッケージの入口だけを辿る）`);
        }
        const packageEntry = options.packages[specifier];
        const target =
          packageEntry !== undefined
            ? join(root, packageEntry)
            : specifier.startsWith('.')
              ? resolve(dirname(file), specifier.replace(/[?#].*$/, ''))
              : undefined;
        // 外のパッケージは辺にしない
        if (target === undefined) continue;
        // 拡張子の無い指定（'./foo'・フォルダ）は、どのファイルかを決めないので、黙って辺から落とさない
        if (extname(target) === '') {
          throw new Error(`${key(file)}: import の先 "${specifier}" を辿れない（拡張子まで書く）`);
        }
        // ソースでない先（JSON・画像）は辺にしない
        if (!SOURCE.test(target)) continue;
        if (!statSync(target, { throwIfNoEntry: false })?.isFile()) {
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
  // Tarjan の強連結成分。再帰の深さは、import の鎖の長さ（多くてもファイルの数）まで
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const cycles: string[][] = [];
  const visit = (node: string, targets: ReadonlySet<string>): void => {
    index.set(node, index.size);
    low.set(node, index.get(node)!);
    stack.push(node);
    onStack.add(node);
    for (const target of targets) {
      const next = graph.get(target);
      if (next === undefined) continue;
      if (!index.has(target)) {
        visit(target, next);
        low.set(node, Math.min(low.get(node)!, low.get(target)!));
      } else if (onStack.has(target)) low.set(node, Math.min(low.get(node)!, index.get(target)!));
    }
    if (low.get(node) !== index.get(node)) return;
    const component = stack.splice(stack.lastIndexOf(node));
    for (const member of component) onStack.delete(member);
    if (component.length > 1 || targets.has(node)) cycles.push(component.sort());
  };
  for (const [node, targets] of graph) if (!index.has(node)) visit(node, targets);
  return cycles.sort((a, b) => (a[0]! < b[0]! ? -1 : 1));
}
