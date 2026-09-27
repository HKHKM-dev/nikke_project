// アスカ（830）: 属性で絞る対象（targetElement）の DSL・解決・対象の判定と、バーストの吸収回復の書き方（plan/design-asuka.md 2 節・経過）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CharacterData } from '../../types.ts';
import { MAX_SKILL_LEVELS, resolveInstant, resolveTimed } from '../resolve.ts';
import { canEverTarget, isEffectTarget } from '../targets.ts';
import { parseSkillDefinition } from '../types.ts';

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

describe('バーストの吸収回復（V-0022 の後）', () => {
  it('is one heal on the burst use, not a heal on every hit', () => {
    const def = parseSkillDefinition(raw830);
    const heals = resolveInstant(def, asuka, MAX_SKILL_LEVELS).filter((e) => e.kind === 'heal');
    expect(heals).toHaveLength(1);
    expect(heals[0]).toMatchObject({ kind: 'heal', trigger: 'burstUse', target: 'self' });
    expect(heals[0]!.value).toBeCloseTo(0.0316, 10);
  });
});
