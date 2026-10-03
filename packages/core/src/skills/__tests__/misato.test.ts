// ミサト（833）: S1「射撃マニュアル」の命中率▲（60 発ごとに自分に 1 スタック・3 スタック・5 秒）の解決と、
// ダメージに関係しない S2・バースト（unsupported と notes）。V-0110。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { gameSecondsToFrames } from '../../time.ts';
import type { CharacterData } from '../../types.ts';
import { MAX_SKILL_LEVELS, resolveInstant, resolvePassives, resolveTimed } from '../resolve.ts';
import { parseSkillDefinition } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const misato = readJson<CharacterData>('../../../data/characters/833.json');
const def = parseSkillDefinition(readJson<unknown>('../../../data/skills/833.json'));

describe('ミサト（833）の定義', () => {
  it('resolves S1 to a self hit rate up every 60 normal shots, 3 stacks for 5 s', () => {
    const timed = resolveTimed(def, misato, MAX_SKILL_LEVELS);
    expect(timed).toHaveLength(1);
    const [hit] = timed;
    expect(hit).toMatchObject({
      stat: 'hitRate',
      target: 'self',
      maxStacks: 3,
      durationFrames: gameSecondsToFrames(5),
    });
    expect(hit!.trigger).toEqual({ count: 'normalShot', every: 60 });
    expect(hit!.value).toBeCloseTo(0.0504, 12);
  });

  it('scales the hit rate up with the skill level (Lv1 2.52%)', () => {
    const lv1 = resolveTimed(def, misato, { skill1: 1, skill2: 1, burst: 1 });
    expect(lv1[0]!.value).toBeCloseTo(0.0252, 12);
  });

  it('has nothing else that affects damage (S2 and the burst are notes only)', () => {
    expect(def.skills.skill2.support).toBe('unsupported');
    expect(def.skills.burst.support).toBe('unsupported');
    expect(resolveInstant(def, misato, MAX_SKILL_LEVELS)).toEqual([]);
    expect(resolvePassives(def, misato, MAX_SKILL_LEVELS)).toEqual([]);
  });
});
