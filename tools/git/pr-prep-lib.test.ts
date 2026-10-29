// PR の前のリベースの決まりごと（plan/design-workflow-simplification-4.md 2 節）。git は呼ばない。
import { describe, expect, it } from 'vitest';
import { collisions, rebaseOutcome, regenerateScript, splitConflicts } from './pr-prep-lib.ts';

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
