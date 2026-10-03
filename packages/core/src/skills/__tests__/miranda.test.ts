// ミランダ（32）: S1「ヘルスアップ！」の命中率▲（30 ヒットごとに味方全体 5.44%・SMG の味方 3.79%・5 秒）と、
// 宝物版 S1 の自分の攻撃力▲（50.06%・5 秒）の解決。S2・バーストは未実装の notes（V-0114）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { gameSecondsToFrames } from '../../time.ts';
import type { CharacterData } from '../../types.ts';
import { MAX_SKILL_LEVELS, resolveInstant, resolveTimed } from '../resolve.ts';
import { applyTreasure } from '../treasure.ts';
import { parseSkillDefinition } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const miranda = readJson<CharacterData>('../../../data/characters/32.json');
const def = parseSkillDefinition(readJson<unknown>('../../../data/skills/32.json'));
const FIVE_SECONDS = gameSecondsToFrames(5);

describe('ミランダ（32）の定義', () => {
  it('resolves S1 to two hit rate ups every 30 normal hits (all allies, and SMG allies)', () => {
    const timed = resolveTimed(def, miranda, MAX_SKILL_LEVELS);
    expect(timed).toHaveLength(2);
    const [all, smg] = timed;
    expect(all).toMatchObject({ stat: 'hitRate', target: 'allies', durationFrames: FIVE_SECONDS });
    expect(all!.trigger).toEqual({ count: 'normalHit', every: 30 });
    expect(all!.value).toBeCloseTo(0.0544, 12);
    expect(all!.targetWeapon).toBeUndefined();
    expect(smg).toMatchObject({ stat: 'hitRate', target: 'allies', targetWeapon: 'SMG', durationFrames: FIVE_SECONDS });
    expect(smg!.value).toBeCloseTo(0.0379, 12);
    expect(all!.maxStacks).toBeUndefined();
  });

  it('adds the self ATK up to S1 at treasure phase 3, and keeps S2 and the burst unsupported', () => {
    const applied = applyTreasure(miranda, def, 3);
    const timed = resolveTimed(applied.definition!, applied.character, MAX_SKILL_LEVELS);
    expect(timed.map((e) => e.stat)).toEqual(['hitRate', 'hitRate', 'attack']);
    const atk = timed[2]!;
    expect(atk).toMatchObject({ target: 'self', durationFrames: FIVE_SECONDS });
    expect(atk.trigger).toEqual({ count: 'normalHit', every: 30 });
    expect(atk.value).toBeCloseTo(0.5006, 12);
    expect(applied.definition!.skills.skill2.support).toBe('unsupported');
    expect(applied.definition!.skills.burst.support).toBe('unsupported');
  });

  it('has nothing else that affects damage in the model (S2 and the burst are not implemented)', () => {
    expect(def.skills.skill2.support).toBe('unsupported');
    expect(def.skills.burst.support).toBe('unsupported');
    expect(resolveInstant(def, miranda, MAX_SKILL_LEVELS)).toEqual([]);
  });
});
