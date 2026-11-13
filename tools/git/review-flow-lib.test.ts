// 見直しから自動マージの予約までを止めずに進めるフックの判定（plan/design-review-steps.md 3 節）。
import { describe, expect, it } from 'vitest';
import { FLOW_EXPIRY_MS, flowEvent, parseFlowState, stopDecision } from './review-flow-lib.ts';

describe('flowEvent', () => {
  it('starts on reviewing the branch and ends on reserving the auto-merge', () => {
    expect(flowEvent({ tool_name: 'Skill', tool_input: { skill: 'simplify' } })).toBe('start');
    expect(
      flowEvent({ tool_name: 'Skill', tool_input: { skill: 'code-review', args: 'medium origin/main...HEAD' } }),
    ).toBe('start');
    // PR の番号を対象にした見直しは今のブランチの作業ではない
    expect(flowEvent({ tool_name: 'Skill', tool_input: { skill: 'code-review', args: 'high 123' } })).toBeNull();
    expect(flowEvent({ tool_name: 'Skill', tool_input: { skill: 'run' } })).toBeNull();
    expect(flowEvent({ tool_name: 'Bash', tool_input: { command: 'gh pr merge --auto --squash' } })).toBe('done');
    expect(flowEvent({ tool_name: 'Bash', tool_input: { command: 'gh pr create --fill' } })).toBeNull();
    expect(flowEvent({ tool_name: 'mcp__github__enable_pr_auto_merge', tool_input: {} })).toBe('done');
    expect(flowEvent({})).toBeNull();
  });
});

describe('stopDecision', () => {
  const state = { branch: 'claude/x', startedAt: 1_000 };
  const ctx = { branch: 'claude/x', now: 2_000, stopHookActive: false };

  it('blocks the end of a response between the review and the auto-merge on the same branch', () => {
    expect(stopDecision(state, ctx)).toMatchObject({ decision: 'block' });
  });

  it('lets it end once blocked, without a mark, on another branch, or with a stale mark', () => {
    expect(stopDecision(state, { ...ctx, stopHookActive: true })).toBeNull();
    expect(stopDecision(null, ctx)).toBeNull();
    expect(stopDecision(state, { ...ctx, branch: 'claude/y' })).toBeNull();
    expect(stopDecision(state, { ...ctx, branch: null })).toBeNull();
    expect(stopDecision(state, { ...ctx, now: 1_000 + FLOW_EXPIRY_MS + 1 })).toBeNull();
  });
});

describe('parseFlowState', () => {
  it('reads a mark and ignores broken ones', () => {
    expect(parseFlowState('{"branch":"b","startedAt":5}')).toEqual({ branch: 'b', startedAt: 5 });
    expect(parseFlowState('{"branch":"b"}')).toBeNull();
    expect(parseFlowState('nope')).toBeNull();
  });
});
