// ドロシー：セレンディピティ編（plan/design-dorothy-serendipity.md 2 節）: ペレット数▲（pelletCount）・ペレットの数の固定（singlePellet）と、
// 発数の維持を命中率▲・貫通特化・固定に広げた語彙の検証と、1 発のペレットの数（pelletsPerShot）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pelletsPerShot, ZERO_BUFFS } from '../buffs.ts';
import { resolveTimed } from '../resolve.ts';
import { parseSkillDefinition } from '../types.ts';
import type { CharacterData } from '../../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

type Effects = { effects: Record<string, unknown>[] };
type Slot = 'skill1' | 'skill2' | 'burst';
const DOROTHY_S = 234;
const raw = readJson<{ skills: Record<Slot, Effects> }>(`../../../data/skills/${DOROTHY_S}.json`);
const character = readJson<CharacterData>(`../../../data/characters/${DOROTHY_S}.json`);

const indexOf = (slot: Slot, stat: string) => raw.skills[slot].effects.findIndex((e) => e.stat === stat);
const patched = (slot: Slot, index: number, patch: Record<string, unknown>) => {
  const copy = structuredClone(raw);
  copy.skills[slot].effects[index] = { ...copy.skills[slot].effects[index], ...patch };
  return () => parseSkillDefinition(copy);
};
const appended = (slot: Slot, effect: Record<string, unknown>) => {
  const copy = structuredClone(raw);
  copy.skills[slot].effects.push(effect);
  return () => parseSkillDefinition(copy);
};

describe('語彙の検証', () => {
  it('accepts the definition', () => {
    expect(() => parseSkillDefinition(raw)).not.toThrow();
  });

  it('takes Pellet count up only with scaling "flat" and target "self"', () => {
    const i = indexOf('burst', 'pelletCount');
    expect(patched('burst', i, { scaling: undefined })).toThrow(/pelletCount needs scaling "flat"/);
    expect(patched('burst', i, { target: 'allies' })).toThrow(/pelletCount is only allowed with target "self"/);
  });

  it('takes the single pellet as a flag of self in timed only', () => {
    const i = indexOf('skill1', 'singlePellet');
    expect(patched('skill1', i, { ref: 1 })).toThrow(/singlePellet has no value/);
    expect(patched('skill1', i, { target: 'allies' })).toThrow(/singlePellet is only allowed with target "self"/);
    expect(
      appended('skill2', { kind: 'passive', target: 'self', stat: 'pelletCount', scaling: 'flat', ref: 1 }),
    ).toThrow(/pelletCount is only allowed in timed/);
  });

  it('allows a duration in shots on Hit Rate up, Pierce and the single pellet, but not on ATK', () => {
    const hit = indexOf('skill1', 'hitRate');
    expect(patched('skill1', hit, { stat: 'attack' })).toThrow(/a duration in shots is not supported for "attack"/);
    expect(patched('burst', indexOf('burst', 'pelletCount'), { durationRef: undefined, durationShotsRef: 6 })).toThrow(
      /a duration in shots is not supported for "pelletCount"/,
    );
  });

  it('resolves the Pellet count up at each skill level as a count (not divided by 100)', () => {
    const definition = parseSkillDefinition(raw);
    const at = (level: number) =>
      resolveTimed(definition, character, { skill1: 10, skill2: 10, burst: level }).find(
        (e) => e.stat === 'pelletCount',
      )!.value;
    expect(at(1)).toBe(3);
    expect(at(10)).toBe(5);
  });
});

describe('1 発のペレットの数（pelletsPerShot）', () => {
  it('adds the Pellet count up to the base count, and the single pellet wins over it (C-1077)', () => {
    expect(pelletsPerShot(10, ZERO_BUFFS)).toBe(10);
    expect(pelletsPerShot(10, { pelletCount: 5, singlePellet: 0 })).toBe(15);
    expect(pelletsPerShot(10, { pelletCount: 5, singlePellet: 1 })).toBe(1);
    expect(pelletsPerShot(10, { pelletCount: 0, singlePellet: 2 })).toBe(1);
  });

  it('does not change a weapon with one pellet', () => {
    expect(pelletsPerShot(1, { pelletCount: 5, singlePellet: 0 })).toBe(1);
  });
});
