// クエンシー：エスケープクイーン編（plan/design-quency-eq.md 2 節の論点 3）: 条件 selfState の sameFiring（同じ発火で前に書いた付与が付ける
// 分も数える）の読み込みの検査。同じ発火で上の段階が付くことは、編成のテスト（__tests__/quencyEscapeQueenTeam.test.ts）が見る
import { describe, expect, it } from 'vitest';
import { parseSkillDefinition } from '../types.ts';

const empty = { effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] };
const parse = (effects: Record<string, unknown>[]) =>
  parseSkillDefinition({
    formatVersion: 1,
    resourceId: 1,
    checkedAt: '2026-11-10',
    skills: { skill1: { effects }, skill2: empty, burst: empty },
  });
const trigger = { count: 'normalShot', every: 2 };
const stage = (state: string, extra: Record<string, unknown> = {}) => ({
  kind: 'state',
  state,
  trigger,
  target: 'self',
  maxStacks: 10,
  durationSeconds: 1,
  contents: [{ stat: 'attack', ref: 1 }],
  ...extra,
});
const onLower = (sameFiring: unknown = true, stacks: unknown = 'full') => ({
  condition: { selfState: { state: 'exploreRouteStage1', stacks, sameFiring } },
});

describe('selfState.sameFiring', () => {
  it('reads on a grant after a grant of the looked-at state with the same trigger', () => {
    const def = parse([stage('exploreRouteStage1'), stage('exploreRouteStage2', onLower())]);
    const e = def.skills.skill1.effects[1]!;
    expect(e.kind === 'state' && e.condition?.selfState?.sameFiring).toBe(true);
  });

  it('rejects a value other than true and a condition without a stack count', () => {
    expect(() => parse([stage('exploreRouteStage1'), stage('exploreRouteStage2', onLower(false))])).toThrow(
      /sameFiring.*expected true/,
    );
    expect(() =>
      parse([
        stage('exploreRouteStage1'),
        stage('exploreRouteStage2', { condition: { selfState: { state: 'exploreRouteStage1', sameFiring: true } } }),
      ]),
    ).toThrow(/needs a stack count/);
  });

  it('needs an earlier grant of the state with the same trigger in the same slot', () => {
    expect(() => parse([stage('exploreRouteStage2', onLower()), stage('exploreRouteStage1')])).toThrow(
      /needs an earlier grant/,
    );
    expect(() =>
      parse([
        stage('exploreRouteStage1', { trigger: { count: 'normalShot', every: 3 } }),
        stage('exploreRouteStage2', onLower()),
      ]),
    ).toThrow(/needs an earlier grant/);
  });

  it('needs every grant of the state to share the trigger and refresh all stacks', () => {
    expect(() =>
      parse([
        stage('exploreRouteStage1'),
        {
          kind: 'state',
          state: 'exploreRouteStage1',
          trigger: 'burstUse',
          target: 'self',
          maxStacks: 10,
          durationSeconds: 1,
        },
        stage('exploreRouteStage2', onLower()),
      ]),
    ).toThrow(/same trigger and refresh all stacks/);
    expect(() =>
      parse([stage('exploreRouteStage1', { stackRefresh: 'each' }), stage('exploreRouteStage2', onLower())]),
    ).toThrow(/same trigger and refresh all stacks/);
  });

  it('is allowed only in a state grant', () => {
    expect(() =>
      parse([
        stage('exploreRouteStage1'),
        { kind: 'timed', trigger, target: 'self', stat: 'attack', ref: 1, durationSeconds: 1, ...onLower() },
      ]),
    ).toThrow(/only in a state grant/);
  });
});
