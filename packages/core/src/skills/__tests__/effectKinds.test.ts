// スキル定義の読み込みの検査（skills/parse/）の、効果の種類の振り分けの表。parse/ の最上位で types.ts の値を読まない約束（循環
// import）は、types.ts を読み込むテストならどれでも落ちて分かる（types.ts から読み始めると parse/ が先に評価される）ので、ここでは見ない
import { describe, expect, it } from 'vitest';
import { parseSkillDefinition, SKILL_EFFECT_KINDS } from '../types.ts';

const none = { effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] };
const withEffect = (effect: unknown): unknown => ({
  formatVersion: 1,
  resourceId: 1,
  checkedAt: '2026-11-03',
  skills: { skill1: { effects: [effect] }, skill2: none, burst: none },
});

describe('効果の種類の振り分け（parse/effect.ts の EFFECT_BODY_PARSERS）', () => {
  it('lists every kind in the error for an unknown kind', () => {
    let message = '';
    try {
      parseSkillDefinition(withEffect({ kind: 'unknownKind' }) as never);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch('got "unknownKind"');
    for (const kind of SKILL_EFFECT_KINDS) expect(message).toContain(JSON.stringify(kind));
  });

  it('does not take the names on the prototype of the table as kinds', () => {
    for (const kind of ['toString', 'constructor', '__proto__'])
      expect(() => parseSkillDefinition(withEffect({ kind }) as never)).toThrow(`got ${JSON.stringify(kind)}`);
  });
});
