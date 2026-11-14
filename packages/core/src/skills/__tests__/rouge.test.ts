// ルージュ（272）の語彙（plan/design-rouge.md 2 節）: 対象「両隣の味方」（targetAdjacent・includeSelf）と、編成の条件「後列に
// 配置されている時」（row）の読み込みと、編成の段（skills/composition.ts）で決まる枠
import { describe, expect, it } from 'vitest';
import { makeCharacter } from '../../__tests__/fixtures.ts';
import { compositionAllows, fixedTargetsOf } from '../composition.ts';
import { formationRowOf, parseSkillDefinition } from '../types.ts';

function definitionWith(effect: Record<string, unknown>): unknown {
  const empty = { effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] };
  return {
    formatVersion: 1,
    resourceId: 1,
    checkedAt: '2026-11-14',
    skills: { skill1: { effects: [effect] }, skill2: empty, burst: empty },
  };
}

const effectOf = (effect: Record<string, unknown>) =>
  parseSkillDefinition(definitionWith(effect)).skills.skill1.effects[0]!;

const grant = {
  kind: 'state',
  state: 'swordCoin',
  trigger: 'battleStart',
  target: 'allies',
  targetAdjacent: true,
  durationUntil: 'battleEnd',
  contents: [{ stat: 'attackDamage', ref: 1 }],
};
const timed = {
  kind: 'timed',
  trigger: 'burstUse',
  target: 'allies',
  targetAdjacent: true,
  stat: 'attack',
  ref: 1,
  durationRef: 2,
};

describe('「両隣の味方」（targetAdjacent）', () => {
  const five = [makeCharacter(), makeCharacter(), makeCharacter(), makeCharacter(), makeCharacter()];

  it('targets the slots to the left and right, and the own slot with includeSelf', () => {
    expect(fixedTargetsOf(effectOf(grant), five, 1)).toEqual([0, 2]);
    expect(fixedTargetsOf(effectOf({ ...grant, includeSelf: true }), five, 1)).toEqual([0, 1, 2]);
    expect(fixedTargetsOf(effectOf({ ...grant, includeSelf: true }), five, 3)).toEqual([2, 3, 4]);
    expect(fixedTargetsOf(effectOf(timed), five, 2)).toEqual([1, 3]);
  });

  it('has only one side at the ends and next to an empty slot', () => {
    expect(fixedTargetsOf(effectOf(grant), five, 0)).toEqual([1]);
    expect(fixedTargetsOf(effectOf(grant), five, 4)).toEqual([3]);
    const gap = [makeCharacter(), makeCharacter(), null, makeCharacter()];
    expect(fixedTargetsOf(effectOf({ ...grant, includeSelf: true }), gap, 1)).toEqual([0, 1]);
    // 空枠を飛ばして次の味方を探さない
    expect(fixedTargetsOf(effectOf(grant), gap, 3)).toEqual([]);
  });

  it('is only allowed as true with target allies, on timed and state grants, without other slot filters', () => {
    expect(() => parseSkillDefinition(definitionWith({ ...grant, targetAdjacent: false }))).toThrow(
      /targetAdjacent: must be true/,
    );
    expect(() => parseSkillDefinition(definitionWith({ ...timed, target: 'self' }))).toThrow(
      /targetAdjacent: only allowed with target "allies"/,
    );
    for (const extra of [{ targetState: 'persona' }, { targetBurstStep: 'Step1' }, { targetSquad: 'same' }]) {
      expect(() => parseSkillDefinition(definitionWith({ ...timed, ...extra }))).toThrow(
        /targetAdjacent: cannot be combined/,
      );
    }
    expect(() => parseSkillDefinition(definitionWith({ ...timed, excludeSelf: 'always' }))).toThrow(
      /targetAdjacent: cannot be combined with excludeSelf/,
    );
    const passive = { kind: 'passive', target: 'allies', targetAdjacent: true, stat: 'attack', ref: 1 };
    expect(() => parseSkillDefinition(definitionWith(passive))).toThrow(
      /targetAdjacent is only allowed in timed and state/,
    );
  });

  it('lets includeSelf go with targetAdjacent', () => {
    expect(() =>
      parseSkillDefinition(definitionWith({ ...timed, targetAdjacent: undefined, includeSelf: true })),
    ).toThrow(/includeSelf: only allowed with targetState or targetAdjacent/);
    expect(effectOf({ ...grant, includeSelf: true })).toMatchObject({ targetAdjacent: true, includeSelf: true });
  });
});

describe('「後列に配置されている時」（row）', () => {
  const five = [makeCharacter(), makeCharacter(), makeCharacter(), makeCharacter(), makeCharacter()];

  it('takes slots 2 and 4 as the back row and 1, 3 and 5 as the front row', () => {
    expect([0, 1, 2, 3, 4].map(formationRowOf)).toEqual(['front', 'back', 'front', 'back', 'front']);
  });

  it('keeps the effect only when the own slot is in the row', () => {
    const back = effectOf({ ...grant, row: 'back' });
    expect([0, 1, 2, 3, 4].map((i) => compositionAllows(back, five, i))).toEqual([false, true, false, true, false]);
    const front = effectOf({ ...timed, targetAdjacent: undefined, row: 'front' });
    expect([0, 1, 2, 3, 4].map((i) => compositionAllows(front, five, i))).toEqual([true, false, true, false, true]);
  });

  it('is only allowed as front or back in passive, timed and state grants', () => {
    expect(() => parseSkillDefinition(definitionWith({ ...grant, row: 'middle' }))).toThrow(/row: expected one of/);
    expect(effectOf({ kind: 'passive', target: 'self', stat: 'attack', ref: 1, row: 'back' })).toMatchObject({
      row: 'back',
    });
    // ほかの種類は、その種類の欄の検査が知らない欄として落とす
    const reduction = { kind: 'cooldownReduction', trigger: 'burstUse', target: 'allies', ref: 1, row: 'back' };
    expect(() => parseSkillDefinition(definitionWith(reduction))).toThrow(/row: unknown field/);
  });
});
