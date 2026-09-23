// Stage 10: DSL の追加（射撃に効く stat と scaling 'flat'、即時効果 cooldownReduction / ammoRefill、トリガー lastShot）。
// plan/design-stage10.md 2 節・8.1 節。
import { describe, expect, it } from 'vitest';
import { makeCharacter } from '../../__tests__/fixtures.ts';
import type { SkillRaw } from '../../types.ts';
import { applyResolvedEffect, ZERO_BUFFS } from '../buffs.ts';
import { resolveDamageEffects } from '../burstDamage.ts';
import { MAX_SKILL_LEVELS, resolveInstant, resolvePassives, resolveTimed } from '../resolve.ts';
import { isFiringStat, parseSkillDefinition, type SkillDefinition } from '../types.ts';

const tenLevels = (v: string) => Array.from({ length: 10 }, () => v);
const skill = (values: string[]): SkillRaw => ({
  id: 9,
  name: { ja: 'テスト', en: 'Test' },
  description: { ja: '', en: '' },
  values: values.map(tenLevels),
});

function definition(skills: Partial<Record<keyof SkillDefinition['skills'], unknown>>): unknown {
  const none = { support: 'unsupported', effects: [], notes: [{ ja: '-', en: '-' }] };
  return {
    formatVersion: 1,
    resourceId: 1,
    checkedAt: '2026-09-23',
    skills: { skill1: none, skill2: none, burst: none, ...skills },
  };
}

const supported = (...effects: unknown[]) => ({ support: 'supported', effects });

describe('parseSkillDefinition (Stage 10)', () => {
  it('accepts firing stats in passive and timed, flat max ammo, instant effects and lastShot', () => {
    const def = parseSkillDefinition(
      definition({
        skill1: supported(
          { kind: 'passive', target: 'allies', stat: 'maxAmmo', ref: 1 },
          { kind: 'passive', target: 'self', stat: 'maxAmmo', scaling: 'flat', ref: 2 },
          {
            kind: 'cooldownReduction',
            trigger: { count: 'fullBurstStart', atLeast: 2 },
            target: 'allies',
            ref: 3,
          },
        ),
        skill2: supported(
          { kind: 'timed', trigger: 'fullBurstStart', target: 'allies', stat: 'reloadSpeed', ref: 1, durationRef: 2 },
          {
            kind: 'timed',
            trigger: { count: 'lastShot' },
            target: 'self',
            stat: 'chargeSpeed',
            ref: 1,
            durationSeconds: 5,
          },
          { kind: 'ammoRefill', trigger: 'fullBurstStart', target: 'allies', targetWeapon: 'SG', ref: 3 },
          { kind: 'damage', trigger: { count: 'lastShot' }, damageType: 'additional', ref: 4 },
        ),
        burst: supported({
          kind: 'timed',
          trigger: 'burstUse',
          target: 'self',
          stat: 'maxAmmo',
          scaling: 'flat',
          ref: 1,
          durationRef: 2,
        }),
      }),
    );
    expect(def.skills.skill1.effects[2]).toEqual({
      kind: 'cooldownReduction',
      trigger: { count: 'fullBurstStart', atLeast: 2 },
      target: 'allies',
      ref: 3,
    });
    expect(def.skills.skill2.effects[2]).toMatchObject({ kind: 'ammoRefill', targetWeapon: 'SG' });
    expect(def.skills.skill2.effects[3]).toMatchObject({ kind: 'damage', trigger: { count: 'lastShot' } });
  });

  it('rejects flat on stats other than maxAmmo', () => {
    expect(() =>
      parseSkillDefinition(
        definition({
          skill1: supported({ kind: 'passive', target: 'self', stat: 'reloadSpeed', scaling: 'flat', ref: 1 }),
        }),
      ),
    ).toThrow(/flat is only allowed with stat "maxAmmo"/);
  });

  it('rejects malformed instant effects', () => {
    const bad = (effect: unknown) => () => parseSkillDefinition(definition({ skill1: supported(effect) }));
    expect(bad({ kind: 'cooldownReduction', target: 'allies', ref: 1 })).toThrow(/trigger/);
    expect(bad({ kind: 'cooldownReduction', trigger: 'burstUse', ref: 1 })).toThrow(/target/);
    expect(bad({ kind: 'ammoRefill', trigger: 'burstUse', target: 'self', ref: 1, targetWeapon: 'SG' })).toThrow(
      /targetWeapon/,
    );
    expect(bad({ kind: 'ammoRefill', trigger: 'burstUse', target: 'self', ref: 1, durationRef: 2 })).toThrow(
      /unknown field/,
    );
  });

  it('still rejects damage on every normal shot', () => {
    expect(() =>
      parseSkillDefinition(
        definition({
          skill1: supported({ kind: 'damage', trigger: { count: 'normalShot' }, damageType: 'skill', ref: 1 }),
        }),
      ),
    ).toThrow(/every must be >= 2/);
  });

  it('classifies the firing stats', () => {
    expect(['maxAmmo', 'reloadSpeed', 'chargeSpeed'].every((s) => isFiringStat(s as never))).toBe(true);
    expect(isFiringStat('attack')).toBe(false);
    expect(isFiringStat('burstGaugeSpeed')).toBe(false);
  });
});

describe('resolve (Stage 10)', () => {
  const character = makeCharacter(
    {},
    {
      skills: {
        skill1: skill(['45.17', '5', '2.34']),
        skill2: skill(['39.88', '10', '5', '85.79']),
        burst: skill(['66', '5']),
      },
    },
  );
  const def = parseSkillDefinition(
    definition({
      skill1: supported(
        { kind: 'timed', trigger: 'burstUse', target: 'allies', stat: 'maxAmmo', ref: 1, durationRef: 2 },
        { kind: 'cooldownReduction', trigger: 'fullBurstStart', target: 'allies', ref: 3 },
      ),
      skill2: supported(
        { kind: 'passive', target: 'allies', stat: 'maxAmmo', scaling: 'flat', ref: 3 },
        { kind: 'ammoRefill', trigger: 'fullBurstStart', target: 'allies', ref: 1 },
        { kind: 'damage', trigger: { count: 'lastShot' }, damageType: 'additional', ref: 4 },
      ),
    }),
  );

  it('keeps flat values as counts and divides % values by 100', () => {
    const [passive] = resolvePassives(def, character, MAX_SKILL_LEVELS);
    expect(passive).toMatchObject({ stat: 'maxAmmo', scaling: 'flat', value: 5 });
    const [timed] = resolveTimed(def, character, MAX_SKILL_LEVELS);
    expect(timed).toMatchObject({ stat: 'maxAmmo', scaling: 'ratio', value: 0.4517, durationFrames: 300 });
  });

  it('adds flat max ammo to maxAmmoFlat and ratio max ammo to maxAmmoRatio', () => {
    const [passive] = resolvePassives(def, character, MAX_SKILL_LEVELS);
    const [timed] = resolveTimed(def, character, MAX_SKILL_LEVELS);
    const a = applyResolvedEffect(ZERO_BUFFS, passive!, 0).totals;
    const b = applyResolvedEffect(a, timed!, 0).totals;
    expect(b).toMatchObject({ maxAmmoFlat: 5, maxAmmoRatio: 0.4517, attackRatio: 0 });
  });

  it('resolves instant effects: cooldown reduction in seconds, ammo refill as a ratio', () => {
    const instant = resolveInstant(def, character, MAX_SKILL_LEVELS);
    expect(instant).toEqual([
      expect.objectContaining({ kind: 'cooldownReduction', trigger: 'fullBurstStart', value: 2.34, effectIndex: 1 }),
      expect.objectContaining({ kind: 'ammoRefill', trigger: 'fullBurstStart', effectIndex: 1 }),
    ]);
    expect(instant[1]!.value).toBeCloseTo(0.3988, 12);
    expect(instant[0]!.source.skill).toBe('skill1');
    expect(instant[1]!.source.skill).toBe('skill2');
  });

  it('allows damage on every last bullet (once per magazine)', () => {
    const [effect] = resolveDamageEffects(def, character, MAX_SKILL_LEVELS);
    expect(effect).toMatchObject({ trigger: { count: 'lastShot', every: 1 } });
    expect(effect!.multiplier).toBeCloseTo(0.8579, 12);
  });
});
