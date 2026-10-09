// 遅れて出る倍率ダメージ（plan/design-delayed-skill-hit.md 3.1 節）: damage の delayFrames の検証。
// 時刻とバフの扱いは、クイーン（真）の編成のテスト（__tests__/queenMakotoTeam.test.ts）で見る。
import { describe, expect, it } from 'vitest';
import { parseSkillDefinition } from '../types.ts';

/** skill1 に効果を並べた定義（検証にかける前の JSON） */
function withSkill1(effects: unknown[]): unknown {
  const blank = { effects: [], notes: [{ ja: 'x', en: 'x', kind: 'noDamage' }] };
  return {
    formatVersion: 1,
    resourceId: 1,
    checkedAt: '2026-10-06',
    skills: { skill1: { effects }, skill2: blank, burst: blank },
  };
}

const damage = { kind: 'damage', trigger: 'burstUse', ref: 1, damageType: 'distributed' };

describe('damage の delayFrames の検証', () => {
  it('parses a positive integer delay on a burstUse damage', () => {
    const def = parseSkillDefinition(withSkill1([{ ...damage, delayFrames: 24, enemyElement: 'Wind' }]));
    expect(def.skills.skill1.effects[0]).toMatchObject({ kind: 'damage', delayFrames: 24, enemyElement: 'Wind' });
  });

  it('parses a delay on a timer damage (C-0453)', () => {
    const def = parseSkillDefinition(
      withSkill1([{ ...damage, trigger: { everySeconds: 20 }, damageType: 'skill', delayFrames: 101 }]),
    );
    expect(def.skills.skill1.effects[0]).toMatchObject({ trigger: { everySeconds: 20 }, delayFrames: 101 });
  });

  it('leaves the delay out when it is not written', () => {
    const def = parseSkillDefinition(withSkill1([damage]));
    expect(def.skills.skill1.effects[0]).not.toHaveProperty('delayFrames');
  });

  it('rejects other triggers and non-positive or fractional delays', () => {
    expect(() => parseSkillDefinition(withSkill1([{ ...damage, trigger: 'battleStart', delayFrames: 24 }]))).toThrow(
      /delayFrames/,
    );
    for (const d of [0, -1, 1.5, '24']) {
      expect(() => parseSkillDefinition(withSkill1([{ ...damage, delayFrames: d }]))).toThrow(/delayFrames/);
    }
  });
});
