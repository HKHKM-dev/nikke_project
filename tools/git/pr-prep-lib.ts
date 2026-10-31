// PR の前のリベースの決まりごと（plan/design-workflow-simplification-4.md 2 節）。git を呼ぶ部分（pr-prep.ts）と分けてテストする。
import { idsInPaths, nextId } from '../../packages/core/src/records/drafts.ts';
import { ID_DIGITS } from '../../packages/core/src/records/ids.ts';

/** 衝突したファイルを、main の版を取ってよい生成物と、人が直すものに分ける */
export function splitConflicts(
  conflicted: readonly string[],
  generated: readonly string[],
): { generated: string[]; other: string[] } {
  const set = new Set(generated);
  return {
    generated: conflicted.filter((p) => set.has(p)),
    other: conflicted.filter((p) => !set.has(p)),
  };
}

/**
 * 作り直しのコマンド。ブランチが感度（sensitivity.json）を変えていたか、それが衝突したときは、感度の入力（スキル定義・録画の台帳・
 * 観測値の比べる指定）がブランチと main の両方で変わったので、計算し直す（records:minimal。records:check も回る）
 */
export function regenerateScript(
  branchChanged: readonly string[],
  conflicted: readonly string[],
  sensitivityPath: string,
): 'records:minimal' | 'records:check' {
  return branchChanged.includes(sensitivityPath) || conflicted.includes(sensitivityPath)
    ? 'records:minimal'
    : 'records:check';
}

/**
 * git rebase origin/main の後の様子。0 以外で終わってもリベースの途中なら衝突で止まっただけ（続きはループで解く）。途中でもなければ、
 * リベースは始まらなかった（追跡していないファイルが main のファイルと重なったなど）ので、取り込まずに先へ進んではいけない
 */
export function rebaseOutcome(status: number, rebasing: boolean): 'clean' | 'conflicted' | 'notStarted' {
  if (status === 0) return 'clean';
  return rebasing ? 'conflicted' : 'notStarted';
}

export type Collision = { id: string; suggestion?: string };

/**
 * ブランチで足した検証記録・結論・録画の ID のうち、main も足したもの。suggestion は振り直しの番号の案（V・C だけ。taken はほかの
 * ブランチが使った ID も含めた、避ける ID）
 */
export function collisions(
  branchAdded: readonly string[],
  mainFiles: readonly string[],
  taken: readonly string[],
): Collision[] {
  const own = [...idsInPaths(branchAdded.join('\n')), ...recordingIds(branchAdded)];
  const main = new Set([...idsInPaths(mainFiles.join('\n')), ...recordingIds(mainFiles)]);
  const avoid = [...main, ...own, ...taken];
  const out: Collision[] = [];
  for (const id of own) {
    if (!main.has(id)) continue;
    const prefix = id.slice(0, 1);
    if (prefix === 'V' || prefix === 'C') {
      const suggestion = nextId(prefix, avoid);
      avoid.push(suggestion);
      out.push({ id, suggestion });
    } else out.push({ id });
  }
  return out;
}

/** records/recordings/<id>.json の id（README などは除く） */
function recordingIds(paths: readonly string[]): string[] {
  return paths
    .map((p) => /^records\/recordings\/(\d{3,})\.json$/.exec(p.trim())?.[1])
    .filter((x): x is string => x !== undefined);
}

/** git diff -U0 の出力から、ファイルごとに足した（変えた）行の番号（ブランチの版の 1 始まり） */
export function addedLines(diff: string): Map<string, Set<number>> {
  const out = new Map<string, Set<number>>();
  let lines: Set<number> | undefined;
  for (const l of diff.split('\n')) {
    const file = /^\+\+\+ b\/(.+)$/.exec(l)?.[1];
    if (file !== undefined) {
      lines = new Set();
      out.set(file, lines);
      continue;
    }
    const hunk = /^@@ -\S+ \+(\d+)(?:,(\d+))? @@/.exec(l);
    if (hunk === null || lines === undefined) continue;
    const start = Number(hunk[1]);
    const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
    for (let n = start; n < start + count; n++) lines.add(n);
  }
  return out;
}

/** 進み具合の書き写しを見るファイル（git の pathspec） */
export const PROGRESS_PATHS = ['plan/backlog.md', 'plan/design-*.md'];

/** 進み具合の書き写しの印（検証記録・結論の ID か「PR N を実装」） */
const PROGRESS = new RegExp(`(?<![A-Za-z0-9_-])[CV]-${ID_DIGITS}(?![0-9A-Za-z_-])|PR ?\\d+ ?(?:を|は)?(?:実装|出し)`);

/**
 * 進み具合を書き写した行（AGENTS.md「文書の書き方」: 進み具合は、その仕事の設計書の経過にだけ書く）。見るのは backlog.md 8 節、
 * 段の一覧の経過、設計書の冒頭の「状態」の行で、ブランチで足した行のうち検証記録・結論の ID か「PR N を実装」を含むもの
 */
export function progressCopies(path: string, text: string, added: ReadonlySet<number>): string[] {
  // 節は題名で見る（番号は節を消すと変わる）
  const watch: (line: string, heading: string) => boolean =
    path === 'plan/backlog.md'
      ? (_, heading) => heading.includes('課題（設計書のあるもの）')
      : path === 'plan/design-skill-stages.md'
        ? (line, heading) => line.startsWith('- 状態:') || heading === '## 経過'
        : (line) => line.startsWith('- 状態:');
  const out: string[] = [];
  let heading = '';
  text.split('\n').forEach((line, i) => {
    if (line.startsWith('## ')) heading = line;
    if (added.has(i + 1) && PROGRESS.test(line) && watch(line, heading))
      out.push(`${path}:${i + 1}: ${line.length > 80 ? `${line.slice(0, 80)}…` : line}`);
  });
  return out;
}

/**
 * 書式と lint の結果を、変えていないファイルでも変えうる設定（これを変えたブランチは全部のファイルを見る）。prettier の設定と ignore、
 * prettier が読む .editorconfig、eslint の設定は、どの階層にあっても効くので名前の形で見る。package.json は道具の版と prettier の欄、
 * package-lock.json は道具の版
 */
const CHECK_SETTING =
  /(?:^|\/)(?:\.prettierrc(?:\.[^/]+)?|prettier\.config\.[^/]+|\.prettierignore|\.editorconfig|eslint\.config\.[^/]+|package\.json)$|^package-lock\.json$/;

export function isCheckSetting(path: string): boolean {
  return CHECK_SETTING.test(path);
}
/** eslint が見る拡張子（eslint.config.js） */
const LINT_FILE = /\.(?:[cm]?js|tsx?)$/;
/** これより多く変えたら全部を見る（コマンドラインの長さの上限を避ける。Windows は約 32,000 字） */
export const MAX_CHANGED_FILES = 300;

export type ChangedChecks = { full: true; reason: string } | { full: false; format: string[]; lint: string[] };

/**
 * pr:prep の書式（prettier）と lint（eslint）で見るファイル（plan/design-workflow-simplification-8.md 1 節）。main は CI を通っていて、
 * 書式と lint はファイルごとに決まる（eslint は型を使う規則を入れていない）ので、ブランチで変えた（消していない）ファイルだけを見る。
 * 設定を変えたか、変えたファイルが多すぎるときは全部を見る
 */
export function changedChecks(changed: readonly string[], exists: (path: string) => boolean): ChangedChecks {
  const config = changed.find(isCheckSetting);
  if (config !== undefined) return { full: true, reason: `${config} を変えた` };
  const format = changed.filter(exists);
  if (format.length > MAX_CHANGED_FILES) return { full: true, reason: `変えたファイルが ${format.length} 件ある` };
  return { full: false, format, lint: format.filter((p) => LINT_FILE.test(p)) };
}

/**
 * パスの一覧を出す git のコマンド（diff --name-only・ls-tree --name-only）に -z を足す。既定の core.quotePath では ASCII でないパスが
 * "\343…" の形に包まれ、ファイルとして見つからなくなる。-z なら包まず、NUL で区切る（nulPaths で読む）
 */
export function pathListArgs(args: readonly string[]): string[] {
  const [command, ...rest] = args;
  return [command!, '-z', ...rest];
}

/** -z の出力のパス */
export function nulPaths(stdout: string): string[] {
  return stdout.split('\0').filter((p) => p !== '');
}

/** pr:prep が変えたファイルだけで見る段（npm run ci の段のうち、これを除いたものを全部回す） */
const CHANGED_ONLY_STEPS = ['format:check', 'lint'];

/**
 * npm run ci（package.json）の段のうち、書式と lint を除いたもの（npm run の名前）。ci に段を足せば pr:prep も回す。npm run <名前> か
 * npm test でない段や、書式か lint の段が無いときは止める（pr:prep が ci と違う確認になるので）
 */
export function checkSteps(ci: string): string[] {
  const steps = ci.split('&&').map((step) => {
    const m = /^npm (?:run (\S+)|(test))$/.exec(step.trim());
    if (m === null) throw new Error(`npm run ci の段「${step.trim()}」が npm run <名前> の形でない`);
    return (m[1] ?? m[2])!;
  });
  for (const s of CHANGED_ONLY_STEPS)
    if (!steps.includes(s)) throw new Error(`npm run ci に ${s} の段が無い（pr:prep の絞り込みを見直す）`);
  return steps.filter((s) => !CHANGED_ONLY_STEPS.includes(s));
}
