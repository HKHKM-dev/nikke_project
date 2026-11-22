// コードの作り替えの候補を測る道具（npm run code:survey。tools/code/survey.ts）の、ファイルと git を読まない部分
// （plan/design-workflow-simplification-17.md 10 節）。構文木は TypeScript の構文解析だけで読む（型は見ない）。
import ts from 'typescript';
import { runtimeSpecifierOf } from './import-cycles.ts';

/** key の並びに value を足す（無ければ作る） */
function pushTo<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list === undefined) map.set(key, [value]);
  else list.push(value);
}

/** テストのファイル（.test.ts・.test.tsx と、__tests__ の下の補助） */
const isTestFile = (file: string): boolean => /\.test\.tsx?$/.test(file) || file.includes('/__tests__/');

const lineAt = (source: ts.SourceFile, pos: number): number => source.getLineAndCharacterOfPosition(pos).line + 1;
const startLine = (node: ts.Node, source: ts.SourceFile): number => lineAt(source, node.getStart(source));
const endLine = (node: ts.Node, source: ts.SourceFile): number => lineAt(source, node.getEnd());

/** vitest の枠（describe・it など）の呼び出しなら、その名前（`it.each(…)(…)`・`describe.skip(…)` も） */
const TEST_FRAMES = new Set(['describe', 'it', 'test', 'bench', 'beforeAll', 'beforeEach', 'afterAll', 'afterEach']);
function testFrameOf(call: ts.CallExpression): string | undefined {
  let callee: ts.Expression = call.expression;
  while (ts.isCallExpression(callee) || ts.isPropertyAccessExpression(callee)) callee = callee.expression;
  return ts.isIdentifier(callee) && TEST_FRAMES.has(callee.text) ? callee.text : undefined;
}

/** vitest の枠に渡す関数（テストの本体・describe の中身） */
function testCallbackFrame(fn: ts.Node): string | undefined {
  const call = fn.parent;
  return ts.isCallExpression(call) && call.arguments.some((arg) => arg === fn) ? testFrameOf(call) : undefined;
}

// ---- 長い関数 ----

/** lines は宣言の始めから終わりまで、own はそこから中に置いた関数の行（始めと終わりの行は外と分け合うので除かない）を除いた行数 */
export type FunctionLength = { file: string; name: string; line: number; lines: number; own: number };

const oneLine = (text: string, max: number): string => {
  const flat = text.replace(/\s+/g, ' ');
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

/** 関数の呼び名（宣言の名前・代入先・メソッドならクラスの名前を前に付ける・呼び出しに渡すなら「<呼ぶ先>(…) の引数」） */
/** クラスの中の宣言なら「<クラスの名前>.」 */
const classPrefix = (node: ts.Node): string =>
  ts.isClassLike(node.parent) ? `${node.parent.name?.text ?? '(無名のクラス)'}.` : '';

function functionName(fn: ts.FunctionLikeDeclaration, source: ts.SourceFile): string {
  const owner = classPrefix(fn);
  if (ts.isConstructorDeclaration(fn)) return `${owner}constructor`;
  if (fn.name !== undefined) return `${owner}${fn.name.getText(source)}`;
  let parent = fn.parent;
  if (ts.isParenthesizedExpression(parent) || ts.isAsExpression(parent) || ts.isSatisfiesExpression(parent)) {
    parent = parent.parent;
  }
  if (ts.isJsxExpression(parent) && ts.isJsxAttribute(parent.parent)) return parent.parent.name.getText(source);
  if (
    ts.isVariableDeclaration(parent) ||
    ts.isPropertyAssignment(parent) ||
    ts.isPropertyDeclaration(parent) ||
    ts.isBinaryExpression(parent)
  ) {
    const target = ts.isBinaryExpression(parent) ? parent.left : parent.name;
    return oneLine(target.getText(source), 40);
  }
  if (ts.isExportAssignment(parent)) return 'default';
  if (ts.isCallExpression(parent) || ts.isNewExpression(parent)) {
    return `${oneLine(parent.expression.getText(source), 40)}(…) の引数`;
  }
  return '(無名)';
}

/**
 * 本体のある関数の行数（宣言の始めから終わりまでと、そこから中に置いた関数の行を除いたもの）。vitest の枠に渡す関数は数えない
 * （その中の関数は、外の関数に含めない）
 */
export function functionLengths(file: string, source: ts.SourceFile): FunctionLength[] {
  const out: FunctionLength[] = [];
  /** outer は外の関数の数えている所（covered は、中の関数だけが使う行） */
  type Frame = { fn: FunctionLength; covered: Set<number> };
  const visit = (node: ts.Node, outer: Frame | undefined): void => {
    if (ts.isFunctionLike(node) && 'body' in node && node.body !== undefined && testCallbackFrame(node) === undefined) {
      const line = startLine(node, source);
      const end = endLine(node, source);
      const frame: Frame = {
        fn: { file, name: functionName(node, source), line, lines: end - line + 1, own: 0 },
        covered: new Set(),
      };
      out.push(frame.fn);
      if (outer !== undefined) for (let l = line + 1; l < end; l++) outer.covered.add(l);
      ts.forEachChild(node, (child) => visit(child, frame));
      frame.fn.own = frame.fn.lines - frame.covered.size;
      return;
    }
    ts.forEachChild(node, (child) => visit(child, outer));
  };
  visit(source, undefined);
  return out;
}

// ---- 分岐の多さ ----

/** 関数の循環的複雑度（数え方は functionComplexities） */
export type FunctionComplexity = { file: string; name: string; line: number; complexity: number };

const LOGICAL_OPERATORS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
  ts.SyntaxKind.AmpersandAmpersandEqualsToken,
  ts.SyntaxKind.BarBarEqualsToken,
  ts.SyntaxKind.QuestionQuestionEqualsToken,
]);

/** 分割代入の式の左辺（`[a, b] = …`・`({ a } = …)`・`for ([a] of …)`）の中の節か */
function inAssignmentTarget(node: ts.Node): boolean {
  let child = node;
  let parent = node.parent;
  while (
    ts.isArrayLiteralExpression(parent) ||
    ts.isObjectLiteralExpression(parent) ||
    ts.isPropertyAssignment(parent) ||
    ts.isSpreadElement(parent) ||
    ts.isSpreadAssignment(parent) ||
    ts.isParenthesizedExpression(parent)
  ) {
    child = parent;
    parent = parent.parent;
  }
  if (child === node) return false;
  if (ts.isBinaryExpression(parent))
    return parent.operatorToken.kind === ts.SyntaxKind.EqualsToken && parent.left === child;
  return (ts.isForOfStatement(parent) || ts.isForInStatement(parent)) && parent.initializer === child;
}

/** その節が、いまの関数の複雑度に足す分岐か（ESLint の complexity の classic と同じ決まり） */
function isBranch(node: ts.Node): boolean {
  switch (node.kind) {
    case ts.SyntaxKind.IfStatement:
    case ts.SyntaxKind.ConditionalExpression:
    case ts.SyntaxKind.ForStatement:
    case ts.SyntaxKind.ForInStatement:
    case ts.SyntaxKind.ForOfStatement:
    case ts.SyntaxKind.WhileStatement:
    case ts.SyntaxKind.DoStatement:
    case ts.SyntaxKind.CatchClause:
    case ts.SyntaxKind.CaseClause:
      return true;
  }
  if (ts.isBinaryExpression(node)) {
    if (LOGICAL_OPERATORS.has(node.operatorToken.kind)) return true;
    // 分割代入の式の既定値（`[a = 1] = …`）
    return node.operatorToken.kind === ts.SyntaxKind.EqualsToken && inAssignmentTarget(node);
  }
  // 既定値（引数・分割の宣言・`({ a = 1 } = …)`）
  if (ts.isParameter(node) || ts.isBindingElement(node)) return node.initializer !== undefined;
  if (ts.isShorthandPropertyAssignment(node)) return node.objectAssignmentInitializer !== undefined;
  // ?. の 1 つずつ（`a?.b?.()` は 2）
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node) || ts.isCallExpression(node)) {
    return node.questionDotToken !== undefined;
  }
  return false;
}

/**
 * 本体のある関数ごとの循環的複雑度。ESLint の complexity ルール（variant は classic）と同じ数え方で、1 から始め、
 * if・?:・&&・||・??・&&=・||=・??=・for・for…in・for…of・while・do…while・catch・default でない case・既定値・?. の
 * 1 つずつに 1 を足す。中に置いた関数の分岐は、その関数にだけ数える。クラスのフィールドの初期化子と static ブロックも
 * 1 つの関数として数える（中に置いた関数のうち、ここに出すのは本体のある関数・初期化子・static ブロック）。functionLengths と
 * 同じく、vitest の枠に渡す関数は出さない（その中の分岐は、どの関数にも数えない）
 */
export function functionComplexities(file: string, source: ts.SourceFile): FunctionComplexity[] {
  const out: FunctionComplexity[] = [];
  /** current は数えている関数（undefined はファイルの直下か、vitest の枠に渡す関数の中） */
  const visit = (node: ts.Node, current: FunctionComplexity | undefined): void => {
    let frame = current;
    let own: FunctionComplexity | undefined;
    if (ts.isFunctionLike(node) && 'body' in node && node.body !== undefined) {
      const name = testCallbackFrame(node) === undefined ? functionName(node, source) : undefined;
      own = name === undefined ? undefined : { file, name, line: startLine(node, source), complexity: 1 };
      frame = own;
    } else if (ts.isClassStaticBlockDeclaration(node)) {
      own = { file, name: `${classPrefix(node)}static ブロック`, line: startLine(node, source), complexity: 1 };
      frame = own;
    } else if (frame !== undefined && isBranch(node)) {
      frame.complexity++;
    }
    if (own !== undefined) out.push(own);
    // クラスのフィールドの初期化子は、外の関数と分けて数える
    if (ts.isPropertyDeclaration(node) && node.initializer !== undefined) {
      ts.forEachChild(node, (child) => {
        if (child !== node.initializer) visit(child, frame);
      });
      const field: FunctionComplexity = {
        file,
        name: `${classPrefix(node)}${node.name.getText(source)} の初期化子`,
        line: startLine(node, source),
        complexity: 1,
      };
      out.push(field);
      visit(node.initializer, field);
      return;
    }
    ts.forEachChild(node, (child) => visit(child, frame));
  };
  visit(source, undefined);
  return out;
}

// ---- 同じ形の文の並び ----

/** 重なりの 1 か所（行は 1 から。end を含む） */
export type Occurrence = { file: string; start: number; end: number };
/** 同じ形の文の並びの組。lines はいちばん短い所の行数 */
export type DuplicateGroup = { lines: number; occurrences: Occurrence[] };

/**
 * 構文木の形の番号。名前と値（識別子・リテラル）は区別せず、節の種類と子の並び（演算子・const と let を含む）で決める。
 * 同じ表で番号を振ったものどうしは、形が同じなら番号が同じ
 */
class ShapeTable {
  private readonly ids = new Map<string, number>();
  private readonly memo = new Map<ts.Node, number>();

  of(node: ts.Node): number {
    const known = this.memo.get(node);
    if (known !== undefined) return known;
    const children: number[] = [];
    ts.forEachChild(node, (child) => {
      children.push(this.of(child));
    });
    let extra = '';
    if (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) extra = `:${node.operator}`;
    else if (ts.isVariableDeclarationList(node)) extra = `:${node.flags & ts.NodeFlags.BlockScoped}`;
    // 値は種類（数・文字列・正規表現）も区別しない
    const kind = ts.isLiteralExpression(node) ? 'L' : node.kind;
    const key = `${kind}${extra}(${children.join(',')})`;
    let id = this.ids.get(key);
    if (id === undefined) {
      id = this.ids.size;
      this.ids.set(key, id);
    }
    this.memo.set(node, id);
    return id;
  }
}

/** 区切りの文（並びに入れない）: import・再公開・型の宣言・vitest の枠の呼び出し */
function isBarrier(statement: ts.Statement): boolean {
  return (
    ts.isImportDeclaration(statement) ||
    ts.isImportEqualsDeclaration(statement) ||
    (ts.isExportDeclaration(statement) && statement.moduleSpecifier !== undefined) ||
    ts.isInterfaceDeclaration(statement) ||
    ts.isTypeAliasDeclaration(statement) ||
    (ts.isExpressionStatement(statement) &&
      ts.isCallExpression(statement.expression) &&
      testFrameOf(statement.expression) !== undefined)
  );
}

/** 区切りの文の間の、続いた文の並び */
type Run = { file: string; ids: number[]; starts: number[]; ends: number[] };

function runsOf(file: string, source: ts.SourceFile, shapes: ShapeTable): Run[] {
  const runs: Run[] = [];
  const addList = (statements: readonly ts.Statement[]): void => {
    let run: Run = { file, ids: [], starts: [], ends: [] };
    for (const statement of [...statements, undefined]) {
      if (statement === undefined || isBarrier(statement)) {
        if (run.ids.length > 0) runs.push(run);
        run = { file, ids: [], starts: [], ends: [] };
        continue;
      }
      run.ids.push(shapes.of(statement));
      run.starts.push(startLine(statement, source));
      run.ends.push(endLine(statement, source));
    }
  };
  const visit = (node: ts.Node): void => {
    // テストの本体（it・test などに渡す関数の中）は見ない。describe の中身（補助関数の置き場所）は見る
    const frame = ts.isFunctionLike(node) ? testCallbackFrame(node) : undefined;
    if (frame !== undefined && frame !== 'describe') return;
    if (ts.isSourceFile(node) || ts.isBlock(node) || ts.isModuleBlock(node) || ts.isCaseOrDefaultClause(node)) {
      addList(node.statements);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return runs;
}

/** 並びの中の 1 か所（run の i 番目の文から j 番目の文まで） */
type Span = { run: Run; i: number; j: number };

const spanLines = (s: Span): number => s.run.ends[s.j]! - s.run.starts[s.i]! + 1;

/** 同じ並びの中で重なる所を除く（前から順に、残したものと重ならないものだけ残す） */
function withoutOverlaps(spans: readonly Span[]): Span[] {
  const kept: Span[] = [];
  for (const s of [...spans].sort((a, b) => a.i - b.i)) {
    if (!kept.some((k) => k.run === s.run && k.j >= s.i)) kept.push(s);
  }
  return kept;
}

/**
 * 同じ形の文の並び（区切りの文を挟まず続いた文。関数の本体・ブロック・ファイルの最上位）が 2 か所以上にある組（minLines 行に
 * 満たない所は数えない）。
 * 組は、それ以上前にも後ろにも延ばせない並びで、ほかの組の所に全部含まれるもの（大きな重なりの中の小さな重なり）は除く。
 * 重なった行の多い順（行数 ×（所の数 − 1））
 */
export function findDuplicates(
  sources: readonly { file: string; source: ts.SourceFile }[],
  minLines: number,
): DuplicateGroup[] {
  const shapes = new ShapeTable();
  const runs = sources.flatMap(({ file, source }) => runsOf(file, source, shapes));
  // 文ごとに始まる所を、最初の文の形で分け、後ろへ同じ形が続く限り延ばす（分かれたら、その先の形ごとに分けて続ける）
  const byFirst = new Map<number, Span[]>();
  for (const run of runs) run.ids.forEach((id, i) => pushTo(byFirst, id, { run, i, j: i }));
  const found: Occurrence[][] = [];
  const grow = (spans: Span[]): void => {
    for (;;) {
      const next = spans[0]!.run.ids[spans[0]!.j + 1];
      if (next === undefined || spans.some((s) => s.run.ids[s.j + 1] !== next)) break;
      for (const s of spans) s.j++;
    }
    const kept = withoutOverlaps(spans.filter((s) => spanLines(s) >= minLines));
    if (kept.length >= 2) {
      found.push(kept.map((s) => ({ file: s.run.file, start: s.run.starts[s.i]!, end: s.run.ends[s.j]! })));
    }
    const branches = new Map<number, Span[]>();
    for (const s of spans) {
      const id = s.run.ids[s.j + 1];
      if (id !== undefined) pushTo(branches, id, { run: s.run, i: s.i, j: s.j + 1 });
    }
    for (const branch of branches.values()) if (branch.length >= 2) grow(branch);
  };
  for (const spans of byFirst.values()) if (spans.length >= 2) grow(spans);
  return dropContained(found);
}

/** 所の書き方（<ファイル>:<始め>-<終わり>） */
export const occurrenceKey = (o: Occurrence): string => `${o.file}:${o.start}-${o.end}`;

/** 同じ所の組を 1 つにし、所が全部ほかの組の所に含まれる組を除いて、重なった行の多い順に並べる */
function dropContained(found: readonly Occurrence[][]): DuplicateGroup[] {
  const unique = new Map<string, Occurrence[]>();
  for (const occurrences of found) {
    const sorted = [...occurrences].sort((a, b) => (a.file === b.file ? a.start - b.start : a.file < b.file ? -1 : 1));
    unique.set(sorted.map(occurrenceKey).join(' '), sorted);
  }
  const groups = [...unique.values()];
  const byFile = new Map<string, { group: number; o: Occurrence }[]>();
  groups.forEach((occurrences, group) => {
    for (const o of occurrences) pushTo(byFile, o.file, { group, o });
  });
  /** o を含むほかの組 */
  const coveringGroups = (group: number, o: Occurrence): Set<number> =>
    new Set(
      byFile
        .get(o.file)!
        .filter(
          (h) =>
            h.group !== group &&
            h.o.start <= o.start &&
            o.end <= h.o.end &&
            (h.o.start < o.start || o.end < h.o.end || groups[h.group]!.length > groups[group]!.length),
        )
        .map((h) => h.group),
    );
  // 所の全部が、同じ 1 つの組の所に含まれるなら除く（別々の組に含まれるだけなら、この組の重なりは残す）
  const contained = (occurrences: readonly Occurrence[], group: number): boolean => {
    let common = coveringGroups(group, occurrences[0]!);
    for (const o of occurrences.slice(1)) {
      const here = coveringGroups(group, o);
      common = new Set([...common].filter((h) => here.has(h)));
    }
    return common.size > 0;
  };
  return groups
    .filter((occurrences, group) => !contained(occurrences, group))
    .map((occurrences) => ({ lines: Math.min(...occurrences.map((o) => o.end - o.start + 1)), occurrences }))
    .sort(
      (a, b) =>
        b.lines * (b.occurrences.length - 1) - a.lines * (a.occurrences.length - 1) ||
        occurrenceKey(a.occurrences[0]!).localeCompare(occurrenceKey(b.occurrences[0]!)),
    );
}

// ---- import と export ----

/** ファイル 1 つの import・export（先は resolve が返したキー。外のパッケージは入れない） */
export type ModuleInfo = {
  /** このファイルで宣言して出す名前（local はファイルの中での名前。export default の式は無し） */
  exports: { name: string; line: number; local: string | undefined }[];
  /** 再公開（`export { imported as name } from target`。`export * as name` は imported が *） */
  reexports: { name: string; target: string; imported: string }[];
  /** `export * from target` */
  stars: string[];
  /** 読む名前（import 文・import()・型の import('…')。* は全部。中身の無い import 文は空） */
  uses: { target: string; names: readonly string[] | '*' }[];
  /** 実行時に残る import・再公開の先（型だけの文を除く。循環を見る） */
  runtime: string[];
  /** ファイルの中の識別子の数（プロパティの名前・export { … } の中を除く） */
  identifiers: Map<string, number>;
};

const bindingNames = (name: ts.BindingName): string[] =>
  ts.isIdentifier(name)
    ? [name.text]
    : name.elements.flatMap((element) => (ts.isOmittedExpression(element) ? [] : bindingNames(element.name)));

const hasModifier = (node: ts.Node, kind: ts.SyntaxKind): boolean =>
  ts.canHaveModifiers(node) && (ts.getModifiers(node)?.some((m) => m.kind === kind) ?? false);

/** 型の import('…').A.B の、ファイルから出す名前（A） */
function importTypeName(qualifier: ts.EntityName): string {
  let name = qualifier;
  while (ts.isQualifiedName(name)) name = name.left;
  return name.text;
}

/** import・export を読む。resolve は指定 → 先のキー（外のパッケージ・ソースでない先は undefined） */
export function readModule(source: ts.SourceFile, resolve: (specifier: string) => string | undefined): ModuleInfo {
  const info: ModuleInfo = { exports: [], reexports: [], stars: [], uses: [], runtime: [], identifiers: new Map() };
  // 多重定義・宣言の合併（同じ名前を何度も出す）は、最初の 1 つだけ
  const addExport = (name: string, node: ts.Node, local: string | undefined): void => {
    if (!info.exports.some((e) => e.name === name)) info.exports.push({ name, line: startLine(node, source), local });
  };
  for (const statement of source.statements) {
    // import・再公開の先（文ごとに 1 回だけ辿る）
    const specifier =
      (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
      statement.moduleSpecifier !== undefined &&
      ts.isStringLiteral(statement.moduleSpecifier)
        ? statement.moduleSpecifier.text
        : undefined;
    const target = specifier === undefined ? undefined : resolve(specifier);
    if (target !== undefined && runtimeSpecifierOf(statement) !== undefined) info.runtime.push(target);
    if (ts.isImportDeclaration(statement)) {
      if (target === undefined) continue;
      const clause = statement.importClause;
      const bindings = clause?.namedBindings;
      if (bindings !== undefined && ts.isNamespaceImport(bindings)) {
        info.uses.push({ target, names: '*' });
        continue;
      }
      const names = clause?.name === undefined ? [] : ['default'];
      if (bindings !== undefined) names.push(...bindings.elements.map((e) => (e.propertyName ?? e.name).text));
      info.uses.push({ target, names });
    } else if (ts.isExportDeclaration(statement)) {
      const clause = statement.exportClause;
      if (statement.moduleSpecifier === undefined) {
        if (clause !== undefined && ts.isNamedExports(clause)) {
          for (const e of clause.elements) addExport(e.name.text, e, (e.propertyName ?? e.name).text);
        }
        continue;
      }
      if (target === undefined) continue;
      if (clause === undefined) info.stars.push(target);
      else if (ts.isNamespaceExport(clause)) info.reexports.push({ name: clause.name.text, target, imported: '*' });
      else {
        for (const e of clause.elements) {
          info.reexports.push({ name: e.name.text, target, imported: (e.propertyName ?? e.name).text });
        }
      }
    } else if (ts.isExportAssignment(statement)) {
      addExport('default', statement, ts.isIdentifier(statement.expression) ? statement.expression.text : undefined);
    } else if (hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
      const isDefault = hasModifier(statement, ts.SyntaxKind.DefaultKeyword);
      if (ts.isVariableStatement(statement)) {
        for (const d of statement.declarationList.declarations) {
          for (const name of bindingNames(d.name)) addExport(name, d, name);
        }
      } else if (
        ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement) ||
        ts.isEnumDeclaration(statement) ||
        ts.isModuleDeclaration(statement)
      ) {
        const local = statement.name !== undefined && ts.isIdentifier(statement.name) ? statement.name.text : undefined;
        if (isDefault) addExport('default', statement, local);
        else if (local !== undefined) addExport(local, statement, local);
      }
    }
  }
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node)) {
      const parent = node.parent;
      // プロパティ・メンバーの名前と、出す所（export { … }・export default の式）は、中で使うに数えない
      const isPropertyName =
        ((ts.isPropertyAccessExpression(parent) ||
          ts.isPropertyAssignment(parent) ||
          ts.isMethodDeclaration(parent) ||
          ts.isPropertyDeclaration(parent) ||
          ts.isMethodSignature(parent) ||
          ts.isPropertySignature(parent) ||
          ts.isGetAccessorDeclaration(parent) ||
          ts.isSetAccessorDeclaration(parent)) &&
          parent.name === node) ||
        ts.isExportSpecifier(parent) ||
        ts.isExportAssignment(parent);
      if (!isPropertyName) info.identifiers.set(node.text, (info.identifiers.get(node.text) ?? 0) + 1);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const arg = node.arguments[0];
      const target = arg !== undefined && ts.isStringLiteralLike(arg) ? resolve(arg.text) : undefined;
      if (target !== undefined) info.uses.push({ target, names: '*' });
    } else if (ts.isImportTypeNode(node)) {
      const arg = node.argument;
      if (ts.isLiteralTypeNode(arg) && ts.isStringLiteral(arg.literal)) {
        const target = resolve(arg.literal.text);
        const names = node.qualifier === undefined ? '*' : [importTypeName(node.qualifier)];
        if (target !== undefined) info.uses.push({ target, names });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return info;
}

/** ファイルが直に読む先（import・import()・再公開。型だけのものも） */
export function linkedTargets(info: ModuleInfo): Set<string> {
  return new Set([...info.uses.map((u) => u.target), ...info.reexports.map((r) => r.target), ...info.stars]);
}

export type UnusedExport = {
  file: string;
  name: string;
  line: number;
  /** none: どこからも読まない。tests: テストからだけ読む */
  usedBy: 'none' | 'tests';
  /** ファイルの中では使う（export を外せば足りる） */
  usedInFile: boolean;
};

/**
 * 読まれない export。読むかは、import・import()・型の import('…') と、再公開（`export … from`・`export *`）を辿って決める。
 * テストのファイルと、どのファイルも読まないファイル（スクリプト・設定・画面の入口）の export は出さない。どこからも読まずファイルの
 * 中でも使わない（消せる）・どこからも読まない（export を外せる）・テストだけの順で、同じならファイルとその中の順
 */
export function unusedExports(modules: ReadonlyMap<string, ModuleInfo>): UnusedExport[] {
  const used = new Set<string>();
  const usedOutsideTests = new Set<string>();
  const seen = new Set<string>();
  const mark = (file: string, name: string, fromTest: boolean): void => {
    const visitKey = `${fromTest ? 't' : 'n'}\0${file}\0${name}`;
    if (seen.has(visitKey)) return;
    seen.add(visitKey);
    const info = modules.get(file);
    if (info === undefined) return;
    for (const e of info.exports) {
      if (name !== '*' && e.name !== name) continue;
      used.add(`${file}\0${e.name}`);
      if (!fromTest) usedOutsideTests.add(`${file}\0${e.name}`);
    }
    for (const r of info.reexports) if (name === '*' || r.name === name) mark(r.target, r.imported, fromTest);
    if (name !== 'default') for (const star of info.stars) mark(star, name, fromTest);
  };
  const imported = new Set<string>();
  for (const [file, info] of modules) {
    const fromTest = isTestFile(file);
    for (const target of linkedTargets(info)) if (target !== file) imported.add(target);
    for (const use of info.uses) {
      for (const name of use.names === '*' ? ['*'] : use.names) mark(use.target, name, fromTest);
    }
  }
  const out: UnusedExport[] = [];
  for (const [file, info] of [...modules].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (isTestFile(file) || !imported.has(file)) continue;
    for (const e of info.exports) {
      const key = `${file}\0${e.name}`;
      if (usedOutsideTests.has(key)) continue;
      const usedInFile = e.local !== undefined && (info.identifiers.get(e.local) ?? 0) >= 2;
      out.push({ file, name: e.name, line: e.line, usedBy: used.has(key) ? 'tests' : 'none', usedInFile });
    }
  }
  const rank = (u: UnusedExport): number => (u.usedBy === 'tests' ? 2 : u.usedInFile ? 1 : 0);
  return out.sort((a, b) => rank(a) - rank(b));
}

// ---- 一緒に変わるファイル ----

/** `git log --format=%x01 --name-only` の出力 → commit ごとのファイルの一覧 */
export function parseNameOnlyLog(stdout: string): string[][] {
  return stdout
    .split('\x01')
    .map((chunk) => chunk.split('\n').filter((line) => line.trim() !== ''))
    .filter((files) => files.length > 0);
}

export type CoChange = { a: string; b: string; together: number; commitsA: number; commitsB: number };

/**
 * 2 回以上一緒に変わったファイルの組で、どちらも他方を直に読まないもの（linked が false）。maxFiles を超える commit（一括の書き換え）は
 * 数えない（大きさは counted で絞る前の commit で見る）。組と回数は counted のファイルだけで数える。一緒に変わった回数の多い順（同じなら、少ない方の変わった回数に対する割合の高い順）
 */
export function coChangePairs(
  commits: readonly (readonly string[])[],
  linked: (a: string, b: string) => boolean,
  maxFiles: number,
  counted: (file: string) => boolean = () => true,
): CoChange[] {
  const perFile = new Map<string, number>();
  const pairs = new Map<string, number>();
  for (const commit of commits) {
    const changed = new Set(commit);
    if (changed.size > maxFiles) continue;
    const files = [...changed].filter(counted).sort();
    for (const f of files) perFile.set(f, (perFile.get(f) ?? 0) + 1);
    for (let i = 0; i < files.length; i++) {
      for (let j = i + 1; j < files.length; j++) {
        const key = `${files[i]}\0${files[j]}`;
        pairs.set(key, (pairs.get(key) ?? 0) + 1);
      }
    }
  }
  const out: CoChange[] = [];
  for (const [key, together] of pairs) {
    const [a, b] = key.split('\0') as [string, string];
    if (together < 2 || linked(a, b) || linked(b, a)) continue;
    out.push({ a, b, together, commitsA: perFile.get(a)!, commitsB: perFile.get(b)! });
  }
  const share = (c: CoChange): number => c.together / Math.min(c.commitsA, c.commitsB);
  return out.sort((x, y) => y.together - x.together || share(y) - share(x) || (x.a + x.b < y.a + y.b ? -1 : 1));
}
