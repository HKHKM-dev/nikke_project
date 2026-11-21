// スノーホワイト：イノセントデイズ（224）の定義（plan/design-snow-white-id.md）: 検証と、Lv ごとの解決値（S1・S2 の分かれたヒット・
// バーストの命中回数条件▼の間隔）
import { describe, expect, it } from 'vitest';
import { characterOf, rawDefinition } from '../../__tests__/data.ts';
import { resolveDamageEffects } from '../burstDamage.ts';
import { resolveCycleEvery } from '../cycles.ts';
import { parseSkillDefinition } from '../parse/definition.ts';
import { MAX_SKILL_LEVELS } from '../resolve.ts';

type Effects = { effects: Record<string, unknown>[] };
type Raw = { skills: { skill1: Effects; skill2: Effects; burst: Effects } };
const SNOW_WHITE_ID = 224;
const raw = rawDefinition<Raw>(SNOW_WHITE_ID);
const character = characterOf(SNOW_WHITE_ID);

describe('定義の検証', () => {
  it('accepts the definition', () => {
    expect(() => parseSkillDefinition(raw)).not.toThrow();
  });
});

describe('解決', () => {
  const def = parseSkillDefinition(raw);
  const damages = (levels = MAX_SKILL_LEVELS) => resolveDamageEffects(def, character, levels);

  it('splits the S1 damage into 2 hits and the S2 damage into 35 hits of equal shares', () => {
    const [s1, s2] = damages();
    expect(s1!.source.skill).toBe('skill1');
    expect(s1!.multiplier * 2).toBeCloseTo(1.8868, 6);
    expect(s1!.hitOffsets).toEqual([0, 11]);
    expect(s1!.delayFrames).toBe(36);
    expect(s2!.source.skill).toBe('skill2');
    expect(s2!.multiplier * 35).toBeCloseTo(0.6169, 6);
    expect(s2!.hitOffsets).toHaveLength(35);
    expect(s2!.hitOffsets!.at(-1)).toBe(100);
    expect(s2!.delayFrames).toBe(20);
  });

  it('resolves the Lv 1 values from the description', () => {
    const [s1, s2] = damages({ skill1: 1, skill2: 1, burst: 1 });
    expect(s1!.multiplier * 2).toBeCloseTo(1.291, 6);
    expect(s2!.multiplier * 35).toBeCloseTo(0.3645, 6);
  });

  it('lowers the S2 count from 50 to 30 for 10 seconds on Burst use', () => {
    const [every] = resolveCycleEvery(def, character, MAX_SKILL_LEVELS);
    expect(every).toMatchObject({ targetSkill: 'skill2', target: 'shotCounts', every: 30, durationFrames: 588 });
  });
});
