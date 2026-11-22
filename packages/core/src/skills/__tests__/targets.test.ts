import { describe, expect, it } from 'vitest';
import { isEffectTarget, needsFixedTargets } from '../targets.ts';

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

describe('needsFixedTargets', () => {
  it('is false for a target decided without the composition', () => {
    expect(needsFixedTargets({ target: 'self' })).toBe(false);
    expect(needsFixedTargets({ target: 'allies' })).toBe(false);
    expect(needsFixedTargets({ target: 'burstUsers' })).toBe(false);
    // 「自分を除く」は、順位の対象（topAttack）では順位から外すだけで、枠を先に決めない
    expect(needsFixedTargets({ target: 'topAttack', excludeSelf: 'always' })).toBe(false);
  });

  it('is true for each target decided by the composition', () => {
    expect(needsFixedTargets({ target: 'longestChargeTime' })).toBe(true);
    expect(needsFixedTargets({ target: 'lowestHpRatio' })).toBe(true);
    expect(needsFixedTargets({ target: 'allies', targetSquad: 'same' })).toBe(true);
    expect(needsFixedTargets({ target: 'allies', targetCharacter: 330 })).toBe(true);
    expect(needsFixedTargets({ target: 'allies', targetState: 'camouflage' })).toBe(true);
    expect(needsFixedTargets({ target: 'allies', targetAdjacent: true })).toBe(true);
    expect(needsFixedTargets({ target: 'allies', targetBurstStep: 'Step3' })).toBe(true);
    expect(needsFixedTargets({ target: 'allies', targetLeftmost: true })).toBe(true);
    expect(needsFixedTargets({ target: 'allies', excludeSelf: 'always' })).toBe(true);
  });

  it('makes isEffectTarget throw when the composition has not written fixedTargets', () => {
    const slot = { weaponType: 'AR', element: 'Fire' } as const;
    expect(() => isEffectTarget({ target: 'allies', targetAdjacent: true }, 0, 1, slot)).toThrow(/needs fixedTargets/);
    expect(isEffectTarget({ target: 'allies', targetAdjacent: true, fixedTargets: [1] }, 0, 1, slot)).toBe(true);
    expect(isEffectTarget({ target: 'allies', targetAdjacent: true, fixedTargets: [1] }, 0, 2, slot)).toBe(false);
  });
});
