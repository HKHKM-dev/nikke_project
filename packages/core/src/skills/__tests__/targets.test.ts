import { describe, expect, it } from 'vitest';
import { isEffectTarget } from '../targets.ts';

describe('isEffectTarget', () => {
  it('self applies only to the source slot', () => {
    expect(isEffectTarget('self', 2, 2)).toBe(true);
    expect(isEffectTarget('self', 2, 0)).toBe(false);
  });

  it('allies applies to every slot, including the source', () => {
    expect(isEffectTarget('allies', 2, 2)).toBe(true);
    expect(isEffectTarget('allies', 2, 4)).toBe(true);
  });
});
