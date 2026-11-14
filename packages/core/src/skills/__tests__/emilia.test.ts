// エミリア（821）の語彙（plan/design-emilia.md 2 節）: scaling perFinalMaxAmmo（最終最大装弾数 1 発ごとのチャージダメージ▲）と
// damageType fixedShare（与えたダメージ量の X% の固定ダメージ）の読み込みの検査と式、定義の Lv ごとの値
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeTriggerDamage, partialChargeTriggerDamage } from '../../damage.ts';
import type { CharacterData } from '../../types.ts';
import { applyChargeBuffs, applyResolvedEffect, PER_MAX_AMMO_CAP, ZERO_BUFFS } from '../buffs.ts';
import { resolvePerShotDamage } from '../burstDamage.ts';
import { MAX_SKILL_LEVELS } from '../resolve.ts';
import { parseSkillDefinition } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const none = { effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] };
const def = (skill1: unknown[], skill2: unknown[] = []) => ({
  formatVersion: 1,
  resourceId: 1,
  checkedAt: '2026-11-14',
  skills: {
    skill1: skill1.length > 0 ? { effects: skill1 } : none,
    skill2: skill2.length > 0 ? { effects: skill2 } : none,
    burst: none,
  },
});
const perAmmo = {
  kind: 'timed',
  trigger: { count: 'fullChargeShot' },
  target: 'self',
  stat: 'chargeDamage',
  scaling: 'perFinalMaxAmmo',
  ref: 3,
  durationShotsRef: 4,
};
const share = { kind: 'damage', trigger: { count: 'fullChargeShot' }, damageType: 'fixedShare', ref: 1 };

describe('scaling perFinalMaxAmmo（plan/design-emilia.md 2.1 節）', () => {
  it('parses on a self timed chargeDamage only', () => {
    expect(parseSkillDefinition(def([perAmmo])).skills.skill1.effects[0]).toMatchObject(perAmmo);
    expect(() => parseSkillDefinition(def([{ ...perAmmo, stat: 'attack' }]))).toThrow(
      /only allowed with stat "chargeDamage"/,
    );
    expect(() => parseSkillDefinition(def([{ ...perAmmo, target: 'allies' }]))).toThrow(
      /only allowed with target "self"/,
    );
    expect(() =>
      parseSkillDefinition(
        def([{ kind: 'passive', target: 'self', stat: 'chargeDamage', scaling: 'perFinalMaxAmmo', ref: 3 }]),
      ),
    ).toThrow(/only allowed in timed/);
    expect(() =>
      parseSkillDefinition(
        def([
          {
            kind: 'state',
            state: 'freezingWitch',
            trigger: 'burstUse',
            target: 'self',
            durationShotsRef: 2,
            contents: [{ stat: 'chargeDamage', ref: 3, scaling: 'perFinalMaxAmmo' }],
          },
        ]),
      ),
    ).toThrow(/only allowed in timed/);
  });

  it('adds min(50, final max ammo) × the sum to the charge damage', () => {
    const { totals } = applyResolvedEffect(
      ZERO_BUFFS,
      { stat: 'chargeDamage', scaling: 'perFinalMaxAmmo', value: 0.0201 },
      0,
    );
    expect(totals.chargeDamagePerMaxAmmo).toBeCloseTo(0.0201, 12);
    expect(totals.chargeDamage).toBe(0);
    expect(applyChargeBuffs(2.5, true, totals, 6)).toBeCloseTo(2.5 + 6 * 0.0201, 12);
    expect(applyChargeBuffs(2.5, true, totals, 9)).toBeCloseTo(2.5 + 9 * 0.0201, 12);
    expect(applyChargeBuffs(2.5, true, totals, 80)).toBeCloseTo(2.5 + PER_MAX_AMMO_CAP * 0.0201, 12);
    expect(applyChargeBuffs(2.5, false, totals, 6)).toBe(1);
    expect(() => applyChargeBuffs(2.5, true, totals)).toThrow(/needs the final max ammo/);
    // ▲が無ければ装弾数を読まない
    expect(applyChargeBuffs(2.5, true, ZERO_BUFFS)).toBe(2.5);
  });
});

describe('damageType fixedShare（plan/design-emilia.md 2.2 節）', () => {
  it('parses only on { count: "fullChargeShot" } without other fields', () => {
    expect(parseSkillDefinition(def([], [share])).skills.skill2.effects[0]).toMatchObject(share);
    expect(() => parseSkillDefinition(def([], [{ ...share, trigger: { count: 'normalShot' } }]))).toThrow(
      /fixedShare needs the trigger/,
    );
    expect(() => parseSkillDefinition(def([], [{ ...share, trigger: { count: 'fullChargeShot', every: 2 } }]))).toThrow(
      /fixedShare needs the trigger/,
    );
    expect(() => parseSkillDefinition(def([], [{ ...share, delayFrames: 6 }]))).toThrow(
      /not allowed with the damageType "fixedShare"/,
    );
    expect(() => parseSkillDefinition(def([], [{ ...share, gaugeHits: [0] }]))).toThrow(
      /not allowed with the damageType "fixedShare"/,
    );
  });

  const emilia = readJson<CharacterData>('../../../data/characters/821.json');
  const definition = parseSkillDefinition(readJson<unknown>('../../../data/skills/821.json'));
  const perShot = resolvePerShotDamage(definition, emilia, MAX_SKILL_LEVELS);
  const input = {
    character: emilia,
    growth: { level: 400, grade: 0, core: 0 },
    attackOverride: 100000,
    enemy: { defence: 100, element: null, hasCore: true },
    buffs: { ...ZERO_BUFFS, attackDamage: 0.3, damageTaken: 0.2 },
    perShot,
  };

  it('is X% of the normal attack of the trigger, with nothing applied again (Lv10: 58.99%)', () => {
    expect(perShot).toEqual([expect.objectContaining({ damageType: 'fixedShare', multiplier: 0.5899 })]);
    const condition = { coreHitRate: 0.5, distanceBonus: false, fullCharge: true, hitRate: 1 };
    const t = computeTriggerDamage({ ...input, condition });
    expect(t.perShot).toBe(0);
    expect(t.fixedShare).toBeCloseTo(t.normal * 0.5899, 6);
    expect(t.perTrigger).toBeCloseTo(t.normal * 1.5899, 6);
    const fb = computeTriggerDamage({ ...input, condition: { ...condition, fullBurst: true } });
    expect(fb.fixedShare / fb.normal).toBeCloseTo(0.5899, 12);
  });

  it('does not occur on uncharged or partially charged shots', () => {
    const condition = { coreHitRate: 0.5, distanceBonus: false, fullCharge: false, hitRate: 1 };
    expect(computeTriggerDamage({ ...input, condition }).fixedShare).toBe(0);
    const full = computeTriggerDamage({ ...input, condition: { ...condition, fullCharge: true } });
    const partial = partialChargeTriggerDamage(full, 0.5);
    expect(partial.fixedShare).toBe(0);
    expect(partial.perTrigger).toBeCloseTo(partial.normal + partial.perShot, 6);
  });
});

describe('エミリア（821）の定義', () => {
  it('resolves the Lv10 values of the description', () => {
    const d = parseSkillDefinition(readJson<unknown>('../../../data/skills/821.json'));
    expect(d.skills.skill1.effects.map((e) => e.kind)).toEqual(['timed', 'timed']);
    expect(d.skills.skill2.effects.map((e) => e.kind)).toEqual(['damage', 'timed']);
    expect(d.skills.burst.effects.map((e) => e.kind)).toEqual(['state']);
    expect(d.skills.burst.support).toBe('partial');
  });
});
