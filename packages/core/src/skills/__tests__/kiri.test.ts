// キリ（33）の語彙（plan/design-kiri.md 2 節）: 対象「〈絞り込み〉の味方 N 機」（timed の allies と targetCount / targetCountRef）
import { describe, expect, it } from 'vitest';
import { makeCharacter } from '../../__tests__/fixtures.ts';
import { characterOf, rawDefinition } from '../../__tests__/data.ts';
import type { CharacterData } from '../../types.ts';
import { fixedTargetsOf } from '../composition.ts';
import { parseSkillDefinition } from '../parse/definition.ts';
import { resolveTimed } from '../resolve.ts';
import { isEffectTarget } from '../targets.ts';

function definitionWith(effect: Record<string, unknown>): unknown {
  const emptySlot = { effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] };
  return {
    formatVersion: 1,
    resourceId: 1,
    checkedAt: '2026-11-28',
    skills: { skill1: { effects: [effect] }, skill2: emptySlot, burst: emptySlot },
  };
}

const effectOf = (effect: Record<string, unknown>) =>
  parseSkillDefinition(definitionWith(effect)).skills.skill1.effects[0]!;

const timed = {
  kind: 'timed',
  trigger: { count: 'fullChargeShot' },
  target: 'allies',
  targetClass: 'Defender',
  targetCount: 2,
  stat: 'attack',
  ref: 1,
  durationRef: 2,
};

const of = (cls: CharacterData['class']) => makeCharacter({}, { class: cls });
const defender = of('Defender');
const supporter = of('Supporter');
const attacker = of('Attacker');

describe('「〈絞り込み〉の味方 N 機」（allies と targetCount）', () => {
  it('lists the slots matching the filters in slot order (self included), skipping empty slots', () => {
    expect(fixedTargetsOf(effectOf(timed), [defender, supporter, null, defender, defender], 1)).toEqual([0, 3, 4]);
    expect(fixedTargetsOf(effectOf({ ...timed, targetClass: 'Supporter' }), [defender, supporter], 1)).toEqual([1]);
  });

  it('targets all candidates when there are N or fewer, and the first N slots when there are more', () => {
    const resolved = { target: 'allies' as const, targetClass: 'Defender' as const, targetCount: 2 };
    const hits = (characters: CharacterData[]) => {
      const fixedTargets = fixedTargetsOf(effectOf(timed), characters, 1)!;
      return characters.flatMap((c, i) => (isEffectTarget({ ...resolved, fixedTargets }, 1, i, c) ? [i] : []));
    };
    expect(hits([defender, supporter, attacker])).toEqual([0]);
    expect(hits([defender, supporter, defender])).toEqual([0, 2]);
    expect(hits([attacker, supporter, defender, defender, defender])).toEqual([2, 3]);
  });

  it('throws when fixedTargets is missing (the squad was not applied)', () => {
    const resolved = { target: 'allies' as const, targetClass: 'Defender' as const, targetCount: 2 };
    expect(() => isEffectTarget(resolved, 0, 0, defender)).toThrow(/needs fixedTargets/);
  });

  it('allows exactly one of targetCount and targetCountRef, without the other slot filters', () => {
    expect(effectOf(timed)).toMatchObject({ targetCount: 2 });
    const { targetCount: _n, ...noCount } = timed;
    expect(effectOf({ ...noCount, targetCountRef: 3 })).toMatchObject({ targetCountRef: 3 });
    expect(() => effectOf({ ...timed, targetCountRef: 3 })).toThrow(/exactly one of targetCount and targetCountRef/);
    expect(() => effectOf({ ...timed, targetCount: 0 })).toThrow(/targetCount/);
    for (const extra of [
      { targetSquad: 'same' },
      { targetLeftmost: true },
      { excludeSelf: 'always' },
      { targetAdjacent: true },
      { targetBurstStep: 'Step1' },
    ]) {
      expect(() => effectOf({ ...timed, ...extra })).toThrow(/cannot be combined/);
    }
  });

  it('is only allowed in timed', () => {
    const passive = {
      kind: 'passive',
      target: 'allies',
      targetClass: 'Defender',
      targetCount: 2,
      stat: 'attack',
      ref: 1,
    };
    expect(() => effectOf(passive)).toThrow(/targetCount is not allowed in passive/);
  });
});

describe('キリの定義（data/skills/33.json）', () => {
  const character = characterOf(33);
  const definition = parseSkillDefinition(rawDefinition(33));

  it('resolves N of S1 to 2 at every level, and S1 and the burst to Defender allies', () => {
    for (const level of [1, 10]) {
      const levels = { skill1: level, skill2: level, burst: level };
      const [s1, burst] = resolveTimed(definition, character, levels);
      expect(s1).toMatchObject({ target: 'allies', targetClass: 'Defender', targetCount: 2, scaling: 'casterAttack' });
      expect(burst).toMatchObject({ target: 'allies', targetClass: 'Defender', stat: 'critRate' });
      expect(burst!.targetCount).toBeUndefined();
    }
  });

  it('takes the Lv1 and Lv10 values from the description', () => {
    const at = (level: number) =>
      resolveTimed(definition, character, { skill1: level, skill2: level, burst: level }).map((e) => e.value);
    const close = (actual: number[], expected: number[]) =>
      expected.forEach((v, i) => expect(actual[i]).toBeCloseTo(v, 12));
    close(at(1), [0.0343, 0.1176]);
    close(at(10), [0.0581, 0.199]);
  });
});
