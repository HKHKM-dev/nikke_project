// 受けるダメージ編: 敵の受けるダメージ▲（stat damageTaken）の検証と、倍率ダメージ・持続ダメージへの掛け方（plan/design-damage-taken.md）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CharacterData } from '../../types.ts';
import { computeBurstHit, resolveDotEffects } from '../burstDamage.ts';
import { MAX_SKILL_LEVELS } from '../resolve.ts';
import { parseSkillDefinition } from '../types.ts';

const kurumi = JSON.parse(
  readFileSync(new URL('../../../data/characters/862.json', import.meta.url), 'utf8'),
) as CharacterData;
const raw862 = JSON.parse(readFileSync(new URL('../../../data/skills/862.json', import.meta.url), 'utf8')) as {
  skills: Record<string, { effects: Record<string, unknown>[] }>;
};

/** 862.json を写して、burst の効果を書き換えた定義を検証にかける */
function withBurstEffect(patch: Record<string, unknown>): unknown {
  const copy = structuredClone(raw862);
  copy.skills.burst!.effects[0] = { ...copy.skills.burst!.effects[0], ...patch };
  return copy;
}

describe('damageTaken の検証', () => {
  it('parses the burst of Kurumi', () => {
    const def = parseSkillDefinition(raw862);
    expect(def.skills.burst.effects[0]).toMatchObject({ kind: 'timed', target: 'allies', stat: 'damageTaken' });
  });

  it('only targets all allies, without narrowing by weapon or element', () => {
    expect(() => parseSkillDefinition(withBurstEffect({ target: 'self' }))).toThrow(/damageTaken must target "allies"/);
    expect(() => parseSkillDefinition(withBurstEffect({ targetWeapon: 'AR' }))).toThrow(
      /damageTaken cannot narrow its target/,
    );
  });
});

describe('computeBurstHit の damageTakenMultiplier', () => {
  // クルミの S1 の命中のハッキング（52.24%）
  const [hacking] = resolveDotEffects(parseSkillDefinition(raw862), kurumi, MAX_SKILL_LEVELS);
  const input = {
    attack: 79201,
    enemy: { defence: 100, element: null, hasCore: true },
    crit: { rate: 0.15, damage: 1.5 },
    attackDamageMultiplier: 1,
    elementMultiplier: 1,
    effects: [hacking!],
    fullBurstBonus: false,
  };

  it('defaults to 1 and multiplies every effect as its own multiplier (C-0138)', () => {
    const base = computeBurstHit(input);
    const up = computeBurstHit({ ...input, damageTakenMultiplier: 1.1806 });
    expect(base.damageTakenMultiplier).toBe(1);
    expect(up.damageTakenMultiplier).toBe(1.1806);
    expect(up.perActivation).toBeCloseTo(base.perActivation * 1.1806, 6);
    // 1 tick の会心なし: (79,201 − 100) × 52.24% × 1.1806 = 48,785.18（録画 095 の 48,785）
    expect(up.perActivation / up.boost.total).toBeCloseTo(48785.181, 2);
  });
});
