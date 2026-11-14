// マルチャーナ（321）: S1 の最後の弾丸の味方全体への吸収回復（3 秒）と、S2 のバースト使用時の味方全体への 1 回の回復。
// S1 の受けるHP回復量▲・バーストの保存と防御力▲は間接の notes（バーストは noEffect）。V-0756。
import { describe, expect, it } from 'vitest';
import { gameSecondsToFrames } from '../../time.ts';
import { characterOf, rawDefinition } from '../../__tests__/teamHelpers.ts';
import { MAX_SKILL_LEVELS, resolveInstant, resolvePassives, resolveTimed } from '../resolve.ts';
import { parseSkillDefinition } from '../types.ts';

const marciana = characterOf(321);
const def = parseSkillDefinition(rawDefinition(321));
const instant = resolveInstant(def, marciana, MAX_SKILL_LEVELS);

describe('マルチャーナ（321）の定義', () => {
  it('resolves the S1 lifesteal on all allies on the last bullet, for 3 s', () => {
    const [s1] = instant;
    expect(s1).toMatchObject({
      kind: 'heal',
      target: 'allies',
      trigger: { count: 'lastShot' },
      durationFrames: gameSecondsToFrames(3),
    });
    expect(s1!.source.skill).toBe('skill1');
    expect(s1!.value).toBeCloseTo(0.1095, 12);
  });

  it('scales the S1 lifesteal with the skill level (Lv1 6.47%)', () => {
    const [s1] = resolveInstant(def, marciana, { skill1: 1, skill2: 1, burst: 1 });
    expect(s1!.value).toBeCloseTo(0.0647, 12);
  });

  it('resolves the S2 one-off heal on all allies on the burst use', () => {
    expect(instant).toHaveLength(2);
    const s2 = instant[1]!;
    expect(s2).toMatchObject({ kind: 'heal', target: 'allies', trigger: 'burstUse' });
    expect(s2.durationFrames).toBeUndefined();
    expect(s2.source.skill).toBe('skill2');
    expect(s2.value).toBeCloseTo(0.2811, 12);
  });

  it('keeps the HP-recovery-received up, Storage and DEF up as indirect notes (the burst has no effect)', () => {
    expect(resolveTimed(def, marciana, MAX_SKILL_LEVELS)).toEqual([]);
    expect(resolvePassives(def, marciana, MAX_SKILL_LEVELS)).toEqual([]);
    expect(def.skills.skill1.support).toBe('supported');
    expect(def.skills.skill2.support).toBe('supported');
    expect(def.skills.burst.support).toBe('noEffect');
    expect(def.skills.skill1.notes!.map((n) => [n.kind, n.path])).toEqual([['indirect', 'hp']]);
    expect(def.skills.burst.notes!.map((n) => [n.kind, n.path])).toEqual([
      ['indirect', 'hp'],
      ['indirect', 'defense'],
    ]);
  });
});
