// 紅蓮編（plan/design-scarlet.md 2 節）: 現在の HP▼（即時効果 currentHpDown）と、timed の「自分の HP が X% 以下の場合」の条件
// （selfHp の atMostRef・atMost）の語彙の検証と解決
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MAX_SKILL_LEVELS, resolveInstant, resolveTimed } from '../resolve.ts';
import { parseSkillDefinition } from '../types.ts';
import type { CharacterData } from '../../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

type Effects = { effects: Record<string, unknown>[] };
const SCARLET = 222;
const raw = readJson<{ skills: { skill1: Effects; skill2: Effects; burst: Effects } }>(
  `../../../data/skills/${SCARLET}.json`,
);
const character = readJson<CharacterData>(`../../../data/characters/${SCARLET}.json`);
const hpDown = raw.skills.skill1.effects.findIndex((e) => e.kind === 'currentHpDown');
const critRate = raw.skills.burst.effects.findIndex((e) => e.stat === 'critRate');

const patched = (slot: 'skill1' | 'burst', index: number, patch: Record<string, unknown>) => {
  const copy = structuredClone(raw);
  copy.skills[slot].effects[index] = { ...copy.skills[slot].effects[index], ...patch };
  return () => parseSkillDefinition(copy);
};
const added = (slot: 'skill1' | 'skill2' | 'burst', effect: Record<string, unknown>) => {
  const copy = structuredClone(raw);
  copy.skills[slot].effects.push(effect);
  return () => parseSkillDefinition(copy);
};

describe('語彙の検証', () => {
  it('accepts the definition', () => {
    expect(() => parseSkillDefinition(raw)).not.toThrow();
  });

  it('takes currentHpDown only on self, without narrowing', () => {
    expect(patched('skill1', hpDown, { target: 'allies' })).toThrow(/currentHpDown must target "self"/);
    expect(patched('skill1', hpDown, { targetWeapon: 'AR' })).toThrow(/currentHpDown cannot narrow its target/);
    expect(patched('skill1', hpDown, { durationRef: 3 })).toThrow(/unknown field/);
  });

  it('takes only the at-most selfHp on timed, and not on stats tracked in the first pass', () => {
    expect(patched('burst', critRate, { condition: { selfHp: { atMost: 50 } } })).not.toThrow();
    expect(patched('burst', critRate, { condition: { selfHp: { atLeastRef: 1 } } })).toThrow(
      /timed only takes \{ atMostRef \} or \{ atMost \}/,
    );
    expect(patched('burst', critRate, { condition: { selfHp: { atMostRef: 1, atMost: 50 } } })).toThrow(
      /write exactly one of/,
    );
    expect(patched('burst', critRate, { stat: 'attack' })).toThrow(/selfHp is not supported for "attack"/);
  });

  it('takes only the at-least selfHp on passive', () => {
    const passive = (selfHp: Record<string, number>) =>
      added('skill2', { kind: 'passive', target: 'self', stat: 'attack', ref: 2, condition: { selfHp } });
    expect(passive({ atLeastRef: 1 })).not.toThrow();
    expect(passive({ atMostRef: 1 })).toThrow(/passive only takes \{ atLeastRef \} or \{ atLeast \}/);
  });
});

describe('解決', () => {
  const definition = parseSkillDefinition(raw);

  it('resolves the current HP down as a ratio of the Lv value', () => {
    const effect = resolveInstant(definition, character, MAX_SKILL_LEVELS).find((e) => e.kind === 'currentHpDown');
    expect(effect).toMatchObject({ target: 'self', value: 0.0401 });
  });

  it('resolves atMostRef into the percent of the Lv value', () => {
    const effect = resolveTimed(definition, character, MAX_SKILL_LEVELS).find((e) => e.stat === 'critRate');
    expect(effect?.condition).toEqual({ selfHp: { atMost: 50 } });
  });
});
