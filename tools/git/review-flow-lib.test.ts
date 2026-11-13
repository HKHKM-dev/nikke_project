// 見直しから PR までを止めずに進めるフックの判定（plan/design-review-steps.md 3 節）。
import { describe, expect, it } from 'vitest';
import { BLOCK_REASON, FLOW_EXPIRY_MS, flowEvent, parseFlowState, stopDecision } from './review-flow-lib.ts';

describe('flowEvent', () => {
  it('starts on the review skills and ends on creating a PR', () => {
    expect(flowEvent({ tool_name: 'Skill', tool_input: { skill: 'simplify' } })).toBe('start');
    expect(flowEvent({ tool_name: 'Skill', tool_input: { skill: 'code-review' } })).toBe('start');
    expect(flowEvent({ tool_name: 'Skill', tool_input: { skill: 'run' } })).toBeNull();
    expect(flowEvent({ tool_name: 'Bash', tool_input: { command: 'gh pr create --fill' } })).toBe('done');
    expect(flowEvent({ tool_name: 'Bash', tool_input: { command: 'gh pr view 12' } })).toBeNull();
    expect(flowEvent({ tool_name: 'mcp__github__create_pull_request', tool_input: {} })).toBe('done');
    expect(flowEvent({})).toBeNull();
  });
});

describe('stopDecision', () => {
  const state = { branch: 'claude/x', startedAt: 1_000 };
  const ctx = { branch: 'claude/x', now: 2_000, stopHookActive: false };

  it('blocks the end of a response between the review and the PR on the same branch', () => {
    expect(stopDecision(state, ctx)).toEqual({ decision: 'block', reason: BLOCK_REASON });
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
    expect(parseFlowState(null)).toBeNull();
  });
});
