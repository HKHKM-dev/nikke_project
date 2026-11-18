// ミサト（833）: S1「射撃マニュアル」（状態。中身は命中率▲。60 発ごとに自分に 1 スタック・3 スタック・5 秒）の解決と、
// S1 の回復（2 段目の段 8。残りの HP の割合が最も低い味方 1 機。C-0567）、S2 の射撃マニュアルのフルスタックの間の与える HP 回復量▲
// （C-1334）と、バーストの味方全体の持続回復（5 秒間維持。C-0646）。V-0110・V-0797。
import { describe, expect, it } from 'vitest';
import { gameSecondsToFrames } from '../../time.ts';
import {
  MAX_SKILL_LEVELS,
  resolveInstant,
  resolvePassives,
  resolveStateContents,
  resolveStateGrants,
  resolveTimed,
  resolveWhileEffects,
} from '../resolve.ts';
import { parseSkillDefinition } from '../parse/definition.ts';
import { characterOf, rawDefinition } from '../../__tests__/data.ts';

const misato = characterOf(833);
const def = parseSkillDefinition(rawDefinition(833));

describe('ミサト（833）の定義', () => {
  it('resolves S1 to Shooting Manual on self every 60 normal shots, 3 stacks for 5 s, holding a hit rate up', () => {
    expect(resolveTimed(def, misato, MAX_SKILL_LEVELS)).toEqual([]);
    const grants = resolveStateGrants(def, misato, MAX_SKILL_LEVELS);
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatchObject({
      state: 'shootingManual',
      target: 'self',
      maxStacks: 3,
      durationFrames: gameSecondsToFrames(5),
      trigger: { count: 'normalShot', every: 60 },
    });
    const contents = resolveStateContents(def, misato, MAX_SKILL_LEVELS);
    expect(contents.map((c) => c.stat)).toEqual(['hitRate']);
    expect(contents[0]!.value).toBeCloseTo(0.0504, 12);
  });

  it('scales the hit rate up with the skill level (Lv1 2.52%)', () => {
    const lv1 = resolveStateContents(def, misato, { skill1: 1, skill2: 1, burst: 1 });
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

  it('resolves S2 to an outgoing healing up on self while Shooting Manual is at max stacks (C-1334)', () => {
    expect(resolvePassives(def, misato, MAX_SKILL_LEVELS)).toEqual([]);
    const whiles = resolveWhileEffects(def, misato, MAX_SKILL_LEVELS);
    expect(whiles).toHaveLength(1);
    expect(whiles[0]).toMatchObject({ stat: 'healDealt', target: 'self' });
    expect(whiles[0]!.value).toBeCloseTo(0.3005, 12);
    expect(whiles[0]).toMatchObject({ whileState: 'shootingManual', whileStacks: 'full' });
  });
});
