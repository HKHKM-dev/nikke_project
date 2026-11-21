// ギロチン編（plan/design-guillotine.md）: 失った HP 1% ごとの▲（scaling perLostHp。2.1 節）と、damage の条件 selfHp の「以下」の形
// （2.2 節）の定義の検証と、Lv ごとの解決値
import { describe, expect, it } from 'vitest';
import { characterOf, rawDefinition } from '../../__tests__/data.ts';
import { parseSkillDefinition } from '../parse/definition.ts';
import { MAX_SKILL_LEVELS, resolveCondition, resolveTimed } from '../resolve.ts';
import { lostHpScaled, lostHpSteps, selfHpHolds } from '../types.ts';

type Raw = { skills: Record<'skill1' | 'skill2' | 'burst', { effects: Record<string, unknown>[] }> };
const GUILLOTINE = 180;
const raw = rawDefinition<Raw>(GUILLOTINE);
/** S2 の失った HP 1% ごとの攻撃力▲（effects[1]）の欄を差し替えた定義の読み込み */
const patchedS2 = (fields: Record<string, unknown>) => () => {
  const copy = structuredClone(raw);
  copy.skills.skill2.effects[1] = { ...copy.skills.skill2.effects[1], ...fields };
  return parseSkillDefinition(copy);
};

describe('失った HP 1% ごとの▲（perLostHp）', () => {
  it('counts the lost HP in whole percent, rounding down', () => {
    expect(lostHpSteps(1)).toBe(0);
    expect(lostHpSteps(0.7)).toBe(30);
    expect(lostHpSteps(0.6939)).toBe(30);
    expect(lostHpSteps(0.69)).toBe(31);
    expect(lostHpSteps(0.026)).toBe(97);
    expect(lostHpSteps(0)).toBe(100);
  });

  it('scales only the perLostHp effects by the lost HP steps into a ratio, reading the HP ratio only for them', () => {
    const scaled = lostHpScaled({ scaling: 'perLostHp' as const, value: 0.0096 }, () => 0.6939);
    expect(scaled.scaling).toBe('ratio');
    expect(scaled.value).toBeCloseTo(0.288, 12);
    const ratio = { scaling: 'ratio' as const, value: 0.0096 };
    expect(
      lostHpScaled(ratio, () => {
        throw new Error('not read');
      }),
    ).toBe(ratio);
  });

  it('writes the S2 ATK up as a perLostHp timed effect on self while the HP is at 70% or lower', () => {
    const def = parseSkillDefinition(raw);
    expect(def.skills.skill2.effects[1]).toMatchObject({
      kind: 'timed',
      trigger: { selfHpAtMostRef: 4 },
      durationUntil: 'selfHpAbove',
      target: 'self',
      stat: 'attack',
      scaling: 'perLostHp',
    });
    // Lv10 の値（0.96%）は比率のまま解き、失った HP の段は 1 パス目・2 パス目が掛ける
    const s2 = resolveTimed(def, characterOf(GUILLOTINE), MAX_SKILL_LEVELS).filter((e) => e.source.skill === 'skill2');
    const atk = s2.find((e) => e.stat === 'attack')!;
    expect(atk).toMatchObject({ scaling: 'perLostHp', trigger: { selfHpAtMost: 0.7 } });
    expect(atk.value).toBeCloseTo(0.0096, 12);
  });

  it('rejects perLostHp on other stats, on other targets and outside timed', () => {
    expect(patchedS2({ stat: 'critDamage' })).toThrow(/perLostHp is only allowed with stat "attack"/);
    expect(patchedS2({ target: 'allies' })).toThrow(/perLostHp is only allowed with target "self"/);
    const passive = structuredClone(raw);
    passive.skills.skill2.effects[1] = {
      kind: 'passive',
      target: 'self',
      stat: 'attack',
      ref: 5,
      scaling: 'perLostHp',
    };
    expect(() => parseSkillDefinition(passive)).toThrow(/perLostHp is only allowed in timed/);
  });
});

describe('damage の条件 selfHp の「以下」の形', () => {
  it('writes the burst additional damage with the at-most form, resolved to the slot level value', () => {
    const def = parseSkillDefinition(raw);
    expect(def.skills.burst.effects[1]).toMatchObject({
      kind: 'damage',
      trigger: 'burstUse',
      damageType: 'additional',
      condition: { selfHp: { atMostRef: 2 } },
    });
    const resolved = resolveCondition({ selfHp: { atMostRef: 2 } }, characterOf(GUILLOTINE).skills.burst, 10);
    expect(resolved).toEqual({ selfHp: { atMost: 50 } });
    expect(selfHpHolds(resolved.selfHp!, 0.5)).toBe(true);
    expect(selfHpHolds(resolved.selfHp!, 0.5001)).toBe(false);
  });
});
