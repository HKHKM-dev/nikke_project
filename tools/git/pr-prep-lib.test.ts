// PR の前のリベースの決まりごと（plan/design-workflow-simplification-4.md 2 節）。git は、パスの一覧の読み方を見るところだけ一時のリポジトリで呼ぶ。
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  addedLines,
  backlogProgressCopy,
  branchChangedChecks,
  branchOversizedDocs,
  changedChecks,
  checkSteps,
  collisions,
  DOC_SIZE_LIMIT,
  handEditedLines,
  handRemovedLines,
  GUIDE_ITEM_LIMIT,
  longNewGuideItems,
  isCheckSetting,
  MAX_CHANGED_FILES,
  nulPaths,
  oversizedDocs,
  pathListArgs,
  progressCopies,
  rebaseOutcome,
  removedLines,
  short,
  splitGenerated,
} from './pr-prep-lib.ts';

/** 一時のリポジトリで回す git（名前と署名の設定を足す） */
const git = (cwd: string, args: readonly string[]) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], {
    cwd,
    encoding: 'utf8',
  });

/** 作った一時のリポジトリ（テストの後に消す） */
const repos: string[] = [];
afterEach(() => {
  for (const cwd of repos.splice(0)) rmSync(cwd, { recursive: true, force: true });
});

/** files（パス → 中身）を最初のコミットにした一時のリポジトリと、そのコミット */
function baseRepo(files: Record<string, string>): { cwd: string; base: string } {
  const cwd = mkdtempSync(join(tmpdir(), 'pr-prep-'));
  repos.push(cwd);
  git(cwd, ['init', '-q']);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(cwd, path, '..'), { recursive: true });
    writeFileSync(join(cwd, path), text);
  }
  git(cwd, ['add', '.']);
  git(cwd, ['commit', '-q', '-m', 'base']);
  return { cwd, base: git(cwd, ['rev-parse', 'HEAD']).trim() };
}

const GENERATED = ['plan/claims.md', 'plan/residuals.md', 'records/minimal/sensitivity.json'];

describe('splitGenerated', () => {
  it('takes only the generated files, and leaves the rest to a person', () => {
    expect(splitGenerated(['plan/claims.md', 'plan/backlog.md'], GENERATED)).toEqual({
      generated: ['plan/claims.md'],
      other: ['plan/backlog.md'],
    });
    expect(splitGenerated(['plan/residuals.md'], GENERATED).other).toEqual([]);
  });
});

describe('rebaseOutcome', () => {
  it('stops when the rebase did not start, instead of going on without main', () => {
    expect(rebaseOutcome(0, false)).toBe('clean');
    expect(rebaseOutcome(1, true)).toBe('conflicted');
    expect(rebaseOutcome(1, false)).toBe('notStarted');
  });
});

describe('collisions', () => {
  const main = [
    'records/verifications/V-0528-laplace.md',
    'records/verifications/V-0529-other.md',
    'records/claims/C-0701.json',
    'records/recordings/0718.json',
    'records/recordings/README.md',
  ];

  it('finds the IDs added on both sides and suggests free V and C numbers', () => {
    const added = [
      'records/verifications/V-0529-mine.md',
      'records/claims/C-0701.json',
      'records/claims/C-0702.json',
      'records/recordings/0718.json',
    ];
    expect(collisions(added, main, ['V-0531'])).toEqual([
      { id: 'V-0529', suggestion: 'V-0532' },
      { id: 'C-0701', suggestion: 'C-0703' },
      { id: '0718' },
    ]);
  });

  it('is empty when the branch added only new IDs', () => {
    expect(collisions(['records/verifications/V-0530-mine.md', 'records/recordings/0719.json'], main, [])).toEqual([]);
  });
});

describe('addedLines', () => {
  it('reads the added line numbers of each file from git diff -U0', () => {
    const diff = [
      'diff --git a/plan/backlog.md b/plan/backlog.md',
      '--- a/plan/backlog.md',
      '+++ b/plan/backlog.md',
      '@@ -3 +3 @@ x',
      '@@ -10,0 +11,2 @@ y',
      'diff --git a/plan/design-old.md b/plan/design-old.md',
      '--- a/plan/design-old.md',
      '+++ /dev/null',
      '@@ -1,3 +0,0 @@',
      'diff --git a/plan/design-x.md b/plan/design-x.md',
      '--- a/plan/design-x.md',
      '+++ b/plan/design-x.md',
      '@@ -5,2 +4,0 @@',
    ].join('\n');
    const got = addedLines(diff);
    expect([...got.keys()]).toEqual(['plan/backlog.md', 'plan/design-x.md']);
    expect([...got.get('plan/backlog.md')!]).toEqual([3, 11, 12]);
    expect(got.get('plan/design-x.md')!.size).toBe(0);
  });
});

describe('collisions of backlog numbers', () => {
  const main = ['records/backlog/2-43.json', 'records/backlog/2-44.json', 'records/backlog/pr-conflicts.json'];

  it('suggests the next free number of the section, avoiding main, the branch and the other branches', () => {
    const added = ['records/backlog/2-44.json', 'records/backlog/2-45.json', 'records/backlog/template.md'];
    expect(collisions(added, main, ['2-46'])).toEqual([{ id: '2-44', suggestion: '2-47' }]);
  });

  it('ignores named items, which do not collide by numbering', () => {
    expect(collisions(['records/backlog/pr-conflicts.json'], main, [])).toEqual([]);
  });
});

describe('handEditedLines', () => {
  it('returns the added lines that the regenerated version does not have', () => {
    expect(handEditedLines(['- 先の課題', '', '- 手で足した課題'], '# 一覧\n\n- 先の課題\n')).toEqual([
      '- 手で足した課題',
    ]);
  });
});

describe('removedLines', () => {
  it('reads the removed lines of each file from git diff -U0, keyed by the path on main', () => {
    const diff = [
      'diff --git a/plan/backlog.md b/plan/backlog.md',
      'index 1111111..2222222 100644',
      '--- a/plan/backlog.md',
      '+++ b/plan/backlog.md',
      '@@ -3 +2,0 @@ x',
      '-- 手で消した課題',
      '@@ -7,2 +6 @@ y',
      '--- 「-」で始まる行',
      '-| 2-5 | 前の文 |',
      '+| 2-5 | 後の文 |',
      'diff --git a/plan/design-new.md b/plan/design-new.md',
      'new file mode 100644',
      '--- /dev/null',
      '+++ b/plan/design-new.md',
      '@@ -0,0 +1 @@',
      '+# 題',
    ].join('\n');
    const got = removedLines(diff);
    expect([...got.keys()]).toEqual(['plan/backlog.md']);
    expect(got.get('plan/backlog.md')).toEqual(['- 手で消した課題', '-- 「-」で始まる行', '| 2-5 | 前の文 |']);
  });
});

describe('handRemovedLines', () => {
  const generated = '# 一覧\n\n- 残っている課題\n- 動かした課題\n';

  it('returns the removed lines that the data still generates and the branch no longer has', () => {
    const branch = '# 一覧\n\n- 動かした課題\n';
    expect(handRemovedLines(['- 残っている課題', '', '- 閉じた課題'], generated, branch)).toEqual(['- 残っている課題']);
  });

  it('ignores lines that were only moved', () => {
    const branch = '# 一覧\n\n- 動かした課題\n- 残っている課題\n';
    expect(handRemovedLines(['- 残っている課題'], generated, branch)).toEqual([]);
  });

  // pr:prep の案内（戻す先は分かれ目の版）: この検査はリベースの前に回り、差分は分かれ目から（main...HEAD）取る。
  // ブランチのデータには、分かれた後に main で閉じた課題がまだあるので、作り直した版（generated）にもその行がある
  it('passes after restoring the version at the merge base, but not the newer main that closed an issue', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'pr-prep-'));
    const path = 'plan/backlog.md';
    const commit = (text: string, message: string) => {
      writeFileSync(join(cwd, path), text);
      git(cwd, ['add', '.']);
      git(cwd, ['commit', '-q', '-m', message]);
    };
    git(cwd, ['init', '-q', '-b', 'main']);
    mkdirSync(join(cwd, 'plan'));
    commit(generated, 'base');
    const base = git(cwd, ['rev-parse', 'HEAD']).trim();
    git(cwd, ['checkout', '-q', '-b', 'topic']);
    commit('# 一覧\n\n- 動かした課題\n', '手で消した');
    git(cwd, ['checkout', '-q', 'main']);
    commit('# 一覧\n\n- 動かした課題\n', 'main で閉じた');
    git(cwd, ['checkout', '-q', 'topic']);
    const dropped = (restoreFrom: string) => {
      git(cwd, ['checkout', '-q', restoreFrom, '--', path]);
      git(cwd, ['commit', '-q', '--allow-empty', '-m', `戻した（${restoreFrom}）`]);
      const removed = removedLines(git(cwd, ['diff', '-U0', 'main...HEAD', '--', path])).get(path) ?? [];
      return handRemovedLines(removed, generated, readFileSync(join(cwd, path), 'utf8'));
    };
    expect(dropped('main')).toEqual(['- 残っている課題']);
    expect(dropped(base)).toEqual([]);
  });
});

describe('backlogProgressCopy', () => {
  const path = 'records/backlog/x.json';
  const issue = (text: string, section = '8') => ({ section, order: 10, text });

  it('finds progress in the text of an issue (section 8 and 8.2) that the branch changed', () => {
    const copied = '段の課題（2026-10-14 起票）→ 段 13 は PR 1 を実装した（V-0546、C-0745）';
    expect(backlogProgressCopy(path, issue(copied), undefined)).toBe(`${path}: ${copied}`);
    expect(backlogProgressCopy(path, issue(copied, '8.2'), issue('前の文'))).toBe(`${path}: ${copied}`);
    expect(backlogProgressCopy(path, issue(copied), issue(copied))).toBeUndefined();
    expect(
      backlogProgressCopy(path, issue('段の課題（2026-10-14 起票）→ 進行中: [design-a.md](design-a.md)'), undefined),
    ).toBeUndefined();
  });

  it('does not look at the other sections', () => {
    expect(backlogProgressCopy(path, { section: '2', cells: { 課題: 'V-0401' } }, undefined)).toBeUndefined();
    expect(backlogProgressCopy(path, issue('V-0401 を撮る', '4'), undefined)).toBeUndefined();
  });
});

describe('progressCopies', () => {
  const all = (text: string) => new Set(text.split('\n').map((_, i) => i + 1));

  it('finds progress in the status line of a design doc and in the stage list, only on the lines the branch added', () => {
    const doc = [
      '# 設計書',
      '- 状態: 決定（2026-10-30）。PR 1 を実装した（V-0546）',
      '## 経過',
      '- PR 1 を実装した（V-0546）',
    ];
    const text = doc.join('\n');
    expect(progressCopies('plan/design-skill-stage13.md', text, all(text))).toEqual([
      'plan/design-skill-stage13.md:2: - 状態: 決定（2026-10-30）。PR 1 を実装した（V-0546）',
    ]);
    expect(progressCopies('plan/design-skill-stage13.md', text, new Set([4]))).toEqual([]);
    expect(progressCopies('plan/design-skill-stages.md', text, new Set([4]))).toEqual([
      'plan/design-skill-stages.md:4: - PR 1 を実装した（V-0546）',
    ]);
  });

  it('lets the stage events and plain statuses through', () => {
    const text = [
      '- 状態: 決定（2026-10-30。オーナーが論点 1〜9 を推奨どおりに決めた）',
      '## 経過',
      '- 段 13: 2026-10-29 起案・2026-10-31 閉じた（[d](d)）',
    ].join('\n');
    expect(progressCopies('plan/design-skill-stages.md', text, all(text))).toEqual([]);
    expect(progressCopies('plan/roadmap.md', '- V-0546', new Set([1]))).toEqual([]);
  });
});

describe('changedChecks', () => {
  const exists = (p: string) => !p.startsWith('gone/');

  it('checks only the files the branch changed and kept, and lints only the script files', () => {
    expect(
      changedChecks(
        ['plan/claims.md', 'tools/git/pr-prep.ts', 'apps/web/src/App.tsx', 'gone/old.ts', 'eslint.cjs'],
        exists,
      ),
    ).toEqual({
      full: false,
      format: ['plan/claims.md', 'tools/git/pr-prep.ts', 'apps/web/src/App.tsx', 'eslint.cjs'],
      lint: ['tools/git/pr-prep.ts', 'apps/web/src/App.tsx', 'eslint.cjs'],
    });
    expect(changedChecks([], exists)).toEqual({ full: false, format: [], lint: [] });
    expect(changedChecks(['tools/x.mts', 'tools/y.cts', 'a.d.ts'], exists)).toMatchObject({
      lint: ['tools/x.mts', 'tools/y.cts', 'a.d.ts'],
    });
  });

  it('checks every file when the branch changed a setting of prettier or eslint', () => {
    const settings = [
      '.prettierrc.json',
      '.prettierignore',
      'eslint.config.js',
      'package.json',
      'package-lock.json',
      '.editorconfig',
      'apps/web/.editorconfig',
      'apps/web/.prettierrc',
      'packages/core/.prettierrc.yaml',
      'prettier.config.mjs',
      'eslint.config.mjs',
      'apps/web/eslint.config.ts',
      'apps/web/package.json',
    ];
    for (const p of settings) {
      expect(isCheckSetting(p)).toBe(true);
      expect(changedChecks(['plan/claims.md', p], exists)).toEqual({ full: true, reason: `${p} を変えた` });
    }
    for (const p of [
      'plan/eslint.config.md.bak/x.md',
      'plan/prettierrc.md',
      'tools/eslint.ts',
      'records/package.json.md',
    ])
      expect(isCheckSetting(p)).toBe(false);
  });

  it('checks every file when the branch changed too many files', () => {
    const many = Array.from({ length: MAX_CHANGED_FILES + 1 }, (_, i) => `records/observations/${i}.json`);
    expect(changedChecks(many, exists)).toEqual({
      full: true,
      reason: `変えたファイルが ${MAX_CHANGED_FILES + 1} 件ある`,
    });
    expect(changedChecks(many.slice(1), exists).full).toBe(false);
  });
});

describe('pathListArgs and nulPaths', () => {
  it('reads paths that are not ASCII as they are, and the new path of a rename', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'pr-prep-'));
    git(cwd, ['init', '-q']);
    writeFileSync(join(cwd, 'a.md'), 'a\nb\nc\nd\n');
    writeFileSync(join(cwd, 'keep.md'), 'k\n');
    git(cwd, ['add', '.']);
    git(cwd, ['commit', '-q', '-m', 'base']);
    const base = git(cwd, ['rev-parse', 'HEAD']).trim();
    mkdirSync(join(cwd, '録画'));
    renameSync(join(cwd, 'a.md'), join(cwd, '録画', 'あ.md'));
    writeFileSync(join(cwd, '日本語 の 名前.md'), 'x\n');
    git(cwd, ['add', '-A']);
    git(cwd, ['commit', '-q', '-m', 'change']);
    const out = git(cwd, pathListArgs(['diff', '--name-only', `${base}...HEAD`]));
    expect(nulPaths(out)).toEqual(['日本語 の 名前.md', '録画/あ.md']);
    expect(
      nulPaths(git(cwd, pathListArgs(['diff', '--name-only', '--diff-filter=AR', `${base}...HEAD`, '--', '録画']))),
    ).toEqual(['録画/あ.md']);
    expect(nulPaths(git(cwd, pathListArgs(['ls-tree', '-r', '--name-only', 'HEAD'])))).toEqual([
      'keep.md',
      '日本語 の 名前.md',
      '録画/あ.md',
    ]);
  });

  it('lists both paths of a renamed or deleted setting, so the branch checks every file', () => {
    const { cwd, base } = baseRepo({
      '.prettierignore': 'plan/residuals.md\n',
      '.editorconfig': 'root = true\n',
      'a.ts': 'export {};\n',
    });
    const exists = (path: string) => existsSync(join(cwd, path));
    const checks = () => branchChangedChecks(base, (args) => git(cwd, args), exists);
    git(cwd, ['mv', '.prettierignore', 'prettierignore.old']);
    git(cwd, ['commit', '-q', '-m', 'rename']);
    expect(checks()).toEqual({ full: true, reason: '.prettierignore を変えた' });
    git(cwd, ['reset', '-q', '--hard', base]);
    git(cwd, ['rm', '-q', '.editorconfig']);
    git(cwd, ['commit', '-q', '-m', 'delete']);
    expect(checks()).toEqual({ full: true, reason: '.editorconfig を変えた' });
    git(cwd, ['reset', '-q', '--hard', base]);
    writeFileSync(join(cwd, 'a.ts'), 'export const a = 1;\n');
    git(cwd, ['commit', '-q', '-am', 'edit']);
    expect(checks()).toEqual({ full: false, format: ['a.ts'], lint: ['a.ts'] });
  });

  it('checks a renamed file by its new path only, and every file when a file is renamed to a setting', () => {
    const { cwd, base } = baseRepo({ 'a.ts': 'export const a = 1;\n', 'notes.md': '# notes\n', 'rc.json': '{}\n' });
    const exists = (path: string) => existsSync(join(cwd, path));
    const checks = () => branchChangedChecks(base, (args) => git(cwd, args), exists);
    // 前のパスは消えたファイルなので見ない。拡張子が替われば lint も替わる
    mkdirSync(join(cwd, 'src'));
    git(cwd, ['mv', 'a.ts', 'src/b.ts']);
    git(cwd, ['mv', 'notes.md', 'notes.ts']);
    git(cwd, ['commit', '-q', '-m', 'rename']);
    expect(checks()).toEqual({ full: false, format: ['notes.ts', 'src/b.ts'], lint: ['notes.ts', 'src/b.ts'] });
    git(cwd, ['reset', '-q', '--hard', base]);
    git(cwd, ['mv', 'rc.json', '.prettierrc.json']);
    git(cwd, ['commit', '-q', '-m', 'rename to a setting']);
    expect(checks()).toEqual({ full: true, reason: '.prettierrc.json を変えた' });
  });
});

describe('checkSteps', () => {
  const ci = 'npm run format:check && npm run lint && npm run typecheck && npm test && npm run build';

  it('takes the steps of npm run ci but the format and the lint', () => {
    const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(checkSteps(manifest.scripts['ci']!)).toEqual(['typecheck', 'test', 'build']);
    expect(checkSteps(`${ci} && npm run records:check`)).toEqual(['typecheck', 'test', 'build', 'records:check']);
  });

  it('stops on a step it cannot run by name, or when the format or the lint is gone', () => {
    expect(() => checkSteps(`${ci} && tsc -b`)).toThrow('tsc -b');
    expect(() => checkSteps('npm run lint && npm test')).toThrow('format:check');
    expect(() => checkSteps(undefined)).toThrow('npm run ci の段が無い');
  });
});

describe('oversizedDocs', () => {
  const sizes: Record<string, number> = {
    'plan/captures/guide.md': 50_001,
    'plan/design-x.md': 50_000,
    'records/verifications/V-0001-a.md': 30_001,
    'records/verifications/README.md': 40_000,
    'plan/claims.md': 900_000,
    'tools/big.ts': 90_000,
  };
  const sizeOf = (p: string) => sizes[p];

  it('lists hand-written markdown over 50KB, and verifications over 30KB', () => {
    expect(oversizedDocs(Object.keys(sizes), ['plan/claims.md'], sizeOf)).toEqual([
      { path: 'plan/captures/guide.md', size: 50_001, limit: 50_000 },
      { path: 'records/verifications/V-0001-a.md', size: 30_001, limit: 30_000 },
    ]);
  });

  it('skips files the branch deleted', () => {
    expect(oversizedDocs(['plan/gone.md'], [], sizeOf)).toEqual([]);
  });

  it('reads the branch with git and warns on a renamed document by its new path', () => {
    const big = (c: string) => `${c.repeat(DOC_SIZE_LIMIT)}\n`;
    const { cwd, base } = baseRepo({ 'plan/old.md': big('x'), 'plan/gone.md': big('y'), 'plan/generated.md': '' });
    git(cwd, ['mv', 'plan/old.md', 'plan/new.md']);
    git(cwd, ['rm', '-q', 'plan/gone.md']);
    writeFileSync(join(cwd, 'plan', 'generated.md'), big('z'));
    git(cwd, ['commit', '-q', '-am', 'rename']);
    const size = (p: string) => (existsSync(join(cwd, p)) ? readFileSync(join(cwd, p)).length : undefined);
    expect(branchOversizedDocs(base, (args) => git(cwd, args), ['plan/generated.md'], size)).toEqual([
      { path: 'plan/new.md', size: DOC_SIZE_LIMIT + 1, limit: DOC_SIZE_LIMIT },
    ]);
  });
});

describe('longNewGuideItems', () => {
  const long = (c: string) => `- ${c.repeat(GUIDE_ITEM_LIMIT)}`;
  // 1: 見出し・3: 冒頭の項目・5: 節の見出し・7 から: 本文の項目
  const guide = (...items: string[]) => `# 手引き\n\n${long('h')}\n\n## 節\n\n${items.join('\n')}\n`;
  const all = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

  it('lists added body items over the limit, by bytes', () => {
    const fits = `- ${'あ'.repeat(199)}`; // 2 + 597 バイト
    const over = `- ${'あ'.repeat(200)}`;
    expect(longNewGuideItems(guide(fits, over, '- short'), all)).toEqual([
      `plan/captures/guide.md:8: ${short(over)}（602 バイト）`,
    ]);
  });

  it('skips long items the branch did not add, and the lead before the first section', () => {
    expect(longNewGuideItems(guide(long('o'), long('n')), new Set([3, 8]))).toEqual([
      `plan/captures/guide.md:8: ${short(long('n'))}（${GUIDE_ITEM_LIMIT + 2} バイト）`,
    ]);
  });
});
