// ルマニ（240）: バーストの味方全体の通常攻撃ダメージ倍率▲（10 秒）。S1 のマッスルアップ（最大HP▲）とバーストの最大HP▲は間接の
// notes、S1 の挑発とバーストの受けるダメージ▼はダメージに関係しない notes、S2 のパーツダメージ▲は前提の外の notes。V-0762。
import { describe, expect, it } from 'vitest';
import { characterOf, rawDefinition } from '../../__tests__/teamHelpers.ts';
import { gameSecondsToFrames } from '../../time.ts';
import { MAX_SKILL_LEVELS, resolveInstant, resolvePassives, resolveTimed } from '../resolve.ts';
import { parseSkillDefinition } from '../types.ts';

const RUMANI = 240;
const rumani = characterOf(RUMANI);
const def = parseSkillDefinition(rawDefinition(RUMANI));

describe('ルマニ（240）の定義', () => {
  it('resolves the Burst normal attack damage multiplier up on all allies on the burst use, for 10 s', () => {
    const timed = resolveTimed(def, rumani, MAX_SKILL_LEVELS);
    expect(timed).toHaveLength(1);
    expect(timed[0]).toMatchObject({
      trigger: 'burstUse',
      target: 'allies',
      stat: 'normalAttackDamage',
      durationFrames: gameSecondsToFrames(10),
      source: { skill: 'burst' },
    });
    expect(timed[0]!.value).toBeCloseTo(0.1005, 12);
  });

  it('scales the multiplier with the Burst level (Lv1 5.94%, Lv4 7.31%)', () => {
    expect(resolveTimed(def, rumani, { skill1: 1, skill2: 1, burst: 1 })[0]!.value).toBeCloseTo(0.0594, 12);
    expect(resolveTimed(def, rumani, { skill1: 4, skill2: 4, burst: 4 })[0]!.value).toBeCloseTo(0.0731, 12);
  });

  it('keeps S1, S2 and the other Burst lines as notes', () => {
    expect(resolveInstant(def, rumani, MAX_SKILL_LEVELS)).toEqual([]);
    expect(resolvePassives(def, rumani, MAX_SKILL_LEVELS)).toEqual([]);
    expect(def.skills.skill1.support).toBe('noEffect');
    expect(def.skills.skill2.support).toBe('noEffect');
    expect(def.skills.burst.support).toBe('supported');
    // S1 も バーストも、最大HP▲（間接）とダメージに関係しない行の 2 つ
    for (const slot of ['skill1', 'burst'] as const) {
      expect(def.skills[slot].notes!.map((n) => [n.kind, n.path])).toEqual([
        ['indirect', 'hp'],
        ['noDamage', undefined],
      ]);
    }
    expect(def.skills.skill2.notes!.map((n) => n.kind)).toEqual(['outOfScope']);
  });
});
