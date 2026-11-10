// エード：エージェントバニー編（plan/design-agent-bunny.md 2 節）: 適正最小射程距離▲（minEffectiveRange）・条件 inEffectiveRange・
// 貫通特化（pierce）・貫通ダメージ▲（pierceDamage）の語彙の検証と式
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeTriggerDamage } from '../../damage.ts';
import { computeFixedSpecAttack } from '../../fixedSpec.ts';
import { ZERO_BUFFS, type BuffTotals } from '../buffs.ts';
import { parseSkillDefinition } from '../types.ts';
import type { CharacterData } from '../../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

type Effects = { effects: Record<string, unknown>[] };
const ADE_AB = 315;
const raw = readJson<{ skills: { skill1: Effects; skill2: Effects; burst: Effects } }>(
  `../../../data/skills/${ADE_AB}.json`,
);
const character = readJson<CharacterData>(`../../../data/characters/${ADE_AB}.json`);

const patched = (slot: 'skill1' | 'skill2', index: number, patch: Record<string, unknown>) => {
  const copy = structuredClone(raw);
  copy.skills[slot].effects[index] = { ...copy.skills[slot].effects[index], ...patch };
  return () => parseSkillDefinition(copy);
};

describe('語彙の検証', () => {
  it('accepts the definition', () => {
    expect(() => parseSkillDefinition(raw)).not.toThrow();
  });

  it('takes inEffectiveRange only as true', () => {
    expect(patched('skill1', 0, { condition: { inEffectiveRange: false } })).toThrow(/inEffectiveRange: expected true/);
  });

  it('allows while on Pierce but not on the other passive flags', () => {
    const pierce = raw.skills.skill2.effects.findIndex((e) => e.stat === 'pierce');
    expect(patched('skill2', pierce, { stat: 'elementAdvantage' })).toThrow(/elementAdvantage cannot have while/);
  });
});

describe('貫通ダメージ▲の式（P1。plan/design-agent-bunny.md 2.3 節）', () => {
  const { attack, growth } = computeFixedSpecAttack(character);
  const hit = (buffs: Partial<BuffTotals>) =>
    computeTriggerDamage({
      character: { ...character, crit: { ...character.crit, rate: 0 } },
      growth,
      attackOverride: attack,
      enemy: { defence: 100, element: null, hasCore: true },
      condition: { coreHitRate: 1, distanceBonus: true, fullCharge: true },
      buffs: { ...ZERO_BUFFS, ...buffs },
    }).normal;

  it('adds Pierce Damage up to the Attack Damage up sum only while the slot has Pierce', () => {
    expect(hit({ pierceDamage: 0.1836 })).toBe(hit({}));
    expect(hit({ pierce: 1, pierceDamage: 0.1836, attackDamage: 0.5504 })).toBeCloseTo(hit({ attackDamage: 0.734 }), 6);
  });

  it("keeps Pierce Damage up, Projectile Explosion Damage up and Attack Damage up in one sum (I-DOLL Flower's explosion)", () => {
    const flower = readJson<CharacterData>(`../../../data/characters/304.json`);
    const fixed = computeFixedSpecAttack(flower);
    const rl = (buffs: Partial<BuffTotals>) =>
      computeTriggerDamage({
        character: { ...flower, crit: { ...flower.crit, rate: 0 } },
        growth: fixed.growth,
        attackOverride: fixed.attack,
        enemy: { defence: 100, element: null, hasCore: true },
        condition: { coreHitRate: 0, distanceBonus: false, fullCharge: true },
        buffs: { ...ZERO_BUFFS, ...buffs },
      }).normal;
    expect(rl({ pierce: 1, pierceDamage: 0.2, projectileExplosionDamage: 0.1, attackDamage: 0.5 })).toBeCloseTo(
      rl({ pierce: 1, pierceDamage: 0.3, attackDamage: 0.5 }),
      6,
    );
  });
});
