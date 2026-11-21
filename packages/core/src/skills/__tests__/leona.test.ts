// レオナ編（plan/design-leona.md 2 節）: 適正最大射程距離▲（maxEffectiveRange）と、自分以外の味方へのペレット数▲（pelletCount の
// allies・topAttack）の語彙の検証と、Lv ごとの解決値、上端を広げた距離ボーナスの判定（distanceBonusAt）
import { describe, expect, it } from 'vitest';
import { characterOf, RANGE_BIGARMS, rawDefinition } from '../../__tests__/teamHelpers.ts';
import { distanceBonusAt } from '../../frame/landing.ts';
import { NO_RANGE_UP, addRangeUp } from '../buffs.ts';
import { parseSkillDefinition } from '../parse/definition.ts';
import { resolveTimed } from '../resolve.ts';

type Effects = { effects: Record<string, unknown>[] };
type Slot = 'skill1' | 'skill2' | 'burst';
const LEONA = 382;
const raw = rawDefinition<{ skills: Record<Slot, Effects> }>(LEONA);
const character = characterOf(LEONA);

const indexOf = (slot: Slot, stat: string) => raw.skills[slot].effects.findIndex((e) => e.stat === stat);
const patched = (slot: Slot, index: number, patch: Record<string, unknown>) => {
  const copy = structuredClone(raw);
  copy.skills[slot].effects[index] = { ...copy.skills[slot].effects[index], ...patch };
  return () => parseSkillDefinition(copy);
};

describe('語彙の検証', () => {
  it('accepts the definition', () => {
    expect(() => parseSkillDefinition(raw)).not.toThrow();
  });

  it('takes Pellet count up on the top SG allies, but not the single pellet', () => {
    const i = indexOf('skill2', 'pelletCount');
    expect(patched('skill2', i, { target: 'allies', targetCountRef: undefined })).not.toThrow();
    expect(patched('skill2', i, { targetWeapon: undefined })).toThrow(/pelletCount on allies needs targetWeapon "SG"/);
    expect(patched('skill2', i, { stat: 'singlePellet', scaling: undefined, ref: undefined })).toThrow(
      /singlePellet is only allowed with target "self"/,
    );
  });
});

describe('解決値', () => {
  const definition = parseSkillDefinition(raw);
  const at = (level: number, stat: string) =>
    resolveTimed(definition, character, { skill1: level, skill2: level, burst: level })
      .filter((e) => e.stat === stat)
      .map((e) => e.value);

  it('resolves the Max Effective Range up as a ratio that does not change with the level', () => {
    expect(at(1, 'maxEffectiveRange')).toEqual([0.2]);
    expect(at(10, 'maxEffectiveRange')).toEqual([0.2]);
  });

  it('resolves the Pellet count up as a count', () => {
    expect(at(1, 'pelletCount')).toEqual([3]);
    expect(at(10, 'pelletCount')).toEqual([5]);
  });
});

describe('上端を広げた距離ボーナス（distanceBonusAt）', () => {
  const landing = (id: string) => RANGE_BIGARMS.landings.find((l) => l.id === id)!;
  const max = (value: number) => ({ min: 0, max: value });

  it('keeps the SG band (near only) without the range up', () => {
    expect(RANGE_BIGARMS.landings.filter((l) => distanceBonusAt(character, l)).map((l) => l.id)).toEqual([
      'nearA',
      'nearB',
    ]);
  });

  it('widens the upper end to max × (1 + Σ) and checks the representative distance (the SG 25 becomes 30)', () => {
    expect(RANGE_BIGARMS.landings.filter((l) => distanceBonusAt(character, l, max(0.2))).map((l) => l.id)).toEqual([
      'nearA',
      'nearB',
      'midNear',
    ]);
    // 中近（28）は上端 28 / 25 − 1 = 12% を越えて入る
    expect(distanceBonusAt(character, landing('midNear'), max(0.11))).toBe(false);
    expect(distanceBonusAt(character, landing('midNear'), max(0.12))).toBe(true);
  });
});

describe('適正射程距離の▲の和（addRangeUp）', () => {
  it('adds a decrease-only value too (only both-zero is skipped)', () => {
    expect(addRangeUp({ min: 0.2, max: 0 }, { min: -0.1, max: 0 })).toEqual({ min: 0.1, max: 0 });
    expect(addRangeUp(NO_RANGE_UP, { min: -0.1, max: 0 })).toEqual({ min: -0.1, max: 0 });
    expect(addRangeUp({ min: 0, max: 0.2 }, NO_RANGE_UP)).toEqual({ min: 0, max: 0.2 });
  });
});
