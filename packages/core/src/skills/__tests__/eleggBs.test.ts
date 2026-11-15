// エレグ：ブーム・アンド・ショック編（plan/design-elegg-bs.md 2 節）: 味方全体の命中（teamHit）、自分の状態の窓で数える回数
// （during: { state }）をカウンタの増減・倍率ダメージ・解除に開いたこと、カウンタの減少の下限（floor）の語彙の検証と解決
import { describe, expect, it } from 'vitest';
import { characterOf, rawDefinition } from '../../__tests__/teamHelpers.ts';
import { MAX_SKILL_LEVELS, resolveCounterChanges } from '../resolve.ts';
import { parseSkillDefinition } from '../types.ts';

type Effects = { effects: Record<string, unknown>[] };
type Raw = { skills: { skill1: Effects; skill2: Effects; burst: Effects } };
const ELEGG_BS = 502;
const raw = rawDefinition<Raw>(ELEGG_BS);
const character = characterOf(ELEGG_BS);

const patched = (slot: keyof Raw['skills'], index: number, patch: Record<string, unknown>) => {
  const copy = structuredClone(raw);
  copy.skills[slot].effects[index] = { ...copy.skills[slot].effects[index], ...patch };
  return () => parseSkillDefinition(copy);
};
const added = (slot: keyof Raw['skills'], effect: Record<string, unknown>) => {
  const copy = structuredClone(raw);
  copy.skills[slot].effects.push(effect);
  return () => parseSkillDefinition(copy);
};
const indexOf = (slot: keyof Raw['skills'], match: (e: Record<string, unknown>) => boolean) =>
  raw.skills[slot].effects.findIndex(match);
const CAPTURE = indexOf('skill1', (e) => e.kind === 'counterChange');
const RELEASE = indexOf('skill1', (e) => e.kind === 'removeState');
const S2_DAMAGE = indexOf('skill2', (e) => e.kind === 'damage');
const BURST_DOWN = indexOf('burst', (e) => e.kind === 'counterChange' && e.floor !== undefined);
const window = { count: 'teamHit', everyRef: 2, during: { state: 'ghostPossession' } };

describe('語彙の検証', () => {
  it('accepts the definition', () => {
    expect(() => parseSkillDefinition(raw)).not.toThrow();
  });

  it('takes teamHit only with a counting window of an own state', () => {
    expect(patched('skill1', CAPTURE, { trigger: { count: 'teamHit', everyRef: 2 } })).toThrow(
      /teamHit count needs a counting window of a state/,
    );
    expect(
      added('skill2', {
        kind: 'timed',
        trigger: { count: 'teamHit', every: 100 },
        target: 'self',
        stat: 'attack',
        ref: 1,
        durationRef: 2,
      }),
    ).toThrow(/teamHit/);
  });

  it('takes a counting window of an own state on counterChange, damage and removeState, with a grant of the state', () => {
    const other = { ...window, during: { state: 'modeB' } };
    expect(patched('skill1', CAPTURE, { trigger: other })).toThrow(/needs a grant of the same state on self/);
    expect(patched('skill1', RELEASE, { trigger: other })).toThrow(/needs a grant of the same state on self/);
    expect(patched('skill2', S2_DAMAGE, { trigger: { ...other, everyRef: undefined, every: 100 } })).toThrow(
      /needs a grant of the same state on self/,
    );
    // カウンタの増減と解除は、フルバーストの窓では数えない（自分の状態の窓だけ）
    const fullBurst = { count: 'normalHit', every: 100, during: 'fullBurst', reset: 'never' };
    expect(patched('skill1', CAPTURE, { trigger: fullBurst })).toThrow(/only a counting window of a state/);
    expect(patched('skill1', RELEASE, { trigger: fullBurst })).toThrow(/only a counting window of a state/);
  });

  it('takes floor only with decrease, as a positive integer', () => {
    expect(patched('burst', BURST_DOWN, { decrease: undefined })).toThrow(/floor needs decrease/);
    expect(patched('burst', BURST_DOWN, { floor: 0 })).toThrow(/floor/);
    expect(patched('burst', BURST_DOWN, { floor: 1.5 })).toThrow(/floor/);
  });
});

describe('解決', () => {
  const definition = parseSkillDefinition(raw);
  const changes = resolveCounterChanges(definition, character, MAX_SKILL_LEVELS);

  it('resolves the capture as 1 per 100 hits of all allies during Possession', () => {
    const capture = changes.find((c) => c.source.skill === 'skill1')!;
    expect(capture.trigger).toEqual({ count: 'teamHit', every: 100, during: { state: 'ghostPossession' } });
    expect(capture.amount).toBe(1);
  });

  it('resolves the burst decreases: 6 keeping at least 1 below 13, and 9 at 13', () => {
    const burst = changes.filter((c) => c.source.skill === 'burst');
    expect(burst.map((c) => [c.amount, c.decrease, c.floor, c.condition?.selfCounter])).toEqual([
      [6, true, 1, { counter: 'ghostCapture', below: 13 }],
      [9, true, undefined, { counter: 'ghostCapture', atLeast: 13 }],
    ]);
  });
});
