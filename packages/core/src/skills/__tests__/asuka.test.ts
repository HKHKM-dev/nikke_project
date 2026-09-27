// アスカ（830）: 属性で絞る対象（targetElement）と吸収回復（lifesteal）の DSL・解決・回復のフレーム（plan/design-asuka.md 2 節）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CharacterData } from '../../types.ts';
import { lifestealHealFrames } from '../heals.ts';
import { MAX_SKILL_LEVELS, resolveLifesteal, resolveTimed } from '../resolve.ts';
import { canEverTarget, isEffectTarget } from '../targets.ts';
import { parseSkillDefinition } from '../types.ts';
import { gameSecondsToFrames } from '../../time.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const asuka = readJson<CharacterData>('../../../data/characters/830.json');
const raw830 = readJson<{ skills: Record<string, { effects: unknown[] }> }>('../../../data/skills/830.json');

/** 830.json を写して、slot の effects を差し替えた定義を検証にかける */
function withEffects(slot: 'skill1' | 'skill2' | 'burst', effects: unknown[]): unknown {
  const copy = structuredClone(raw830) as { skills: Record<string, { effects: unknown[] }> };
  copy.skills[slot]!.effects = effects;
  return copy;
}

const LIFESTEAL = { kind: 'lifesteal', trigger: 'burstUse', target: 'self', ref: 4, durationRef: 5 };
const CORE_FIRE = {
  kind: 'timed',
  trigger: 'fullBurstStart',
  target: 'allies',
  targetElement: 'Fire',
  stat: 'coreDamage',
  ref: 3,
  durationRef: 4,
};

describe('targetElement（2.2 節）', () => {
  it('parses on allies and resolves with the element', () => {
    const def = parseSkillDefinition(raw830);
    const core = resolveTimed(def, asuka, MAX_SKILL_LEVELS).find((e) => e.stat === 'coreDamage')!;
    expect(core).toMatchObject({ target: 'allies', targetElement: 'Fire', trigger: 'fullBurstStart' });
    expect(core.value).toBeCloseTo(0.6007, 10);
  });

  it('is rejected on self and for an unknown element', () => {
    expect(() => parseSkillDefinition(withEffects('skill2', [{ ...CORE_FIRE, target: 'self' }]))).toThrow(
      /targetElement: only allowed with target/,
    );
    expect(() => parseSkillDefinition(withEffects('skill2', [{ ...CORE_FIRE, targetElement: 'Flame' }]))).toThrow(
      /targetElement: expected one of/,
    );
  });

  it('targets only the slots of the element, and both filters when a weapon is also given', () => {
    const fireAr = { weaponType: 'AR', element: 'Fire' } as const;
    const windRl = { weaponType: 'RL', element: 'Wind' } as const;
    const fireRl = { weaponType: 'RL', element: 'Fire' } as const;
    const e = { target: 'allies', targetElement: 'Fire' } as const;
    expect(isEffectTarget(e, 2, 2, fireAr)).toBe(true);
    expect(isEffectTarget(e, 2, 0, windRl)).toBe(false);
    expect(isEffectTarget({ ...e, targetWeapon: 'AR' }, 2, 1, fireRl)).toBe(false);
    expect(isEffectTarget({ ...e, targetWeapon: 'AR' }, 2, 1, fireAr)).toBe(true);
    expect(canEverTarget(e, 2, 0, windRl)).toBe(false);
    expect(canEverTarget(e, 2, 0, fireRl)).toBe(true);
  });
});

describe('lifesteal（2.1 節）', () => {
  it('resolves the heal ratio and the duration', () => {
    const def = parseSkillDefinition(raw830);
    const [lifesteal] = resolveLifesteal(def, asuka, MAX_SKILL_LEVELS);
    expect(lifesteal).toMatchObject({ kind: 'lifesteal', trigger: 'burstUse', target: 'self' });
    expect(lifesteal!.value).toBeCloseTo(0.0316, 10);
    expect(lifesteal!.durationFrames).toBe(gameSecondsToFrames(10));
  });

  it('rejects the healed trigger, the topAttack target, a missing duration and unknown fields', () => {
    const parse = (e: object) => () => parseSkillDefinition(withEffects('burst', [e]));
    expect(parse({ ...LIFESTEAL, trigger: 'healed' })).toThrow(/lifesteal cannot be triggered by "healed"/);
    expect(parse({ ...LIFESTEAL, target: 'topAttack', targetCount: 2 })).toThrow(/unknown field|cannot target/);
    expect(parse({ ...LIFESTEAL, target: 'topAttack' })).toThrow(/lifesteal cannot target "topAttack"/);
    const { durationRef: _omit, ...noDuration } = LIFESTEAL;
    expect(parse(noDuration)).toThrow(/exactly one of durationRef and durationSeconds/);
    expect(parse({ ...LIFESTEAL, stat: 'attack' })).toThrow(/stat: unknown field/);
  });

  it('heals on the frame after each shot inside the windows, not after the window or past the battle', () => {
    // 窓 [10, 20)・[30, 35)。19 は窓の中、20・35 は外。39 の次は 40 = frames なので捨てる
    const windows: [number, number][] = [
      [10, 20],
      [30, 35],
    ];
    expect(lifestealHealFrames([5, 10, 15, 19, 20, 29, 30, 34, 35], windows, 100)).toEqual([11, 16, 20, 31, 35]);
    expect(lifestealHealFrames([30, 34], [[30, 40]], 35)).toEqual([31]);
    expect(lifestealHealFrames([1, 2], [], 100)).toEqual([]);
  });
});
