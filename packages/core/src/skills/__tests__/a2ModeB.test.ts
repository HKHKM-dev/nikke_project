// A2 の B モード編（plan/design-hp-down-interval.md 2 節）: 状態の付いた時から数える周期の現在の HP▼（currentHpDown の since）と、
// HP の割合で解除される状態の付与（durationUntil: { selfHpAtMostRef }）の語彙の検証と解決
import { describe, expect, it } from 'vitest';
import { characterOf, rawDefinition } from '../../__tests__/teamHelpers.ts';
import { MAX_SKILL_LEVELS, resolveInstant, resolveStateContents, resolveStateGrants } from '../resolve.ts';
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

// 射撃の姿勢の長さの倍率（plan/design-a2-bmode-stance.md 3.1 節）: 説明文に無い定数を value で書く。自分にだけ・0 より大きく 1 以下
describe('射撃の姿勢の長さの倍率', () => {
  const scaleIndex = (raw.skills.burst.effects[grant] as { contents: { stat: string }[] }).contents.findIndex(
    (c) => c.stat === 'fireStanceScale',
  );
  const withScale = (item: Record<string, unknown>) => {
    const copy = structuredClone(raw);
    const g = copy.skills.burst.effects[grant] as { contents: Record<string, unknown>[] };
    g.contents[scaleIndex] = item;
    return () => parseSkillDefinition(copy);
  };

  it('takes a constant value in (0, 1] on self, without ref or scaling', () => {
    expect(scaleIndex).toBeGreaterThanOrEqual(0);
    expect(withScale({ stat: 'fireStanceScale', value: 1 })).not.toThrow();
    expect(withScale({ stat: 'fireStanceScale', value: 0 })).toThrow(/expected a positive finite number/);
    expect(withScale({ stat: 'fireStanceScale', value: 1.5 })).toThrow(/expected at most 1/);
    expect(withScale({ stat: 'fireStanceScale', ref: 4 })).toThrow(/write value, not ref/);
    expect(withScale({ stat: 'fireStanceScale', value: 0.5, scaling: 'ratio' })).toThrow(/takes no scaling/);
    expect(withScale({ stat: 'chargeSpeed', value: 0.5 })).toThrow(/value is only allowed for fireStanceScale/);
  });

  it('is only on self in timed', () => {
    const timed = (target: string) => {
      const copy = structuredClone(raw);
      copy.skills.burst.effects.push({
        kind: 'timed',
        trigger: 'burstUse',
        target,
        stat: 'fireStanceScale',
        value: 0.5,
        durationSeconds: 5,
      });
      return () => parseSkillDefinition(copy);
    };
    expect(timed('self')).not.toThrow();
    expect(timed('allies')).toThrow(/only allowed with target "self"/);
  });

  it('takes no perCount and cannot be read as a buff state', () => {
    const copy = structuredClone(raw);
    copy.skills.burst.effects.push({
      kind: 'timed',
      trigger: 'burstUse',
      target: 'self',
      stat: 'fireStanceScale',
      value: 0.5,
      durationSeconds: 5,
      perCount: { state: 'modeB' },
    });
    expect(() => parseSkillDefinition(copy)).toThrow(/cannot have perCount/);
    const buffed = structuredClone(raw);
    buffed.skills.burst.effects.push({
      kind: 'timed',
      trigger: 'burstUse',
      target: 'self',
      stat: 'attack',
      ref: 3,
      durationSeconds: 5,
      condition: { selfBuffed: 'fireStanceScale' },
    });
    expect(() => parseSkillDefinition(buffed)).toThrow(/a multiplier, not a buff state/);
  });

  it('is not allowed in passive', () => {
    const copy = structuredClone(raw);
    copy.skills.skill1.effects.push({ kind: 'passive', target: 'self', stat: 'fireStanceScale', value: 0.5 });
    expect(() => parseSkillDefinition(copy)).toThrow(/only allowed in timed/);
  });

  it('resolves the constant as is (0.5) while Mode B', () => {
    const items = resolveStateContents(parseSkillDefinition(raw), character, MAX_SKILL_LEVELS).filter(
      (c) => c.stat === 'fireStanceScale',
    );
    expect(items.map((c) => [c.value, c.whileState])).toEqual([[0.5, 'modeB']]);
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
