// PR の前のリベースの決まりごと（plan/design-workflow-simplification-4.md 2 節）。git は呼ばない。
import { describe, expect, it } from 'vitest';
import {
  addedLines,
  collisions,
  progressCopies,
  rebaseOutcome,
  regenerateScript,
  splitConflicts,
} from './pr-prep-lib.ts';

const GENERATED = ['plan/claims.md', 'plan/residuals.md', 'records/minimal/sensitivity.json'];
const SENSITIVITY = 'records/minimal/sensitivity.json';

describe('splitConflicts', () => {
  it('takes only the generated files, and leaves the rest to a person', () => {
    expect(splitConflicts(['plan/claims.md', 'plan/backlog.md'], GENERATED)).toEqual({
      generated: ['plan/claims.md'],
      other: ['plan/backlog.md'],
    });
    expect(splitConflicts(['plan/residuals.md'], GENERATED).other).toEqual([]);
  });
});

describe('regenerateScript', () => {
  it('recomputes the sensitivity when the branch changed it or it conflicted', () => {
    expect(regenerateScript([SENSITIVITY, 'plan/claims.md'], [], SENSITIVITY)).toBe('records:minimal');
    expect(regenerateScript([], [SENSITIVITY], SENSITIVITY)).toBe('records:minimal');
    expect(regenerateScript(['plan/claims.md'], ['plan/claims.md'], SENSITIVITY)).toBe('records:check');
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
