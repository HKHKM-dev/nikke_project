// PR の前のリベースの決まりごと（plan/design-workflow-simplification-4.md 2 節）。git は、パスの一覧の読み方を見るところだけ一時のリポジトリで呼ぶ。
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  addedLines,
  branchChangedChecks,
  changedChecks,
  checkSteps,
  collisions,
  isCheckSetting,
  MAX_CHANGED_FILES,
  nulPaths,
  pathListArgs,
  progressCopies,
  rebaseOutcome,
  splitGenerated,
} from './pr-prep-lib.ts';

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

describe('progressCopies', () => {
  const all = (text: string) => new Set(text.split('\n').map((_, i) => i + 1));

  it('finds progress copied into backlog.md section 8, but not into the other sections', () => {
    const text = [
      '## 2. 撮影の案',
      '| 2-1 | x | V-0401 |',
      '## 8. 課題（設計書のあるもの）',
      '- 段の課題（2026-10-14 起票）→ 進行中: [design-a.md](design-a.md)',
      '- 段の課題（2026-10-14 起票）→ 段 13 は PR 1 を実装した（V-0546、C-0745）',
    ].join('\n');
    expect(progressCopies('plan/backlog.md', text, all(text))).toEqual([
      'plan/backlog.md:5: - 段の課題（2026-10-14 起票）→ 段 13 は PR 1 を実装した（V-0546、C-0745）',
    ]);
  });

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
  const git = (cwd: string, args: readonly string[]) =>
    execFileSync(
      'git',
      ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args],
      {
        cwd,
        encoding: 'utf8',
      },
    );

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
    const cwd = mkdtempSync(join(tmpdir(), 'pr-prep-'));
    git(cwd, ['init', '-q']);
    writeFileSync(join(cwd, '.prettierignore'), 'plan/residuals.md\n');
    writeFileSync(join(cwd, '.editorconfig'), 'root = true\n');
    writeFileSync(join(cwd, 'a.ts'), 'export {};\n');
    git(cwd, ['add', '.']);
    git(cwd, ['commit', '-q', '-m', 'base']);
    const base = git(cwd, ['rev-parse', 'HEAD']).trim();
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
