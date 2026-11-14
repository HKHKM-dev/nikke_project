// エクシア（210）の定義: 基礎版と宝物版（段階 3）の、Lv ごとの解決値（S1 の防御力▼・宝物版 S1 のリロード速度▲・ハッキングコード収集の
// 攻撃力▲・宝物版 S2 の発動者基準の攻撃力▲・バーストの倍率と防御力▼・追加ダメージ・宝物版の受けるダメージ▲）
import { describe, expect, it } from 'vitest';
import { characterOf, rawDefinition } from '../../__tests__/teamHelpers.ts';
import { resolveBurstDamage, resolveDamageEffects } from '../burstDamage.ts';
import { MAX_SKILL_LEVELS, resolveStateContents, resolveTimed, type SkillLevels } from '../resolve.ts';
import { applyTreasure, type TreasurePhase } from '../treasure.ts';
import { parseSkillDefinition } from '../types.ts';
import { gameSecondsToFrames } from '../../time.ts';

const EXIA = 210;
const character = characterOf(EXIA);
const definition = parseSkillDefinition(rawDefinition(EXIA));
const OWNER_LEVELS: SkillLevels = { skill1: 4, skill2: 7, burst: 4 };

const resolved = (phase: TreasurePhase, levels: SkillLevels) => {
  const applied = applyTreasure(character, definition, phase);
  const timed = resolveTimed(applied.definition!, applied.character, levels).map((t) => ({
    skill: t.source.skill,
    stat: t.stat,
    value: t.value,
    durationFrames: t.durationFrames,
    maxStacks: t.maxStacks,
    scaling: t.scaling,
  }));
  const contents = resolveStateContents(applied.definition!, applied.character, levels).map((c) => ({
    stat: c.stat,
    value: c.value,
    maxStacks: c.maxStacks,
  }));
  const burst = resolveBurstDamage(applied.definition!, applied.character, levels).map((b) => b.multiplier);
  const damage = resolveDamageEffects(applied.definition!, applied.character, levels).map((d) => ({
    damageType: d.damageType,
    multiplier: d.multiplier,
  }));
  return { timed, contents, burst, damage };
};

const close = (v: number) => expect.closeTo(v, 9);
const SEC5 = gameSecondsToFrames(5);
const SEC10 = gameSecondsToFrames(10);
const SEC15 = gameSecondsToFrames(15);

/** 解いた timed の 1 行（スタックなし・ratio が既定） */
const row = (skill: string, stat: string, value: number, durationFrames: number, extra: object = {}) => ({
  skill,
  stat,
  value: close(value),
  durationFrames,
  maxStacks: undefined,
  scaling: 'ratio',
  ...extra,
});
/** 持ち主の Lv（4/7/4）の S1・バーストの防御力▼（基礎版と宝物版で同じ） */
const S1_DEF = row('skill1', 'enemyDefenseDown', 0.0963, SEC5);
const BURST_DEF = row('burst', 'enemyDefenseDown', 0.019, SEC5);

describe('エクシア（210）の定義', () => {
  it('accepts the definition', () => {
    expect(() => parseSkillDefinition(rawDefinition(EXIA))).not.toThrow();
  });

  it('resolves the base version at the owner levels (4/7/4)', () => {
    const r = resolved(0, OWNER_LEVELS);
    expect(r.timed).toEqual([S1_DEF, BURST_DEF]);
    expect(r.contents).toEqual([{ stat: 'attack', value: close(0.1428), maxStacks: 5 }]);
    expect(r.burst).toEqual([close(0.8562)]);
    expect(r.damage).toEqual([{ damageType: 'additional', multiplier: close(0.8562) }]);
  });

  it('resolves the treasure version (phase 3) at the owner levels (4/7/4)', () => {
    const r = resolved(3, OWNER_LEVELS);
    expect(r.timed).toEqual([
      S1_DEF,
      row('skill1', 'reloadSpeed', 0.95, SEC10),
      row('skill2', 'attack', 0.0422, SEC15, { maxStacks: 5, scaling: 'casterAttack' }),
      BURST_DEF,
      row('burst', 'damageTaken', 0.1225, SEC10),
    ]);
    expect(r.contents).toEqual([{ stat: 'attack', value: close(0.2174), maxStacks: 5 }]);
    expect(r.burst).toEqual([close(0.8562)]);
    expect(r.damage).toEqual([{ damageType: 'additional', multiplier: close(0.8562) }]);
  });

  it('resolves the treasure version at Lv 10 (fixed spec)', () => {
    const r = resolved(3, MAX_SKILL_LEVELS);
    expect(r.timed.map((t) => t.value)).toEqual([
      close(0.1377),
      close(0.95),
      close(0.058),
      close(0.0271),
      close(0.1804),
    ]);
    expect(r.contents).toEqual([{ stat: 'attack', value: close(0.28), maxStacks: 5 }]);
    expect(r.burst).toEqual([close(1.2232)]);
    expect(r.damage).toEqual([{ damageType: 'additional', multiplier: close(1.2232) }]);
  });
});
