// 持続ダメージ▲編（plan/design-sustained-damage-up.md 3 節）: stat sustainedDamage の検証・集計と、tick への掛け方（置き場所 H1〜H3）
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../../damage.ts';
import { ZERO_BUFFS, type BuffTotals } from '../buffs.ts';
import {
  computeBurstHit,
  oneHitValue,
  SUSTAINED_DAMAGE_PLACEMENT,
  sustainedMultiplier,
  type ResolvedSkillDamage,
} from '../burstDamage.ts';
import { parseSkillDefinition } from '../types.ts';

const enemy: EnemyInput = { defence: 100, element: 'Wind', hasCore: true };
const source = { resourceId: 7, skill: 'burst' as const, name: { ja: '', en: '' } };
const tick: ResolvedSkillDamage = { source, damageType: 'skill', multiplier: 3.96, sustained: true };
const auto: ResolvedSkillDamage = { source, damageType: 'skill', multiplier: 3.96 };

const base = {
  attack: 200_100,
  enemy,
  crit: { rate: 0.15, damage: 1.5 },
  attackDamageMultiplier: 1.2112,
  elementMultiplier: 1,
  fullBurstBonus: true,
  sustainedDamage: 0.528,
};

describe('sustainedDamage stat', () => {
  it('is accepted by passive and timed effects', () => {
    const def = parseSkillDefinition({
      formatVersion: 1,
      resourceId: 7,
      checkedAt: '2026-10-05',
      skills: {
        skill1: { effects: [{ kind: 'passive', target: 'allies', stat: 'sustainedDamage', ref: 1 }] },
        skill2: { effects: [], notes: [{ ja: 'なし', en: 'none', kind: 'noDamage' }] },
        burst: {
          effects: [
            { kind: 'timed', trigger: 'burstUse', target: 'self', stat: 'sustainedDamage', ref: 1, durationRef: 2 },
          ],
        },
      },
    });
    expect(def.skills.burst.effects[0]).toMatchObject({ kind: 'timed', stat: 'sustainedDamage' });
  });

  it('starts at 0 in the buff totals', () => {
    expect(ZERO_BUFFS.sustainedDamage).toBe(0);
  });
});

describe('sustainedMultiplier', () => {
  it('gives the ratio to the tick without the buff for each placement', () => {
    expect(sustainedMultiplier(0.528, 'separate', 1.5, 1.2112)).toBeCloseTo(1.528, 12);
    expect(sustainedMultiplier(0.528, 'attackDamage', 1.5, 1.2112)).toBeCloseTo(1.7392 / 1.2112, 12);
    expect(sustainedMultiplier(0.528, 'boost', 1.5, 1.2112)).toBeCloseTo(2.028 / 1.5, 12);
    expect(sustainedMultiplier(0, 'boost', 1.5, 1.2112)).toBe(1);
  });

  it('defaults to the separate multiplier (H1)', () => {
    expect(SUSTAINED_DAMAGE_PLACEMENT).toBe('separate');
  });
});

describe('computeBurstHit with sustained damage', () => {
  const none = computeBurstHit({ ...base, effects: [tick], sustainedDamage: 0 });

  it('multiplies only sustained (dot) effects, not auto attacks', () => {
    const r = computeBurstHit({ ...base, effects: [tick] });
    expect(r.perActivation / none.perActivation).toBeCloseTo(1.528, 12);
    expect(r.sustainedDamageMultiplier).toBeCloseTo(1.528, 12);
    const a = computeBurstHit({ ...base, effects: [auto] });
    expect(a.perActivation).toBeCloseTo(none.perActivation, 6);
    expect(a.sustainedDamageMultiplier).toBe(1);
  });

  it('rebuilds a non-crit and a crit tick for each placement', () => {
    const baseHit = 200_000 * 3.96;
    const separate = computeBurstHit({ ...base, effects: [tick], sustainedDamagePlacement: 'separate' });
    expect(oneHitValue(separate, false)).toBeCloseTo(baseHit * 1.5 * 1.2112 * 1.528, 4);
    expect(oneHitValue(separate, true)).toBeCloseTo(baseHit * 2 * 1.2112 * 1.528, 4);
    const attackDamage = computeBurstHit({ ...base, effects: [tick], sustainedDamagePlacement: 'attackDamage' });
    expect(oneHitValue(attackDamage, false)).toBeCloseTo(baseHit * 1.5 * 1.7392, 4);
    const boost = computeBurstHit({ ...base, effects: [tick], sustainedDamagePlacement: 'boost' });
    expect(boost.boost.sustained).toBeCloseTo(0.528, 12);
    expect(oneHitValue(boost, false)).toBeCloseTo(baseHit * 2.028 * 1.2112, 4);
    expect(oneHitValue(boost, true)).toBeCloseTo(baseHit * 2.528 * 1.2112, 4);
  });

  it('keeps the old value when the buff is absent', () => {
    const buffs: BuffTotals = { ...ZERO_BUFFS };
    expect(buffs.sustainedDamage).toBe(0);
    expect(none.sustainedDamageMultiplier).toBe(1);
    expect(oneHitValue(none, false)).toBeCloseTo(200_000 * 3.96 * 1.5 * 1.2112, 4);
  });
});
