// ロザンナ：シックオーシャン（283）: バーストの味方全体の持続ダメージ▲と敵全体の受けるダメージ▲（10 秒）の解決と、
// パーツの効果だけの S1（noEffect）と、S2 の 30 秒ごとの持続ダメージ（発動の 8f 後に付く。ゲージは未対応で partial）。V-0760。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { gameSecondsToFrames } from '../../time.ts';
import type { CharacterData } from '../../types.ts';
import { resolveDotEffects } from '../burstDamage.ts';
import { MAX_SKILL_LEVELS, resolveInstant, resolvePassives, resolveTimed } from '../resolve.ts';
import { parseSkillDefinition } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const rosanna = readJson<CharacterData>('../../../data/characters/283.json');
const def = parseSkillDefinition(readJson<unknown>('../../../data/skills/283.json'));

describe('ロザンナ：シックオーシャン（283）の定義', () => {
  it('resolves the burst to sustained damage up and damage taken up on all allies for 10 s', () => {
    const timed = resolveTimed(def, rosanna, MAX_SKILL_LEVELS);
    expect(timed.map((e) => e.stat)).toEqual(['sustainedDamage', 'damageTaken']);
    for (const e of timed) {
      expect(e).toMatchObject({ trigger: 'burstUse', target: 'allies', durationFrames: gameSecondsToFrames(10) });
      expect(e.source.skill).toBe('burst');
    }
    expect(timed[0]!.value).toBeCloseTo(0.2032, 12);
    expect(timed[1]!.value).toBeCloseTo(0.3223, 12);
    expect(def.skills.burst.support).toBe('supported');
  });

  it('scales the burst with the skill level (Lv7: 17.55% and 27.83%)', () => {
    const lv7 = resolveTimed(def, rosanna, { skill1: 7, skill2: 7, burst: 7 });
    expect(lv7[0]!.value).toBeCloseTo(0.1755, 12);
    expect(lv7[1]!.value).toBeCloseTo(0.2783, 12);
  });

  it('resolves S2 to a sustained damage every 30 s, applied 8 frames later, ticking on application and from 1.5 s every second for 15 s', () => {
    const [dot, ...rest] = resolveDotEffects(def, rosanna, MAX_SKILL_LEVELS);
    expect(rest).toEqual([]);
    expect(dot).toMatchObject({
      trigger: { everySeconds: 30 },
      sustained: true,
      dot: { intervalSeconds: 1, durationSeconds: 15, firstTick: 'atApplication', maxStacks: 1, tickDelayFrames: 8 },
    });
    expect(dot!.source.skill).toBe('skill2');
    expect(dot!.multiplier).toBeCloseTo(0.704, 12);
    // tick のゲージは未対応の notes
    expect(def.skills.skill2.support).toBe('partial');
  });

  it('defines nothing for S1 (parts only) and nothing else', () => {
    expect(def.skills.skill1.support).toBe('noEffect');
    expect(resolveInstant(def, rosanna, MAX_SKILL_LEVELS)).toEqual([]);
    expect(resolvePassives(def, rosanna, MAX_SKILL_LEVELS)).toEqual([]);
  });
});
