// ノイズ（430）: バーストの味方全体への持続回復（1 秒間隔・10 秒）。S1 の被弾の受けるダメージ▼・S2 の挑発は
// ダメージに関係せず、S2 のフルチャージの発のゲージの上乗せは未対応、S2・バーストの最大HP▲ は間接の notes（S1 は noEffect、S2 は unsupported）。V-0759。
import { describe, expect, it } from 'vitest';
import { characterOf, rawDefinition } from '../../__tests__/teamHelpers.ts';
import { gameSecondsToFrames } from '../../time.ts';
import { MAX_SKILL_LEVELS, resolveInstant, resolvePassives, resolveTimed } from '../resolve.ts';
import { parseSkillDefinition } from '../types.ts';

const noise = characterOf(430);
const def = parseSkillDefinition(rawDefinition(430));

describe('ノイズ（430）の定義', () => {
  it('resolves the burst heal over time on all allies on the burst use, for 10 s', () => {
    const instant = resolveInstant(def, noise, MAX_SKILL_LEVELS);
    expect(instant).toEqual([
      expect.objectContaining({
        kind: 'heal',
        target: 'allies',
        trigger: 'burstUse',
        durationFrames: gameSecondsToFrames(10),
        source: expect.objectContaining({ skill: 'burst' }),
      }),
    ]);
    expect(instant[0]!.value).toBeCloseTo(0.0247, 12);
  });

  it('scales the burst heal with the skill level (Lv1 1.36%)', () => {
    const [heal] = resolveInstant(def, noise, { skill1: 1, skill2: 1, burst: 1 });
    expect(heal!.value).toBeCloseTo(0.0136, 12);
  });

  it('keeps the damage-taken down and the taunt as no-damage notes, the gauge excess as unimplemented, and the max HP ups as indirect notes', () => {
    expect(resolveTimed(def, noise, MAX_SKILL_LEVELS)).toEqual([]);
    expect(resolvePassives(def, noise, MAX_SKILL_LEVELS)).toEqual([]);
    expect(def.skills.skill1.support).toBe('noEffect');
    expect(def.skills.skill2.support).toBe('unsupported');
    expect(def.skills.burst.support).toBe('supported');
    expect(def.skills.skill1.notes!.map((n) => n.kind)).toEqual(['noDamage']);
    expect(def.skills.skill2.notes!.map((n) => [n.kind, n.path])).toEqual([
      ['noDamage', undefined],
      ['unimplemented', undefined],
      ['indirect', 'hp'],
    ]);
    expect(def.skills.burst.notes!.map((n) => [n.kind, n.path])).toEqual([['indirect', 'hp']]);
  });
});
