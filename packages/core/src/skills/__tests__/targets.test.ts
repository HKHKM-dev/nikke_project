import { describe, expect, it } from 'vitest';
import { isEffectTarget } from '../targets.ts';

describe('isEffectTarget', () => {
  it('self applies only to the source slot', () => {
    expect(isEffectTarget({ target: 'self' }, 2, 2, 'AR')).toBe(true);
    expect(isEffectTarget({ target: 'self' }, 2, 0, 'AR')).toBe(false);
  });

  it('allies applies to every slot, including the source', () => {
    expect(isEffectTarget({ target: 'allies' }, 2, 2, 'AR')).toBe(true);
    expect(isEffectTarget({ target: 'allies' }, 2, 4, 'SG')).toBe(true);
  });

  it('targetWeapon limits allies to that weapon type, including the source (Stage 9)', () => {
    const sgAllies = { target: 'allies', targetWeapon: 'SG' } as const;
    expect(isEffectTarget(sgAllies, 2, 2, 'SG')).toBe(true);
    expect(isEffectTarget(sgAllies, 2, 0, 'SG')).toBe(true);
    expect(isEffectTarget(sgAllies, 2, 0, 'SR')).toBe(false);
  });
});
