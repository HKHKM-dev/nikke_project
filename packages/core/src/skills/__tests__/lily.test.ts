// リリー（852）の語彙（plan/design-lily.md 2 節）: 対象「ランダムな味方 N 機」（timed の allies と targetCount と targetRandom）
import { describe, expect, it } from 'vitest';
import { characterOf, rawDefinition } from '../../__tests__/data.ts';
import { makeCharacter } from '../../__tests__/fixtures.ts';
import { fixedSlot, fixedTeam } from '../../__tests__/teamHelpers.ts';
import type { CharacterData } from '../../types.ts';
import { applyComposition, applyCompositionToTeam, fixedTargetsOf } from '../composition.ts';
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
  trigger: 'burstUse',
  target: 'allies',
  targetCount: 1,
  targetRandom: true,
  stat: 'attack',
  scaling: 'casterAttack',
  ref: 1,
  durationRef: 2,
};

const someone = makeCharacter({});
const LILY = 852;
const LUDMILLA = 190;
const lily = characterOf(LILY);
const definition = parseSkillDefinition(rawDefinition(LILY));
const levels = { skill1: 10, skill2: 10, burst: 10 };

/** 編成 characters の selfIndex の枠のリリーの、バーストの攻撃力▲（解決済み） */
function burstUpIn(characters: (CharacterData | null)[], selfIndex: number) {
  const composed = applyComposition(definition, characters, selfIndex);
  return resolveTimed(composed, lily, levels).find((e) => e.source.skill === 'burst')!;
}

/** ルドミラ（1 枠目）・リリー（2 枠目）の編成で、randomTargetSlot を pin にして組み立てたリリーのバーストの攻撃力▲ */
function pinnedBurstUp(pin: number) {
  const team = applyCompositionToTeam({
    ...fixedTeam([fixedSlot(LUDMILLA), fixedSlot(LILY)], 1),
    randomTargetSlot: pin,
  });
  return resolveTimed(team.slots[1]!.skills!.definition!, lily, levels).find((e) => e.source.skill === 'burst')!;
}

describe('「ランダムな味方 N 機」（allies と targetCount と targetRandom）', () => {
  it('targets every candidate (self included), not only the first N slots', () => {
    const fixedTargets = fixedTargetsOf(effectOf(timed), [someone, null, someone, someone], 2)!;
    expect(fixedTargets).toEqual([0, 2, 3]);
    const resolved = { target: 'allies' as const, targetCount: 1, targetRandom: true as const, fixedTargets };
    const hits = [0, 1, 2, 3].filter((i) => isEffectTarget(resolved, 2, i, someone));
    expect(hits).toEqual([0, 2, 3]);
  });

  it('is only allowed with allies and N, a linear stat, no chance trigger, and in timed', () => {
    expect(effectOf(timed)).toMatchObject({ targetRandom: true, targetCount: 1 });
    expect(() => effectOf({ ...timed, targetRandom: false })).toThrow(/must be true/);
    const { targetCount: _n, ...noCount } = timed;
    expect(() => effectOf(noCount)).toThrow(/only allowed with target "allies" and targetCount/);
    expect(() => effectOf({ ...noCount, target: 'self' })).toThrow(/only allowed with target "allies"/);
    const { scaling: _s, ...ratio } = timed;
    expect(() => effectOf({ ...ratio, stat: 'maxAmmo' })).toThrow(/needs a value that adds up linearly/);
    expect(() =>
      effectOf({ ...timed, trigger: { count: 'normalShot', chance: 5 }, scaling: undefined, stat: 'attackDamage' }),
    ).toThrow(/cannot be combined with a chance trigger/);
    const passive = { kind: 'passive', target: 'allies', targetRandom: true, stat: 'attack', ref: 1 };
    expect(() => effectOf(passive)).toThrow(/targetRandom is only allowed in timed/);
  });
});

describe('リリーの定義（data/skills/852.json）', () => {
  it('splits the burst attack up into 1/k of the value over the k candidates (expected value)', () => {
    const solo = burstUpIn([lily], 0);
    expect(solo).toMatchObject({ target: 'allies', targetCount: 1, targetRandom: true, scaling: 'casterAttack' });
    expect(solo.value).toBeCloseTo(0.4, 12);
    expect(burstUpIn([characterOf(LUDMILLA), lily], 1).value).toBeCloseTo(0.2, 12);
    expect(burstUpIn([characterOf(LUDMILLA), null, lily, someone, someone], 2).value).toBeCloseTo(0.1, 12);
  });

  it('gives the whole value only to randomTargetSlot when it is given (to none when it is not a candidate)', () => {
    const pinned = pinnedBurstUp(0);
    expect(pinned.fixedTargets).toEqual([0]);
    expect(pinned.value).toBeCloseTo(0.4, 12);
    expect(pinnedBurstUp(3).fixedTargets).toEqual([]);
  });

  it('resolves S1 to a 15-second cooldown active on the same random-ally target, 5 s', () => {
    const s1 = resolveTimed(applyComposition(definition, [characterOf(LUDMILLA), lily], 1), lily, levels).find(
      (e) => e.source.skill === 'skill1',
    )!;
    expect(s1).toMatchObject({ target: 'allies', targetCount: 1, targetRandom: true, fixedTargets: [0, 1] });
    expect(s1.value).toBeCloseTo(0.1, 12);
  });

  it('takes the Lv1 values of S1 and the branch without destroyed cover from the description', () => {
    const at1 = resolveTimed(applyComposition(definition, [lily], 0), lily, { skill1: 1, skill2: 1, burst: 1 });
    expect(at1.map((e) => e.source.skill)).toEqual(['skill1', 'burst']);
    expect(at1[0]!.value).toBeCloseTo(0.1182, 12);
    expect(at1[1]!.value).toBeCloseTo(0.2363, 12);
  });
});
