// コードの作り替えの候補を測って、節ごとに表で出す（plan/design-workflow-simplification-17.md 10 節）。ファイルには書かない。
//   npm run code:survey                                    全部の節
//   npm run code:survey -- --only long,dup --top 30        節を選ぶ・各節の行数
//   npm run code:survey -- --path packages/core/src/sim    出す行を、そのフォルダの下のファイルに絞る（読むのは全部）
//   npm run code:survey -- --only cochange --since 2026-10-01
// 見る範囲は packages・apps・tools の .ts・.tsx（node_modules・dist・名前が . で始まるフォルダ・.d.ts・生成物を除く）。節:
//   long: 長い関数（宣言の始めから終わりまでの行数。vitest の describe・it などに渡す関数は数えない）
//   dup: 同じ形の文の並び（名前と値を区別しない構文木の形）。import・型の宣言・describe・it などの呼び出しを区切りにし、テストの
//        本体（it などに渡す関数の中）は見ない。--min-lines（既定 8）に満たない所は数えない
//   unused: 読まれない export（どこからも・テストからだけ）。テストと、どのファイルも読まないファイル（スクリプト・設定・画面の
//           入口）の export は出さない。「中で使う」は、ファイルの中で名前を使っている（export を外せば足りる）。ファイルの中でも
//           使わないもの・中で使うもの・テストだけの順
//   cycles: 実行時に残る import の循環（tools/code/import-cycles.ts と同じ決まり）
//   cochange: git log で 2 回以上一緒に変わったファイルの組で、どちらも他方を直に読まないもの（--since、既定 3 か月前から。
//             1 回で 30 を超えるファイルを変えた commit は数えない）
// --top は各節の行数（既定 15）。
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cliArgs, fail } from '../../packages/core/scripts/cli.ts';
import { GENERATED_PATHS } from '../../packages/core/scripts/records-data.ts';
import { findImportCycles, REPO_IMPORT_GRAPH, repoKey, resolveImport, sourceFilesUnder } from './import-cycles.ts';
import {
  coChangePairs,
  findDuplicates,
  functionLengths,
  linkedTargets,
  parseNameOnlyLog,
  parseSource,
  readModule,
  unusedExports,
  type ModuleInfo,
  type Occurrence,
  type UnusedExport,
} from './survey-lib.ts';

const SECTIONS = ['long', 'dup', 'unused', 'cycles', 'cochange'] as const;
type Section = (typeof SECTIONS)[number];
/** これを超えるファイルを変えた commit（一括の書き換え）は、一緒に変わった回数に数えない */
const MAX_FILES_PER_COMMIT = 30;

const { values } = cliArgs(import.meta.url, {
  options: {
    top: { type: 'string', default: '15' },
    only: { type: 'string' },
    path: { type: 'string', multiple: true },
    since: { type: 'string', default: '3 months ago' },
    'min-lines': { type: 'string', default: '8' },
  },
});
const positiveInt = (name: string, text: string): number => {
  const n = Number(text);
  if (!Number.isInteger(n) || n < 1) fail(`--${name} は 1 以上の整数（"${text}"）`);
  return n;
};
const top = positiveInt('top', values.top);
const minLines = positiveInt('min-lines', values['min-lines']);
const only = values.only?.split(',').map((s) => s.trim()) ?? [...SECTIONS];
for (const name of only) {
  if (!(SECTIONS as readonly string[]).includes(name)) fail(`--only の節 "${name}" は無い（${SECTIONS.join('・')}）`);
}
const shown = (section: Section): boolean => only.includes(section);
const paths = (values.path ?? []).map((p) => p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, ''));
const inPath = (file: string): boolean =>
  paths.length === 0 || paths.some((p) => file === p || file.startsWith(`${p}/`));

const started = performance.now();
const root = fileURLToPath(new URL('../../', import.meta.url));
const generated = new Set(GENERATED_PATHS);
const files = REPO_IMPORT_GRAPH.dirs
  .flatMap((dir) => sourceFilesUnder(join(root, dir)))
  .map((path) => ({ path, file: repoKey(root, path) }))
  .filter(({ file }) => !generated.has(file));
const sources = files.map(({ path, file }) => ({ path, file, source: parseSource(file, readFileSync(path, 'utf8')) }));

/** 辿れない指定（import-cycles.test.ts は実行時の import しか見ないので、import() や型の import('…') で出うる） */
const unresolved: string[] = [];
const modules = new Map<string, ModuleInfo>();
for (const { path, file, source } of sources) {
  const resolve = (specifier: string): string | undefined => {
    try {
      const target = resolveImport(root, path, specifier, REPO_IMPORT_GRAPH);
      return target === undefined ? undefined : repoKey(root, target);
    } catch (e) {
      unresolved.push((e as Error).message);
      return undefined;
    }
  };
  modules.set(file, readModule(source, resolve));
}

const cell = (text: string | number): string => String(text).replace(/\|/g, '\\|');
function table(title: string, total: number, head: readonly string[], rows: readonly (readonly (string | number)[])[]) {
  const count = rows.length < total ? `上位 ${rows.length} / ${total}` : `${total}`;
  console.log(`\n## ${title}（${count}）\n`);
  if (rows.length === 0) {
    console.log('なし');
    return;
  }
  console.log(`| ${head.join(' | ')} |`);
  console.log(`| ${head.map(() => '---').join(' | ')} |`);
  for (const row of rows) console.log(`| ${row.map(cell).join(' | ')} |`);
}

if (shown('long')) {
  const all = sources
    .filter(({ file }) => inPath(file))
    .flatMap(({ file, source }) => functionLengths(file, source))
    .sort((a, b) => b.lines - a.lines || a.file.localeCompare(b.file) || a.line - b.line);
  const rows = all.slice(0, top).map((f) => [f.lines, f.name, `${f.file}:${f.line}`]);
  table('長い関数', all.length, ['行数', '関数', '場所'], rows);
}

if (shown('dup')) {
  const place = (o: Occurrence): string => `${o.file}:${o.start}-${o.end}`;
  const all = findDuplicates(sources, minLines).filter((g) => g.occurrences.some((o) => inPath(o.file)));
  const rows = all.slice(0, top).map((g) => {
    const head = g.occurrences.slice(0, 3).map(place).join('、');
    const rest = g.occurrences.length > 3 ? `、ほか ${g.occurrences.length - 3} か所` : '';
    return [g.lines, g.occurrences.length, head + rest];
  });
  table(`同じ形の文の並び（${minLines} 行以上）`, all.length, ['行数', '所', '場所'], rows);
}

if (shown('unused')) {
  // どこからも読まずファイルの中でも使わない（消せる）・どこからも読まない（export を外せる）・テストだけの順（同じなら、ファイルの順）
  const rank = (u: UnusedExport): number => (u.usedBy === 'tests' ? 2 : u.usedInFile ? 1 : 0);
  const all = unusedExports(modules)
    .filter((u) => inPath(u.file))
    .sort((a, b) => rank(a) - rank(b));
  const rows = all
    .slice(0, top)
    .map((u) => [
      u.name,
      u.usedBy === 'none' ? 'どこからも' : 'テストだけ',
      u.usedInFile ? '中で使う' : '',
      `${u.file}:${u.line}`,
    ]);
  const none = all.filter((u) => u.usedBy === 'none').length;
  table(
    `読まれない export（どこからも ${none}・テストだけ ${all.length - none}）`,
    all.length,
    ['名前', '読む所', 'ファイル', '場所'],
    rows,
  );
}

if (shown('cycles')) {
  const graph = new Map([...modules].map(([file, info]) => [file, new Set(info.runtime)]));
  const all = findImportCycles(graph).filter((cycle) => cycle.some(inPath));
  table(
    '循環する import',
    all.length,
    ['ファイル数', 'ファイル'],
    all.slice(0, top).map((c) => [c.length, c.join('、')]),
  );
}

if (shown('cochange')) {
  const git = (args: string[]): string =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const log = git([
    'log',
    `--since=${values.since}`,
    '--no-merges',
    '--format=%x01',
    '--name-only',
    '--',
    ...REPO_IMPORT_GRAPH.dirs,
  ]);
  const commits = parseNameOnlyLog(log).map((changed) => changed.filter((file) => modules.has(file)));
  const links = new Map([...modules].map(([file, info]) => [file, linkedTargets(info)]));
  const all = coChangePairs(commits, (a, b) => links.get(a)?.has(b) ?? false, MAX_FILES_PER_COMMIT).filter(
    (c) => inPath(c.a) || inPath(c.b),
  );
  const rows = all.slice(0, top).map((c) => [c.together, `${c.commitsA}・${c.commitsB}`, c.a, c.b]);
  table(
    `一緒に変わるファイル（git log --since="${values.since}"）`,
    all.length,
    ['一緒', 'それぞれ', 'ファイル', 'ファイル'],
    rows,
  );
  // 浅い clone（クラウドの環境など）では、履歴が途中で切れて回数が少なく出る
  if (git(['rev-parse', '--is-shallow-repository']).trim() === 'true') {
    console.log('\n注意: 浅い clone なので、手元にある commit だけを数える（全部は git fetch --unshallow の後）');
  }
}

if (unresolved.length > 0) {
  console.log(`\n辿れない import の指定 ${unresolved.length} 件（読まれない export の判定から外した）:`);
  for (const message of unresolved.slice(0, 5)) console.log(`  ${message}`);
}
console.log(`\n（${sources.length} ファイル、${((performance.now() - started) / 1000).toFixed(1)} 秒）`);
