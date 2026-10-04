// ルドミラ：ウィンターオーナー編の語彙（plan/design-ludmilla-wo.md 2 節）: 回数トリガー coreHit、命中の期待値の数え、
// 発数の弾丸チャージ（ammoRefill の scaling 'flat'）
import { describe, expect, it } from 'vitest';
import { makeCharacter } from '../../__tests__/fixtures.ts';
import { MAX_SKILL_LEVELS, resolveInstant } from '../resolve.ts';
import { advanceShotCount, shotCountWeight, type ShotEvent } from '../triggers.ts';
import { parseSkillDefinition } from '../types.ts';

const none = { effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] };
const definition = (effect: unknown) => ({
  formatVersion: 1,
  resourceId: 1,
  checkedAt: '2026-10-04',
  skills: { skill1: { effects: [effect] }, skill2: none, burst: none },
});
const refill = { kind: 'ammoRefill', trigger: { count: 'normalHit', every: 60 }, target: 'self', ref: 1 };

describe('parseSkillDefinition（ルドミラ：ウィンターオーナー編）', () => {
  it('accepts the coreHit count and a flat ammo refill', () => {
    const core = { kind: 'damage', trigger: { count: 'coreHit', every: 60 }, damageType: 'additional', ref: 1 };
    expect(parseSkillDefinition(definition(core)).skills.skill1.effects[0]).toEqual(core);
    expect(parseSkillDefinition(definition({ ...refill, scaling: 'flat' })).skills.skill1.effects[0]).toEqual({
      ...refill,
      scaling: 'flat',
    });
  });

  it('rejects other scalings on ammoRefill and scaling on other instant effects', () => {
    expect(() => parseSkillDefinition(definition({ ...refill, scaling: 'ratio' }))).toThrow(/only takes "flat"/);
    const cut = { kind: 'cooldownReduction', trigger: 'fullBurstEnd', target: 'self', ref: 1, scaling: 'flat' };
    expect(() => parseSkillDefinition(definition(cut))).toThrow(/unknown field/);
  });
});

describe('resolveInstant: flat ammo refill', () => {
  it('keeps the value in rounds (not divided by 100)', () => {
    const character = makeCharacter({}, { resourceId: 1 });
    character.skills.skill1 = { ...character.skills.skill1, values: [Array.from({ length: 10 }, () => '20')] };
    const flat = resolveInstant(
      parseSkillDefinition(definition({ ...refill, scaling: 'flat' })),
      character,
      MAX_SKILL_LEVELS,
    );
    expect(flat[0]).toMatchObject({ kind: 'ammoRefill', scaling: 'flat', value: 20 });
    const ratio = resolveInstant(parseSkillDefinition(definition(refill)), character, MAX_SKILL_LEVELS);
    expect(ratio[0]!.value).toBeCloseTo(0.2, 12);
    expect(ratio[0]!.scaling).toBeUndefined();
  });
});

describe('回数の数え（skills/triggers.ts）', () => {
  const shot = (patch: Partial<ShotEvent> = {}): ShotEvent => ({
    lastShot: false,
    fullCharge: false,
    hits: 1,
    coreHits: 1,
    ...patch,
  });

  it('weighs each shot by its kind', () => {
    const s = shot({ hits: 0.9, coreHits: 0.45, lastShot: true });
    expect(shotCountWeight('normalShot', s)).toBe(1);
    expect(shotCountWeight('normalHit', s)).toBe(0.9);
    expect(shotCountWeight('coreHit', s)).toBe(0.45);
    expect(shotCountWeight('lastShot', s)).toBe(1);
    expect(shotCountWeight('fullChargeShot', s)).toBe(0);
  });

  it('fires on whole counts exactly like the shot count, and on the shot passing a multiple for expected counts', () => {
    const fire = (weight: number, every: number, shots: number): number[] => {
      let count = 0;
      const fired: number[] = [];
      for (let k = 1; k <= shots; k++) {
        const next = advanceShotCount(count, weight, every);
        count = next.count;
        if (next.fired) fired.push(k);
      }
      return fired;
    };
    expect(fire(1, 3, 10)).toEqual([3, 6, 9]);
    // 0.1 の累計の端数（0.30000000000000004 など）で 1 発ずれない
    expect(fire(0.1, 3, 61)).toEqual([30, 60]);
    expect(fire(0.75, 60, 160)).toEqual([80, 160]);
    expect(fire(0, 1, 5)).toEqual([]);
  });
});
