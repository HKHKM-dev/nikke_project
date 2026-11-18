// 値の固定（timed の lock。plan/design-stat-lock.md 3.1 節）の読み込みと、持ち主の和の上書き（applyStatLocks）
import { describe, expect, it } from 'vitest';
import { addRatioBuff, applyResolvedEffect, applyStatLocks, ZERO_BUFFS } from '../buffs.ts';
import { parseSkillDefinition } from '../parse/definition.ts';
import { rawDefinition } from '../../__tests__/teamHelpers.ts';

type Raw = { skills: Record<string, { effects: Record<string, unknown>[] }> };

/** リバーレリオ（262）の定義の skill2 の効果を差し替えた写し */
function withSkill2(effects: Record<string, unknown>[]): unknown {
  const copy = structuredClone(rawDefinition<Raw>(262));
  copy.skills.skill2!.effects = effects;
  return copy;
}

const NULLIFY = {
  kind: 'timed',
  trigger: 'battleStart',
  target: 'self',
  stat: 'chargeSpeed',
  lock: true,
  durationUntil: 'battleEnd',
};
const FIXED = {
  kind: 'timed',
  trigger: 'fullBurstStart',
  target: 'self',
  stat: 'reloadSpeed',
  lock: true,
  ref: 1,
  durationRef: 2,
};

describe('値の固定 lock の読み込み', () => {
  it('reads a lock without ref as a lock at 0, and a lock with ref as a fixed value', () => {
    const def = parseSkillDefinition(withSkill2([NULLIFY, FIXED]));
    const [nullify, fixed] = def.skills.skill2.effects;
    expect(nullify).toMatchObject({ kind: 'timed', stat: 'chargeSpeed', lock: true });
    expect(nullify).not.toHaveProperty('ref');
    expect(fixed).toMatchObject({ kind: 'timed', stat: 'reloadSpeed', lock: true, ref: 1 });
  });

  it('is only allowed for charge speed and reload speed, on self, without value-adding fields', () => {
    expect(() => parseSkillDefinition(withSkill2([{ ...NULLIFY, stat: 'attack' }]))).toThrow(
      /lock is only allowed with stat/,
    );
    expect(() => parseSkillDefinition(withSkill2([{ ...NULLIFY, target: 'allies' }]))).toThrow(/target "self"/);
    expect(() =>
      parseSkillDefinition(withSkill2([{ ...FIXED, scaling: 'casterChargeTime', stat: 'chargeSpeed' }])),
    ).toThrow(/no scaling/);
    expect(() => parseSkillDefinition(withSkill2([{ ...FIXED, decrease: true }]))).toThrow(/cannot be decreased/);
    expect(() => parseSkillDefinition(withSkill2([{ ...FIXED, maxStacks: 2 }]))).toThrow(/cannot stack/);
    expect(() => parseSkillDefinition(withSkill2([{ ...FIXED, lock: false }]))).toThrow(/lock/);
  });

  it('allows at most one lock of the same stat per definition', () => {
    expect(() => parseSkillDefinition(withSkill2([NULLIFY, { ...NULLIFY, trigger: 'fullBurstStart' }]))).toThrow(
      /at most one lock of "chargeSpeed"/,
    );
  });

  it('still requires ref on a timed effect without lock', () => {
    const { lock: _lock, ...noLock } = NULLIFY;
    expect(() => parseSkillDefinition(withSkill2([noLock]))).toThrow(/ref/);
  });
});

describe('applyStatLocks', () => {
  const source = { resourceId: 262, skill: 'skill2' as const, name: { ja: '', en: '' } };

  it('overwrites the charge speed sum, its parts and the seconds subtracted, but not the fixed charge time', () => {
    let totals = addRatioBuff(ZERO_BUFFS, 'chargeSpeed', 0.0897, '160.skill1');
    totals = { ...totals, chargeTimeFlat: 0.19, fixedChargeTime: 1.2, reloadSpeed: 0.3 };
    const locked = applyStatLocks(totals, [{ stat: 'chargeSpeed', value: 0, source }]);
    expect(locked.chargeSpeed).toBe(0);
    expect(locked.chargeSpeedParts).toEqual([]);
    expect(locked.chargeTimeFlat).toBe(0);
    expect(locked.fixedChargeTime).toBe(1.2);
    expect(locked.reloadSpeed).toBe(0.3);
  });

  it('overwrites the reload speed sum with the fixed value', () => {
    const totals = { ...ZERO_BUFFS, reloadSpeed: 0.95 + 0.4435 };
    expect(applyStatLocks(totals, [{ stat: 'reloadSpeed', value: 0.95, source }]).reloadSpeed).toBe(0.95);
  });

  it('returns the same totals without locks, and applyResolvedEffect does not add a lock', () => {
    const totals = { ...ZERO_BUFFS, reloadSpeed: 0.5 };
    expect(applyStatLocks(totals, [])).toBe(totals);
    const applied = applyResolvedEffect(totals, { stat: 'reloadSpeed', scaling: 'ratio', value: 0.6, lock: true }, 0);
    expect(applied.totals).toBe(totals);
    expect(applied.appliedAmount).toBe(0.6);
  });
});
