// ラム編: 同じ部隊の味方の条件（squad。plan/design-ram-s1.md 2.1 節）と、バースト段階の構成の条件（burstStepMix）との組み合わせ。
// バースト段階の構成の条件だけの検査は anisStar.test.ts。再突入するキャラを「基本バースト段階が N の味方」に数えない（C-0555）検査も
// ここに置く
import { describe, expect, it } from 'vitest';
import { makeCharacter } from '../../__tests__/fixtures.ts';
import { applyComposition, compositionAllows, countsAsBurstStep, fixedTargetsOf, squadAllows } from '../composition.ts';
import { parseSkillDefinition } from '../types.ts';

const ram = makeCharacter({}, { squad: 'CE003', burstStep: 'Step1' });
const rem = makeCharacter({}, { squad: 'CE003', burstStep: 'Step2' });
const delta = makeCharacter({}, { squad: 'Scouting', burstStep: 'Step2' });

function definitionWith(effect: Record<string, unknown>): unknown {
  const empty = { effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] };
  return {
    formatVersion: 1,
    resourceId: 1,
    checkedAt: '2026-10-04',
    skills: { skill1: { effects: [effect] }, skill2: empty, burst: empty },
  };
}

const cut = { kind: 'cooldownReduction', trigger: 'fullBurstEnd', target: 'self', ref: 4 };

describe('同じ部隊の味方の条件（squad）', () => {
  const present = { present: true } as const;
  const absent = { present: false } as const;

  it('looks at the other filled slots only', () => {
    // 自分は数えない
    expect(squadAllows(present, [ram], 0)).toBe(false);
    expect(squadAllows(absent, [ram, null, delta], 0)).toBe(true);
    expect(squadAllows(present, [ram, null, delta], 0)).toBe(false);
    expect(squadAllows(present, [delta, rem, ram], 2)).toBe(true);
    expect(squadAllows(absent, [delta, rem, ram], 2)).toBe(false);
    expect(squadAllows(undefined, [ram], 0)).toBe(true);
  });

  it('compares with the squad of the slot itself', () => {
    expect(squadAllows(present, [delta, rem], 0)).toBe(false);
    expect(squadAllows(present, [rem, ram], 0)).toBe(true);
  });

  it('needs both conditions when an effect has both', () => {
    const both = (otherBurstStep: string) =>
      parseSkillDefinition(
        definitionWith({ ...cut, burstStepMix: { otherBurstStep, present: true }, squad: { present: true } }),
      ).skills.skill1.effects[0]!;
    expect(compositionAllows(both('Step2'), [ram, rem], 0)).toBe(true);
    // レムがいなければ同じ部隊の味方がいない（デルタはバースト II だが別の部隊）
    expect(compositionAllows(both('Step2'), [ram, delta], 0)).toBe(false);
    expect(compositionAllows(both('Step3'), [ram, rem], 0)).toBe(false);
  });

  it('removes the effect without an ally from the same squad', () => {
    const def = parseSkillDefinition(definitionWith({ ...cut, squad: { present: true } }));
    expect(applyComposition(def, [ram, rem], 0)).toBe(def);
    expect(applyComposition(def, [ram, delta], 0).skills.skill1.effects).toEqual([]);
  });

  it('rejects squad on other effect kinds and malformed conditions', () => {
    expect(() =>
      parseSkillDefinition(
        definitionWith({
          kind: 'damage',
          trigger: { count: 'fullChargeShot' },
          damageType: 'additional',
          ref: 4,
          squad: { present: true },
        }),
      ),
    ).toThrow(/squad: only allowed in passive, timed, state, cooldownReduction and burstReentry/);
    expect(() => parseSkillDefinition(definitionWith({ ...cut, squad: { present: 'yes' } }))).toThrow(
      /present: expected a boolean/,
    );
    expect(() => parseSkillDefinition(definitionWith({ ...cut, squad: { present: true, name: 'CE003' } }))).toThrow(
      /squad\.name: unknown field/,
    );
    expect(() => parseSkillDefinition(definitionWith({ ...cut, squad: true }))).toThrow(/squad: expected an object/);
  });
});

describe('基本バースト段階が N の味方に再突入するキャラを数えない（C-0555）', () => {
  // チャイム（331）のように、バーストの後に同じ段階へ再突入するキャラ
  const reentry = makeCharacter({}, { squad: 'Test', burstStep: 'Step2' });
  reentry.burstSkill = { ...reentry.burstSkill, nextStep: 'Step2' };
  const timed = {
    kind: 'timed',
    trigger: 'burstUse',
    target: 'allies',
    stat: 'attack',
    ref: 1,
    durationRef: 2,
    targetBurstStep: 'Step2',
  };

  it('counts only the slots that go on to the next stage', () => {
    expect(countsAsBurstStep(rem, 'Step2')).toBe(true);
    expect(countsAsBurstStep(reentry, 'Step2')).toBe(false);
    expect(countsAsBurstStep(ram, 'Step2')).toBe(false);
  });

  it('leaves a re-entering slot out of targetBurstStep', () => {
    const effect = parseSkillDefinition(definitionWith(timed)).skills.skill1.effects[0]!;
    expect(fixedTargetsOf(effect, [ram, reentry, rem, delta], 0)).toEqual([2, 3]);
  });

  it('leaves a re-entering slot out of burstStepMix', () => {
    const effect = parseSkillDefinition(
      definitionWith({ ...cut, burstStepMix: { otherBurstStep: 'Step2', present: true } }),
    ).skills.skill1.effects[0]!;
    expect(compositionAllows(effect, [ram, reentry], 0)).toBe(false);
    expect(compositionAllows(effect, [ram, reentry, rem], 0)).toBe(true);
  });
});
