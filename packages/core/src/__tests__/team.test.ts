import { describe, expect, it } from 'vitest';
import { computeDamage, type EnemyInput } from '../damage.ts';
import { TEAM_SIZE, computeTeamDamage, type SlotCondition, type TeamSlotInput } from '../team.ts';
import { DEFAULT_WEAPON_MODEL } from '../weapons.ts';
import { makeCharacter } from './fixtures.ts';

const enemy: EnemyInput = { defence: 100, element: 'Wind', hasCore: true };
const condition: SlotCondition = { coreHitRate: 1, distanceBonus: true, fullCharge: true };
const growth = { level: 1, grade: 0, core: 0 };

function slot(resourceId: number, shot = {}, extra: Partial<TeamSlotInput> = {}): TeamSlotInput {
  return { character: makeCharacter(shot, { resourceId }), growth, condition, ...extra };
}

const ar = slot(1);
const smg = slot(2, { maxAmmo: 120, rateOfFire: 1440, endRateOfFire: 1440, damage: 500 });
const sr = slot(3, { maxAmmo: 6, rateOfFire: 60, endRateOfFire: 60, chargeTime: 1, inputType: 'UP', damage: 6000 });

describe('computeTeamDamage', () => {
  it('sums the per-slot results in slot order and skips empty slots', () => {
    const team = computeTeamDamage({ slots: [ar, smg, null, sr], enemy, durationSeconds: 180 });
    const individual = [ar, smg, sr].map((s) =>
      computeDamage({ character: s.character, growth, enemy, condition: { ...condition, durationSeconds: 180 } }),
    );
    expect(team.filledCount).toBe(3);
    expect(team.slots).toHaveLength(4);
    expect(team.slots[2]).toBeNull();
    expect(team.slots[3]?.index).toBe(3);
    expect(team.totalDps).toBeCloseTo(
      individual.reduce((a, r) => a + r.dps, 0),
      8,
    );
    expect(team.totalDamage).toBeCloseTo(
      individual.reduce((a, r) => a + r.totalDamage, 0),
      6,
    );
    expect(team.slots[0]?.result).toEqual(individual[0]);
    expect(team.slots[1]?.result).toEqual(individual[1]);
    expect(team.slots[3]?.result).toEqual(individual[2]);
  });

  it('returns zero totals for an all-empty team', () => {
    const team = computeTeamDamage({ slots: [null, null, null], enemy, durationSeconds: 180 });
    expect(team).toEqual({ slots: [null, null, null], filledCount: 0, totalDps: 0, totalDamage: 0 });
  });

  it('shares are each slot’s fraction of the total and add up to 1', () => {
    const team = computeTeamDamage({ slots: [ar, smg, sr], enemy, durationSeconds: 180 });
    const shares = team.slots.map((s) => s?.share ?? 0);
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    for (const s of team.slots) {
      expect(s?.share).toBeCloseTo((s?.result.totalDamage ?? 0) / team.totalDamage, 12);
    }
  });

  it('a single-slot team equals computeDamage for that character', () => {
    const team = computeTeamDamage({ slots: [sr], enemy, durationSeconds: 90 });
    const single = computeDamage({
      character: sr.character,
      growth,
      enemy,
      condition: { ...condition, durationSeconds: 90 },
    });
    expect(team.slots[0]?.result).toEqual(single);
    expect(team.slots[0]?.share).toBe(1);
    expect(team.totalDps).toBe(single.dps);
    expect(team.totalDamage).toBe(single.totalDamage);
  });

  it('applies attackOverride and duration per slot independently', () => {
    const team = computeTeamDamage({
      slots: [slot(1, {}, { attackOverride: 5000 }), slot(2)],
      enemy,
      durationSeconds: 90,
    });
    expect(team.slots[0]?.result.attack).toBe(5000);
    expect(team.slots[1]?.result.attack).toBe(1000);
    expect(team.slots[0]?.result.totalDamage).toBeCloseTo((team.slots[0]?.result.dps ?? 0) * 90, 6);
  });

  it('passes the weapon model through to every slot', () => {
    const model = { ...DEFAULT_WEAPON_MODEL, chargeReleaseFrames: 0 };
    const withModel = computeTeamDamage({ slots: [sr], enemy, durationSeconds: 180, model });
    const withoutModel = computeTeamDamage({ slots: [sr], enemy, durationSeconds: 180 });
    expect(withModel.slots[0]?.result.cadence.cycleFrames).toBeLessThan(
      withoutModel.slots[0]?.result.cadence.cycleFrames ?? 0,
    );
  });

  it('rejects duplicate characters and out-of-range slot counts', () => {
    expect(() => computeTeamDamage({ slots: [ar, slot(1)], enemy, durationSeconds: 180 })).toThrow(RangeError);
    expect(() => computeTeamDamage({ slots: [], enemy, durationSeconds: 180 })).toThrow(RangeError);
    expect(() =>
      computeTeamDamage({ slots: Array.from({ length: TEAM_SIZE + 1 }, () => null), enemy, durationSeconds: 180 }),
    ).toThrow(RangeError);
    // 空枠は重複判定の対象外
    expect(() => computeTeamDamage({ slots: [null, null, ar, null, null], enemy, durationSeconds: 180 })).not.toThrow();
  });
});
