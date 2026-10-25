// ミサト（833）: S1「射撃マニュアル」の命中率▲（60 発ごとに自分に 1 スタック・3 スタック・5 秒）の解決と、
// S1 の回復（2 段目の段 8。残りの HP の割合が最も低い味方 1 機。C-0567）、ダメージに効く効果の無い S2（noEffect）と、
// バーストの味方全体の持続回復（5 秒間維持。C-0646）。V-0110。
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

  it('resolves the S1 heal on the ally with the lowest HP ratio every 120 normal shots (2 段目の段 8)', () => {
    const instant = resolveInstant(def, misato, MAX_SKILL_LEVELS);
    expect(instant).toHaveLength(2);
    expect(instant[0]).toMatchObject({
      kind: 'heal',
      target: 'lowestHpRatio',
      targetCount: 1,
      trigger: { count: 'normalShot', every: 120 },
    });
    expect(instant[0]!.value).toBeCloseTo(0.0804, 12);
  });

  it('resolves the burst heal over time on all allies for 5 s (C-0646)', () => {
    const burst = resolveInstant(def, misato, MAX_SKILL_LEVELS)[1]!;
    expect(burst).toMatchObject({
      kind: 'heal',
      target: 'allies',
      trigger: 'burstUse',
      durationFrames: gameSecondsToFrames(5),
    });
    expect(burst.source.skill).toBe('burst');
    expect(burst.value).toBeCloseTo(0.0506, 12);
    expect(def.skills.burst.support).toBe('supported');
  });

  it('defines nothing else (S2 has no effect on damage)', () => {
    expect(def.skills.skill2.support).toBe('noEffect');
    expect(resolvePassives(def, misato, MAX_SKILL_LEVELS)).toEqual([]);
  });
});
