import { describe, expect, it } from 'vitest';
import { isEffectTarget } from '../targets.ts';

describe('isEffectTarget', () => {
  it('self applies only to the source slot', () => {
    expect(isEffectTarget({ target: 'self' }, 2, 2, { weaponType: 'AR', element: 'Fire' })).toBe(true);
    expect(isEffectTarget({ target: 'self' }, 2, 0, { weaponType: 'AR', element: 'Fire' })).toBe(false);
  });

  it('allies applies to every slot, including the source', () => {
    expect(isEffectTarget({ target: 'allies' }, 2, 2, { weaponType: 'AR', element: 'Fire' })).toBe(true);
    expect(isEffectTarget({ target: 'allies' }, 2, 4, { weaponType: 'SG', element: 'Fire' })).toBe(true);
  });

  it('targetWeapon limits allies to that weapon type, including the source (Stage 9)', () => {
    const sgAllies = { target: 'allies', targetWeapon: 'SG' } as const;
    expect(isEffectTarget(sgAllies, 2, 2, { weaponType: 'SG', element: 'Fire' })).toBe(true);
    expect(isEffectTarget(sgAllies, 2, 0, { weaponType: 'SG', element: 'Fire' })).toBe(true);
    expect(isEffectTarget(sgAllies, 2, 0, { weaponType: 'SR', element: 'Fire' })).toBe(false);
  });
});
