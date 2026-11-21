// ギロチン：ウィンタースレイヤー（182）の語彙（plan/design-guillotine-ws.md 2.1〜2.4 節）: コアでない命中の回数（nonCoreHit）、
// 状態のスタック数のきっかけ（{ stateStacks }）とカウンタが上がった時のきっかけ（{ counterUp }）、timed の perCount { counter }、
// dot の stacksFrom { counter } の検証と解決
import { describe, expect, it } from 'vitest';
import { characterOf, rawDefinition } from '../../__tests__/teamHelpers.ts';
import { parseSkillDefinition } from '../parse/definition.ts';
import { MAX_SKILL_LEVELS, resolveCounterChanges, resolveTimed } from '../resolve.ts';
import { shotCountWeight } from '../triggers.ts';

type Effects = { effects: Record<string, unknown>[] };
type Raw = { skills: { skill1: Effects; skill2: Effects; burst: Effects } };
const WS = 182;
const raw = rawDefinition<Raw>(WS);

const patched = (slot: keyof Raw['skills'], index: number, patch: Record<string, unknown>): Raw => {
  const copy = structuredClone(raw);
  copy.skills[slot].effects[index] = { ...copy.skills[slot].effects[index], ...patch };
  return copy;
};
/** S1 の経験値のスタックのきっかけの counterChange・弾丸チャージ・有利コードの▲、バーストの持続ダメージの番号 */
const LEVEL_UP = 1;
const REFILL = 2;
const S1_ELEMENT = 4;
const DOT = 2;

describe('コアでない命中の回数', () => {
  it('counts the expected hits minus the expected core hits', () => {
    expect(
      shotCountWeight('nonCoreHit', { hits: 0.99, coreHits: 0.2, lastShot: false, fullCharge: false }),
    ).toBeCloseTo(0.79, 12);
    expect(shotCountWeight('nonCoreHit', { hits: 1, coreHits: 1, lastShot: false, fullCharge: false })).toBe(0);
  });
});

describe('語彙の検証', () => {
  it('accepts the definition', () => {
    expect(() => parseSkillDefinition(raw)).not.toThrow();
  });

  it('allows { stateStacks } only in counterChange, with a grant of the state on self', () => {
    expect(() =>
      parseSkillDefinition(patched('skill1', REFILL, { trigger: { stateStacks: 'exp', everyRef: 1 } })),
    ).toThrow(/only allowed in counterChange/);
    expect(() =>
      parseSkillDefinition(patched('skill1', LEVEL_UP, { trigger: { stateStacks: 'shootingManual', everyRef: 1 } })),
    ).toThrow(/needs a grant of the same state on self with stacks/);
    expect(() =>
      parseSkillDefinition(patched('skill1', LEVEL_UP, { trigger: { stateStacks: 'exp', every: 10 } })),
    ).toThrow(/every/);
  });

  it('allows { counterUp } only in ammoRefill, heal and timed', () => {
    expect(() =>
      parseSkillDefinition(patched('burst', DOT, { trigger: { counterUp: 'heroLevel' }, stacksFrom: undefined })),
    ).toThrow(/counterUp/);
    expect(() => parseSkillDefinition(patched('skill1', LEVEL_UP, { trigger: { counterUp: 'heroLevel' } }))).toThrow(
      /counterUp/,
    );
  });

  it('allows perCount { counter } on event triggers and { counterUp }, and durationUntil only with battleEnd', () => {
    expect(() =>
      parseSkillDefinition(patched('skill1', S1_ELEMENT, { trigger: { count: 'normalShot', every: 10 } })),
    ).toThrow(/perCount needs one of the triggers/);
    expect(() => parseSkillDefinition(patched('skill1', S1_ELEMENT, { trigger: 'burstUse' }))).not.toThrow();
    expect(() =>
      parseSkillDefinition(
        patched('skill1', S1_ELEMENT, { trigger: 'burstUse', perCount: { state: 'exp' }, durationUntil: 'battleEnd' }),
      ),
    ).toThrow(/perCount cannot be combined with durationUntil/);
    expect(() =>
      parseSkillDefinition(
        patched('skill1', S1_ELEMENT, { perCount: { counter: 'heroLevel' }, durationUntil: 'fullBurstEnd' }),
      ),
    ).toThrow(/perCount cannot be combined with durationUntil/);
  });

  it('accepts delayFrames on a burstUse dot only without gauge and state', () => {
    expect(() => parseSkillDefinition(patched('burst', DOT, { state: 'hacked' }))).toThrow(/delayFrames needs/);
    expect(() => parseSkillDefinition(patched('burst', DOT, { gaugeOnTick: true }))).toThrow(/delayFrames needs/);
    expect(() => parseSkillDefinition(patched('burst', DOT, { trigger: 'fullBurstStart' }))).toThrow(
      /delayFrames needs/,
    );
  });

  it('accepts stacksFrom { counter } on a dot and rejects an unknown counter', () => {
    expect(() =>
      parseSkillDefinition(patched('burst', DOT, { stacksFrom: { counter: 'heroLevel' }, copyEachTick: true })),
    ).not.toThrow();
    expect(() => parseSkillDefinition(patched('burst', DOT, { stacksFrom: { counter: 'level' } }))).toThrow(
      /stacksFrom\.counter/,
    );
  });
});

describe('解決', () => {
  const def = parseSkillDefinition(raw);
  const character = characterOf(WS);

  it('resolves the EXP stacks trigger to a step of 10', () => {
    const changes = resolveCounterChanges(def, character, MAX_SKILL_LEVELS);
    expect(changes.map((c) => [c.trigger, c.amount])).toEqual([
      ['battleStart', 1],
      [{ stateStacks: 'exp', step: 10 }, 1],
    ]);
  });

  it('resolves the S1 buffs as value per Hero Level, scaled by the counter', () => {
    const s1 = resolveTimed(def, character, MAX_SKILL_LEVELS).filter((e) => e.source.skill === 'skill1');
    expect(s1.map((e) => [e.stat, e.scaling, e.value, e.perCount, e.trigger])).toEqual([
      ['elementDamage', 'ratio', expect.closeTo(0.0116, 12), { counter: 'heroLevel' }, { counterUp: 'heroLevel' }],
      ['attack', 'casterAttack', expect.closeTo(0.0091, 12), { counter: 'heroLevel' }, { counterUp: 'heroLevel' }],
    ]);
  });
});
