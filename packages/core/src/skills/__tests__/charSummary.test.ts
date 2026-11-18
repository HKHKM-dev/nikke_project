// キャラのデータを詰めて出す（npm run char。plan/design-workflow-simplification-14.md 6 節）
import { describe, expect, it } from 'vitest';
import type { SkillRaw } from '../../types.ts';
import type { CatalogEffect } from '../catalog.ts';
import { computeFixedSpecAttack, computeFixedSpecDefence, computeFixedSpecHp } from '../../fixedSpec.ts';
import { characterOf } from '../../__tests__/data.ts';
import { fillDescription, renderFixedSpecStats, similarDefined } from '../charSummary.ts';

const skill = (ja: string, values: (string[] | null)[]): SkillRaw => ({
  id: 1,
  name: { ja: 's', en: 's' },
  description: { ja, en: '' },
  values,
});

describe('fillDescription', () => {
  it('puts the values in with their numbers, with the Lv 1 value when the levels differ, and drops the markup', () => {
    expect(
      fillDescription(
        skill(
          '■味方全体に\n<color=#00AEFF>「攻撃力{description_value_01}％▲」「{description_value_02}秒間維持」</color>',
          [
            ['8.88', '16.16'],
            ['5', '5'],
          ],
        ),
      ),
    ).toBe('■味方全体に\n「攻撃力16.16{01}（Lv1 は 8.88）％▲」「5{02}秒間維持」');
    expect(fillDescription(skill('{description_value_03}', [null, null, null]))).toBe('?{03}');
  });
});

describe('similarDefined', () => {
  const effect = (rid: number, kind: string, defined: boolean) =>
    ({ rid, name: `c${rid}`, kind, defined }) as CatalogEffect;

  it('ranks the defined characters by the kinds they share', () => {
    const effects = [
      effect(1, 'damage:skill', false),
      effect(1, 'damage:burst', false),
      effect(2, 'damage:skill', true),
      effect(3, 'damage:skill', true),
      effect(3, 'damage:burst', true),
      effect(4, 'damage:burst', false),
      effect(5, 'heal', true),
    ];
    expect(similarDefined(1, effects)).toEqual([
      { rid: 3, name: 'c3', shared: ['damage:burst', 'damage:skill'] },
      { rid: 2, name: 'c2', shared: ['damage:skill'] },
    ]);
  });
});

describe('renderFixedSpecStats', () => {
  it('prints the fixed-spec attack, max HP and defence the sim uses under --fixed-spec, and the per-shot multiplier', () => {
    const maiden = characterOf(183);
    const text = renderFixedSpecStats(maiden);
    expect(text).toContain(`攻撃力 ${computeFixedSpecAttack(maiden).attack}・`);
    expect(text).toContain(`最大HP ${computeFixedSpecHp(maiden)}・`);
    expect(text).toContain(`防御力 ${computeFixedSpecDefence(maiden)}`);
    // 武器倍率は 1e-4 単位（6130 → 61.3%）。チャージ武器はフルチャージの倍率を掛けた値も出す
    expect(text).toContain(`1 発 ${maiden.shot.damage / 100}%`);
    expect(text).toContain(`フルチャージ ×${maiden.shot.fullChargeDamage}`);
  });

  it('adds the per-pellet multiplier for a shotgun', () => {
    const sg = characterOf(101);
    expect(sg.shot.shotCount).toBeGreaterThan(1);
    expect(renderFixedSpecStats(sg)).toContain(
      `1 ペレット ${sg.shot.damage / sg.shot.shotCount / 100}%（${sg.shot.shotCount} ペレット）`,
    );
  });
});
