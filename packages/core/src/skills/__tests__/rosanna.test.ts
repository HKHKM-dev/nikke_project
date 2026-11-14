// ロザンナ（280）の定義: 基礎版と宝物版の、Lv ごとの解決値（S1 の隠れ身とクリティカル確率▲・S2 の隠れ身（維持の違う同じ状態の付与。
// plan/design-rosanna.md 2 節）・宝物版 S1 の有利コードの攻撃ダメージ▲・宝物版 S2 の狂気・バーストの倍率と追加ダメージ・宝物版の
// 受けるダメージ▲。水冷コードの敵に限るのは編成の段で、rosannaTeam.test.ts が見る）
import { describe, expect, it } from 'vitest';
import { characterOf, rawDefinition } from '../../__tests__/teamHelpers.ts';
import { resolveBurstDamage, resolveDamageEffects } from '../burstDamage.ts';
import {
  MAX_SKILL_LEVELS,
  resolvePassives,
  resolveStateContents,
  resolveStateGrants,
  resolveTimed,
  type SkillLevels,
} from '../resolve.ts';
import { applyTreasure, type TreasurePhase } from '../treasure.ts';
import { parseSkillDefinition } from '../types.ts';
import { gameSecondsToFrames } from '../../time.ts';

const ROSANNA = 280;
const character = characterOf(ROSANNA);
const definition = parseSkillDefinition(rawDefinition(ROSANNA));
const LV1: SkillLevels = { skill1: 1, skill2: 1, burst: 1 };

const resolved = (phase: TreasurePhase, levels: SkillLevels) => {
  const { definition: def, character: ch } = applyTreasure(character, definition, phase);
  return {
    grants: resolveStateGrants(def!, ch, levels).map((g) => ({
      skill: g.source.skill,
      state: g.state,
      durationFrames: g.durationFrames,
      maxStacks: g.maxStacks,
    })),
    timed: resolveTimed(def!, ch, levels).map((t) => ({
      skill: t.source.skill,
      stat: t.stat,
      value: t.value,
      durationFrames: t.durationFrames,
    })),
    contents: resolveStateContents(def!, ch, levels).map((c) => ({ stat: c.stat, value: c.value })),
    passives: resolvePassives(def!, ch, levels).map((p) => ({ stat: p.stat, value: p.value })),
    burst: resolveBurstDamage(def!, ch, levels).map((b) => b.multiplier),
    damage: resolveDamageEffects(def!, ch, levels).map((d) => ({ damageType: d.damageType, multiplier: d.multiplier })),
  };
};

const close = (v: number) => expect.closeTo(v, 9);
const SEC3 = gameSecondsToFrames(3);
const SEC5 = gameSecondsToFrames(5);
const SEC10 = gameSecondsToFrames(10);
const SEC30 = gameSecondsToFrames(30);

describe('ロザンナ（280）の定義', () => {
  it('grants Concealment from S1 (10 s) and S2 (5 s) with different durations', () => {
    const concealment = [
      { skill: 'skill1', state: 'concealment', durationFrames: SEC10, maxStacks: undefined },
      { skill: 'skill2', state: 'concealment', durationFrames: SEC5, maxStacks: undefined },
    ];
    expect(resolved(0, MAX_SKILL_LEVELS).grants).toEqual(concealment);
    expect(resolved(3, MAX_SKILL_LEVELS).grants).toEqual([
      ...concealment,
      { skill: 'skill2', state: 'frenzy', durationFrames: SEC30, maxStacks: 10 },
    ]);
  });

  it.each([
    ['Lv1', LV1, 0.0898, 7.2072, 3.0888, 0.145, 0.1283, 0.11],
    ['Lv10', MAX_SKILL_LEVELS, 0.1934, 13.104, 5.616, 0.29, 0.2261, 0.2],
  ])('resolves the values at %s', (_name, levels, crit, burst, additional, taken, frenzy, element) => {
    const base = resolved(0, levels);
    const critRow = {
      skill: 'skill1',
      stat: 'critRate',
      value: close(crit),
      durationFrames: SEC3,
    };
    expect(base.timed).toEqual([critRow]);
    expect(base.contents).toEqual([]);
    expect(base.passives).toEqual([]);
    expect(base.burst).toEqual([close(burst)]);
    expect(base.damage).toEqual([{ damageType: 'additional', multiplier: close(additional) }]);

    const treasure = resolved(3, levels);
    expect(treasure.timed).toEqual([
      critRow,
      { skill: 'burst', stat: 'damageTaken', value: close(taken), durationFrames: SEC30 },
    ]);
    expect(treasure.contents).toEqual([{ stat: 'attack', value: close(frenzy) }]);
    expect(treasure.passives).toEqual([{ stat: 'elementDamage', value: close(element) }]);
    expect(treasure.burst).toEqual(base.burst);
    expect(treasure.damage).toEqual(base.damage);
  });
});
