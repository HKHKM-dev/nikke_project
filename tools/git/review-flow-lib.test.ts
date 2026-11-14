// 見直しから自動マージの予約までを止めずに進めるフックの判定（plan/design-review-steps.md 3 節）。
import { describe, expect, it } from 'vitest';
import {
  FLOW_EXPIRY_MS,
  flowEvent,
  isReviewedCode,
  parseFlowState,
  parseNumstat,
  simplifyGate,
  stopDecision,
} from './review-flow-lib.ts';

describe('flowEvent', () => {
  it('starts on reviewing the branch and ends on reserving the auto-merge', () => {
    expect(flowEvent({ tool_name: 'Skill', tool_input: { skill: 'simplify' } })).toBe('start');
    expect(
      flowEvent({ tool_name: 'Skill', tool_input: { skill: 'code-review', args: 'medium origin/main...HEAD' } }),
    ).toBe('start');
    // PR の番号を対象にした見直しは今のブランチの作業ではない
    expect(flowEvent({ tool_name: 'Skill', tool_input: { skill: 'code-review', args: 'high 123' } })).toBeNull();
    expect(
      flowEvent({ tool_name: 'Skill', tool_input: { skill: 'code-review', args: 'medium --max-findings 5' } }),
    ).toBe('start');
    expect(flowEvent({ tool_name: 'Skill', tool_input: { skill: 'run' } })).toBeNull();
    expect(flowEvent({ tool_name: 'Bash', tool_input: { command: 'gh pr merge --auto --squash' } })).toBe('done');
    expect(flowEvent({ tool_name: 'Bash', tool_input: { command: 'gh pr create --fill' } })).toBeNull();
    expect(flowEvent({ tool_name: 'mcp__github__enable_pr_auto_merge', tool_input: {} })).toBe('done');
    expect(flowEvent({})).toBeNull();
  });
});

describe('stopDecision', () => {
  const state = { branch: 'claude/x', startedAt: 1_000 };
  const ctx = { branch: 'claude/x', now: 2_000 };

  it('blocks the end of a response between the review and the auto-merge on the same branch, once', () => {
    expect(stopDecision(state, ctx)).toBe('block');
    expect(stopDecision({ ...state, blocked: true }, ctx)).toBe('release');
  });

  it('does nothing without a mark, on another branch, or with a stale mark', () => {
    expect(stopDecision(null, ctx)).toBeNull();
    expect(stopDecision(state, { ...ctx, branch: 'claude/y' })).toBeNull();
    expect(stopDecision(state, { ...ctx, branch: null })).toBeNull();
    expect(stopDecision(state, { ...ctx, now: 1_000 + FLOW_EXPIRY_MS + 1 })).toBeNull();
  });
});

describe('parseFlowState', () => {
  it('reads a mark and ignores broken ones', () => {
    expect(parseFlowState('{"branch":"b","startedAt":5}')).toEqual({ branch: 'b', startedAt: 5 });
    expect(parseFlowState('{"branch":"b","startedAt":5,"blocked":true}')).toEqual({
      branch: 'b',
      startedAt: 5,
      blocked: true,
    });
    expect(parseFlowState('{"branch":"b"}')).toBeNull();
    expect(parseFlowState('nope')).toBeNull();
  });
});

describe('simplifyGate', () => {
  it('stops /simplify unless the branch adds a code file or more than 100 lines of code', () => {
    const file = (path: string, added: number, isNew = false) => ({ path, added, isNew });
    expect(simplifyGate([file('packages/core/src/a.ts', 60), file('tools/git/b.ts', 40)])).toContain('100 行以下');
    expect(simplifyGate([file('packages/core/src/a.ts', 101)])).toBeNull();
    expect(simplifyGate([file('apps/web/src/new.tsx', 5, true)])).toBeNull();
    // テスト・データ・文書は数えない
    expect(
      simplifyGate([
        file('packages/core/src/a.test.ts', 500, true),
        file('packages/core/data/skills/1.json', 300),
        file('plan/design-x.md', 200, true),
      ]),
    ).toContain('追加は 0 行');
  });

  it('reads git diff --numstat', () => {
    expect(parseNumstat('3\t1\ta.ts\n-\t-\timg.png\n')).toEqual(
      new Map([
        ['a.ts', 3],
        ['img.png', 0],
      ]),
    );
  });

  it('counts only non-test scripts under packages, apps and tools', () => {
    expect(isReviewedCode('tools/git/review-flow.ts')).toBe(true);
    expect(isReviewedCode('packages/core/src/records/__tests__/x.ts')).toBe(false);
    expect(isReviewedCode('records/claims/C-0001.json')).toBe(false);
  });
});
