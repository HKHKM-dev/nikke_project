// A2 の B モード編（plan/design-hp-down-interval.md 2 節）: 状態の付いた時から数える周期の現在の HP▼（currentHpDown の since）と、
// HP の割合で解除される状態の付与（durationUntil: { selfHpAtMostRef }）の語彙の検証と解決
import { describe, expect, it } from 'vitest';
import { characterOf, rawDefinition } from '../../__tests__/teamHelpers.ts';
import { MAX_SKILL_LEVELS, resolveInstant, resolveStateGrants } from '../resolve.ts';
import { parseSkillDefinition } from '../types.ts';

type Effects = { effects: Record<string, unknown>[] };
const A2 = 811;
const raw = rawDefinition<{ skills: { skill1: Effects; skill2: Effects; burst: Effects } }>(A2);
const character = characterOf(A2);
const grant = raw.skills.burst.effects.findIndex((e) => e.kind === 'state');
const hpDown = raw.skills.burst.effects.findIndex((e) => e.kind === 'currentHpDown');

const patched = (index: number, patch: Record<string, unknown>) => {
  const copy = structuredClone(raw);
  copy.skills.burst.effects[index] = { ...copy.skills.burst.effects[index], ...patch };
  return () => parseSkillDefinition(copy);
};

describe('語彙の検証', () => {
  it('accepts the definition', () => {
    expect(() => parseSkillDefinition(raw)).not.toThrow();
  });

  it('takes the HP-drop end only on an unstacked grant on self without a condition', () => {
    expect(patched(grant, { target: 'allies' })).toThrow(/until the HP drops is only on "self"/);
    expect(patched(grant, { maxStacks: 3 })).toThrow(/until the HP drops cannot stack/);
    expect(patched(grant, { condition: { inFullBurst: true } })).toThrow(/until the HP drops cannot have a condition/);
    // 発火のフレームの HP の割合を見るのは段 1 の戦闘中の発火だけ
    expect(patched(grant, { trigger: 'battleStart' })).toThrow(/cannot be on battleStart/);
    expect(patched(grant, { trigger: { count: 'normalHit', chance: 30 } })).toThrow(
      /cannot be on battleStart, a chance trigger/,
    );
    expect(patched(grant, { durationUntil: { selfHpAtMostRef: 1, counterEmpty: 'battery' } })).toThrow(/unknown field/);
  });

  it('takes the period since a state on currentHpDown, with atStart, only for an own state', () => {
    expect(patched(hpDown, { trigger: { everySeconds: 1, since: { applied: 'modeB' } } })).not.toThrow();
    expect(patched(hpDown, { trigger: { everySeconds: 1, atStart: true, since: { applied: 'warmUp' } } })).toThrow(
      /needs a grant of the same state on self/,
    );
    expect(patched(hpDown, { trigger: { count: 'burstUse', atLeast: 1, since: { applied: 'modeB' } } })).toThrow(
      /since needs a timer trigger/,
    );
    expect(patched(hpDown, { trigger: { everySeconds: 1, atStart: true } })).toThrow(/a timer trigger/);
  });

  it('keeps atStart off the period since a state on counterChange', () => {
    const copy = structuredClone(raw);
    copy.skills.burst.effects.push({
      kind: 'counterChange',
      counter: 'battery',
      trigger: { everySeconds: 1, atStart: true, since: { applied: 'modeB' } },
      target: 'self',
      amount: 1,
    });
    expect(() => parseSkillDefinition(copy)).toThrow(/atStart/);
  });
});

describe('解決', () => {
  const definition = parseSkillDefinition(raw);

  it('resolves the HP-drop end into the ratio of the Lv value, lasting until the battle ends otherwise', () => {
    const g = resolveStateGrants(definition, character, MAX_SKILL_LEVELS).find((x) => x.state === 'modeB');
    expect(g?.untilSelfHpAtMost).toBe(0.4);
    expect(g?.untilCounterEmpty).toBeUndefined();
  });

  it('resolves the current HP down every second since Mode B, from the frame it is applied', () => {
    const effect = resolveInstant(definition, character, MAX_SKILL_LEVELS).find((e) => e.kind === 'currentHpDown');
    expect(effect?.target).toBe('self');
    expect(effect?.value).toBeCloseTo(0.0399, 12);
    expect(effect?.trigger).toEqual({ everySeconds: 1, atStart: true, since: { applied: 'modeB' } });
  });
});
