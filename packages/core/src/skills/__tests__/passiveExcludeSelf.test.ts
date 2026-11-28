// 常時の効果（passive）の「自分を除く…味方全体」（excludeSelf: always。plan/design-label.md 2.1 節）。レーベルの S2 の妄想共有の間の攻撃力▲
import { describe, expect, it } from 'vitest';
import { makeCharacter } from '../../__tests__/fixtures.ts';
import { fixedTargetsOf } from '../composition.ts';
import { parseSkillDefinition } from '../parse/definition.ts';

function definitionWith(effect: Record<string, unknown>): unknown {
  const empty = { effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] };
  return {
    formatVersion: 1,
    resourceId: 1,
    checkedAt: '2026-11-28',
    skills: { skill1: { effects: [effect] }, skill2: empty, burst: empty },
  };
}

const passive = { kind: 'passive', target: 'allies', stat: 'attack', scaling: 'casterAttack', ref: 1 };
const effectOf = (fields: Record<string, unknown>) =>
  parseSkillDefinition(definitionWith({ ...passive, ...fields })).skills.skill1.effects[0]!;

describe('passive の excludeSelf', () => {
  it('reads "always" with target "allies"', () => {
    expect(effectOf({ excludeSelf: 'always' })).toMatchObject({ kind: 'passive', excludeSelf: 'always' });
  });

  it('rejects "unlessShort" and targets other than "allies"', () => {
    expect(() => effectOf({ excludeSelf: 'unlessShort' })).toThrow(/passive only takes excludeSelf "always"/);
    expect(() => effectOf({ target: 'self', scaling: undefined, excludeSelf: 'always' })).toThrow(
      /passive only takes excludeSelf "always"/,
    );
  });

  it('writes every slot but its own as the composition targets', () => {
    const team = [makeCharacter(), makeCharacter(), makeCharacter()];
    expect(fixedTargetsOf(effectOf({ excludeSelf: 'always' }), team, 1)).toEqual([0, 2]);
    expect(fixedTargetsOf(effectOf({}), team, 1)).toBeUndefined();
  });
});
