// 2026-10-29 のアップデートのキャラの語彙（plan/design-new-chars-1029.md 5 節）。使い手（マリアン：クイーン・ラプンツェル：サンクチュアリ・
// 紅蓮：神殺）の定義は CDN に載ってから書くので、ここでは語彙の検証と解決だけを見る
import { describe, expect, it } from 'vitest';
import { makeCharacter } from '../../__tests__/fixtures.ts';
import { fixedTargetsOf } from '../composition.ts';
import { parseSkillDefinition } from '../types.ts';

function definitionWith(effect: Record<string, unknown>): unknown {
  const empty = { effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] };
  return {
    formatVersion: 1,
    resourceId: 1,
    checkedAt: '2026-10-28',
    skills: { skill1: { effects: [effect] }, skill2: empty, burst: empty },
  };
}

const effectOf = (effect: Record<string, unknown>) =>
  parseSkillDefinition(definitionWith(effect)).skills.skill1.effects[0]!;

describe('5.1 「自分と〈状態〉の味方」（includeSelf）', () => {
  const timed = {
    kind: 'timed',
    trigger: 'fullBurstStart',
    target: 'allies',
    stat: 'attackDamage',
    ref: 1,
    durationRef: 2,
    targetState: 'persona',
  };
  const slots = [makeCharacter(), makeCharacter(), makeCharacter(), makeCharacter()];
  const states = [[], ['persona' as const], [], ['persona' as const]];

  it('adds the own slot to the slots holding the state', () => {
    expect(fixedTargetsOf(effectOf(timed), slots, 0, states)).toEqual([1, 3]);
    expect(fixedTargetsOf(effectOf({ ...timed, includeSelf: true }), slots, 0, states)).toEqual([0, 1, 3]);
    // 自分が状態を持っていても 1 回だけ
    expect(fixedTargetsOf(effectOf({ ...timed, includeSelf: true }), slots, 1, states)).toEqual([1, 3]);
  });

  it('also works on a state grant', () => {
    const grant = { kind: 'state', state: 'followUp', trigger: 'burstUse', target: 'allies', durationRef: 2 };
    expect(fixedTargetsOf(effectOf({ ...grant, targetState: 'persona', includeSelf: true }), slots, 2, states)).toEqual(
      [1, 2, 3],
    );
  });

  it('matches every state of a family when targetState is the root', () => {
    // 家族の根（barrier）は家族のどの状態にも当たる（いまの家族の状態は根だけ）
    const barrier = [['barrier' as const], [], [], []];
    expect(fixedTargetsOf(effectOf({ ...timed, targetState: 'barrier' }), slots, 3, barrier)).toEqual([0]);
  });

  it('is only allowed as true with targetState, on timed and state grants', () => {
    expect(() => parseSkillDefinition(definitionWith({ ...timed, targetState: undefined, includeSelf: true }))).toThrow(
      /includeSelf: only allowed with targetState/,
    );
    expect(() => parseSkillDefinition(definitionWith({ ...timed, includeSelf: false }))).toThrow(
      /includeSelf: must be true/,
    );
    expect(() =>
      parseSkillDefinition(
        definitionWith({ kind: 'passive', target: 'allies', stat: 'attack', ref: 1, includeSelf: true }),
      ),
    ).toThrow(/includeSelf is only allowed in timed and state/);
  });
});

describe('5.2・5.4 damage の hitsRef・hitIntervalFrames・coreHit の検証', () => {
  const damage = { kind: 'damage', trigger: { everySeconds: 4 }, ref: 1, damageType: 'skill' };

  it('reads the hits, the interval and the core hit', () => {
    expect(effectOf({ ...damage, hitsRef: 2, hitIntervalFrames: 5, coreHit: true })).toMatchObject({
      hitsRef: 2,
      hitIntervalFrames: 5,
      coreHit: true,
    });
  });

  it('rejects hits on shot count triggers and with perBurstHit, and an interval without hits', () => {
    expect(() => effectOf({ ...damage, trigger: { count: 'normalShot', every: 2 }, hitsRef: 2 })).toThrow(
      /hitsRef cannot be used with a shot count trigger/,
    );
    expect(() => effectOf({ ...damage, trigger: 'burstUse', perBurstHit: true, hitsRef: 2 })).toThrow(
      /hitsRef cannot be used with perBurstHit/,
    );
    expect(() => effectOf({ ...damage, hitIntervalFrames: 5 })).toThrow(/hitIntervalFrames needs hitsRef/);
    for (const n of [-1, 1.5, '5']) {
      expect(() => effectOf({ ...damage, hitsRef: 2, hitIntervalFrames: n })).toThrow(/hitIntervalFrames/);
    }
    expect(() => effectOf({ ...damage, coreHit: false })).toThrow(/coreHit: expected true/);
  });
});
