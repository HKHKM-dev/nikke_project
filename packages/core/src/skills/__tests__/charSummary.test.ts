// キャラのデータを詰めて出す（npm run char。plan/design-workflow-simplification-14.md 6 節）
import { describe, expect, it } from 'vitest';
import type { SkillRaw } from '../../types.ts';
import type { CatalogEffect } from '../catalog.ts';
import { fillDescription, similarDefined } from '../charSummary.ts';

const skill = (ja: string, values: (string[] | null)[]): SkillRaw => ({
  id: 1,
  name: { ja: 's', en: 's' },
  description: { ja, en: '' },
  values,
});

describe('fillDescription', () => {
  it('puts the values in, with the Lv 1 value when the levels differ, and drops the markup', () => {
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
    ).toBe('■味方全体に\n「攻撃力16.16（Lv1 は 8.88）％▲」「5秒間維持」');
    expect(fillDescription(skill('{description_value_03}', [null, null, null]))).toBe('?');
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
