// ノイズ（430）: バーストの味方全体への持続回復（1 秒間隔・10 秒）。S1 の被弾の受けるダメージ▼・S2 の挑発は
// ダメージに関係せず、S2・バーストの最大HP▲ は間接の notes（S1・S2 は noEffect）。V-0759。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { gameSecondsToFrames } from '../../time.ts';
import type { CharacterData } from '../../types.ts';
import { MAX_SKILL_LEVELS, resolveInstant, resolvePassives, resolveTimed } from '../resolve.ts';
import { parseSkillDefinition } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const noise = readJson<CharacterData>('../../../data/characters/430.json');
const def = parseSkillDefinition(readJson<unknown>('../../../data/skills/430.json'));

describe('ノイズ（430）の定義', () => {
  it('resolves the burst heal over time on all allies on the burst use, for 10 s', () => {
    const instant = resolveInstant(def, noise, MAX_SKILL_LEVELS);
    expect(instant).toHaveLength(1);
    const [heal] = instant;
    expect(heal).toMatchObject({
      kind: 'heal',
      target: 'allies',
      trigger: 'burstUse',
      durationFrames: gameSecondsToFrames(10),
    });
    expect(heal!.source.skill).toBe('burst');
    expect(heal!.value).toBeCloseTo(0.0247, 12);
  });

  it('scales the burst heal with the skill level (Lv1 1.36%)', () => {
    const [heal] = resolveInstant(def, noise, { skill1: 1, skill2: 1, burst: 1 });
    expect(heal!.value).toBeCloseTo(0.0136, 12);
  });

  it('keeps the damage-taken down and the taunt as no-damage notes, and the max HP ups as indirect notes', () => {
    expect(resolveTimed(def, noise, MAX_SKILL_LEVELS)).toEqual([]);
    expect(resolvePassives(def, noise, MAX_SKILL_LEVELS)).toEqual([]);
    expect(def.skills.skill1.support).toBe('noEffect');
    expect(def.skills.skill2.support).toBe('noEffect');
    expect(def.skills.burst.support).toBe('supported');
    expect(def.skills.skill1.notes!.map((n) => n.kind)).toEqual(['noDamage']);
    expect(def.skills.skill2.notes!.map((n) => [n.kind, n.path])).toEqual([
      ['noDamage', undefined],
      ['indirect', 'hp'],
    ]);
    expect(def.skills.burst.notes!.map((n) => [n.kind, n.path])).toEqual([['indirect', 'hp']]);
  });
});
