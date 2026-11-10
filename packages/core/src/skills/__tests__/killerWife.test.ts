// キラーワイフ編（plan/design-killer-wife.md 2 節・10 節）: 貫通特化の発数の維持と、「〈状態〉の対象に命中させた味方に」（timed の
// holderHit）の語彙の検証・解決・件の作り方
import { describe, expect, it } from 'vitest';
import { characterOf, rawDefinition } from '../../__tests__/teamHelpers.ts';
import { gameSecondsToFrames } from '../../time.ts';
import { MAX_SKILL_LEVELS, resolveTimed } from '../resolve.ts';
import { holderHitStarts } from '../timeline.ts';
import { parseSkillDefinition } from '../types.ts';

type Effects = { effects: Record<string, unknown>[] };
const KILLER_WIFE = 43;
const raw = rawDefinition<{ skills: { skill1: Effects; skill2: Effects; burst: Effects } }>(KILLER_WIFE);
const character = characterOf(KILLER_WIFE);
const pierce = raw.skills.skill1.effects.findIndex((e) => e.stat === 'pierce');
const burstAtk = raw.skills.burst.effects.findIndex((e) => e.holderHit !== undefined);

const patched = (slot: 'skill1' | 'burst', index: number, patch: Record<string, unknown>) => {
  const copy = structuredClone(raw);
  copy.skills[slot].effects[index] = { ...copy.skills[slot].effects[index], ...patch };
  return () => parseSkillDefinition(copy);
};

describe('語彙の検証', () => {
  it('accepts the definition', () => {
    expect(() => parseSkillDefinition(raw)).not.toThrow();
  });

  it('takes a duration in shots for Pierce, but not for the other flag stats', () => {
    expect(patched('skill1', pierce, {})).not.toThrow();
    expect(patched('skill1', pierce, { stat: 'infiniteAmmo' })).toThrow(/a duration in shots is not supported/);
  });

  it('takes holderHit only with a duration in seconds on self or allies, without stacks, conditions or delays', () => {
    expect(patched('burst', burstAtk, { holderHit: { withinRef: 3, extra: 1 } })).toThrow(/expected \{ withinRef \}/);
    expect(patched('burst', burstAtk, { target: 'topAttack', targetCount: 1 })).toThrow(
      /only allowed with target "self" or "allies"/,
    );
    expect(
      patched('burst', burstAtk, {
        durationRef: undefined,
        durationShots: 1,
        stat: 'attackDamage',
        scaling: undefined,
      }),
    ).toThrow(/holderHit needs a duration in seconds/);
    expect(patched('burst', burstAtk, { maxStacks: 2 })).toThrow(/holderHit cannot be combined with maxStacks/);
    expect(
      patched('burst', burstAtk, { condition: { inFullBurst: true }, stat: 'attackDamage', scaling: undefined }),
    ).toThrow(/holderHit cannot be combined with condition/);
    expect(
      patched('burst', burstAtk, {
        trigger: { count: 'normalShot', chance: 50 },
        stat: 'attackDamage',
        scaling: undefined,
      }),
    ).toThrow(/holderHit cannot be combined with a chance trigger/);
  });
});

describe('解決', () => {
  const resolved = resolveTimed(parseSkillDefinition(raw), character, MAX_SKILL_LEVELS);

  it('resolves Pierce for one shot', () => {
    expect(resolved.find((e) => e.stat === 'pierce')).toMatchObject({ durationShots: 1, durationFrames: 0 });
  });

  it('resolves holderHit into frames of the Wipe Out duration', () => {
    const atk = resolved.find((e) => e.holderHitWithinFrames !== undefined);
    expect(atk).toMatchObject({
      stat: 'attack',
      scaling: 'casterAttack',
      holderHitWithinFrames: gameSecondsToFrames(10),
      durationFrames: gameSecondsToFrames(10),
    });
  });
});

describe('holderHitStarts', () => {
  it('starts on the frame after the holder’s first shot from the fire (a shot on the fire frame counts)', () => {
    expect(holderHitStarts([100], [90, 150, 230, 400], 587)).toEqual([151]);
    expect(holderHitStarts([100], [100], 587)).toEqual([101]);
  });

  it('drops a fire without a shot before the Wipe Out ends', () => {
    expect(holderHitStarts([100, 300], [90, 687, 700], 587)).toEqual([688]);
  });
});
