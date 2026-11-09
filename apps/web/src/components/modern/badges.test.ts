import { readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import viteConfig from '../../../vite.config.ts';
import {
  BADGE_KINDS,
  VISUAL_BADGE_KINDS,
  collectionBadge,
  matchesBadgeFilters,
  toggleBadgeFilter,
  type BadgeFilters,
} from './badges.ts';

const BADGE_DIR = fileURLToPath(new URL('../../assets/badges', import.meta.url));
const BADGE_FILES = readdirSync(BADGE_DIR).filter((f) => f.endsWith('.svg'));

describe('バッジの対応表', () => {
  // 使っていないバッジも置く（読んだものだけを Vite が束に入れる。plan/design-modern-ui.md 2.5 節）
  it('値ごとに別のバッジを引く', () => {
    const srcs = BADGE_KINDS.flatMap(({ badges }) => Object.values(badges).map((b) => b.src));
    expect(new Set(srcs).size).toBe(srcs.length);
  });

  it('どのバッジも assetsInlineLimit 未満（束の中に埋め込まれ、アーティファクトのファイル数を使わない）', () => {
    const limit = viteConfig.build?.assetsInlineLimit;
    if (typeof limit !== 'number') throw new Error('vite.config.ts の build.assetsInlineLimit が数でない');
    for (const file of BADGE_FILES) {
      const { size } = statSync(`${BADGE_DIR}/${file}`);
      expect(
        size,
        `${file} が assetsInlineLimit 以上。Vite が別のファイルとして出し、アーティファクトのファイル数が増える`,
      ).toBeLessThan(limit);
    }
  });
});

describe('バッジの絞り込み', () => {
  const fireAR = {
    element: 'Fire',
    burstStep: 'Step3',
    class: 'Attacker',
    weaponType: 'AR',
    corporation: 'ELYSION',
  } as const;
  const electricSG = {
    element: 'Electronic',
    burstStep: 'Step3',
    class: 'Supporter',
    weaponType: 'SG',
    corporation: 'TETRA',
  } as const;
  const ironSMG = {
    element: 'Iron',
    burstStep: 'Step1',
    class: 'Supporter',
    weaponType: 'SMG',
    corporation: 'TETRA',
  } as const;
  const chars = [fireAR, electricSG, ironSMG];
  const pass = (filters: BadgeFilters) => chars.filter((c) => matchesBadgeFilters(c, filters));

  it('何も選んでいなければ全部が通る', () => {
    expect(pass({})).toEqual(chars);
  });

  it('1 つの値を選ぶと、その値のキャラだけが通る', () => {
    expect(pass(toggleBadgeFilter({}, 'weaponType', 'SG'))).toEqual([electricSG]);
  });

  it('企業でも絞れる', () => {
    expect(pass(toggleBadgeFilter({}, 'corporation', 'TETRA'))).toEqual([electricSG, ironSMG]);
  });

  it('バースト段階が全段階のキャラは、どの段階で絞っても通る（全段階のボタンは出さない）', () => {
    const allStep = { ...ironSMG, burstStep: 'AllStep' } as const;
    for (const step of ['Step1', 'Step2', 'Step3']) {
      expect(matchesBadgeFilters(allStep, { burstStep: step })).toBe(true);
    }
    expect(matchesBadgeFilters(allStep, { burstStep: 'Step1', weaponType: 'SG' })).toBe(false);
    expect(BADGE_KINDS.find((k) => k.key === 'burstStep')?.filterValues).not.toContain('AllStep');
  });

  it('同じ値をもう一度押すと解除される', () => {
    const selected = toggleBadgeFilter({}, 'class', 'Supporter');
    expect(toggleBadgeFilter(selected, 'class', 'Supporter')).toEqual({});
  });

  it('同じ項目で別の値を押すと、その値に切り替わる', () => {
    const filters = toggleBadgeFilter(toggleBadgeFilter({}, 'burstStep', 'Step1'), 'burstStep', 'Step3');
    expect(filters).toEqual({ burstStep: 'Step3' });
    expect(pass(filters)).toEqual([fireAR, electricSG]);
  });

  it('2 つの項目は AND で絞る', () => {
    const filters = toggleBadgeFilter(toggleBadgeFilter({}, 'burstStep', 'Step3'), 'class', 'Supporter');
    expect(filters).toEqual({ burstStep: 'Step3', class: 'Supporter' });
    expect(pass(filters)).toEqual([electricSG]);
  });

  it('押しても元の絞り込みは変えない', () => {
    const filters: BadgeFilters = { element: 'Fire' };
    toggleBadgeFilter(filters, 'element', 'Fire');
    toggleBadgeFilter(filters, 'class', 'Attacker');
    expect(filters).toEqual({ element: 'Fire' });
  });
});

describe('絵のバッジ', () => {
  it('左上に縦に、属性・武器種・バースト段階の順に出す（クラスは出さない）', () => {
    expect(VISUAL_BADGE_KINDS.map(({ key }) => key)).toEqual(['element', 'weaponType', 'burstStep']);
  });

  it('コレクションは、宝物・R・SR と LV の上限でバッジを選び、無ければ出さない', () => {
    const file = (b: ReturnType<typeof collectionBadge>) => b?.src ?? null;
    expect(collectionBadge(null, 0, false)).toBeNull();
    expect(collectionBadge({ rarity: 'R', level: 14 }, 0, false)?.label).toBe('コレクション R LV 14');
    expect(collectionBadge({ rarity: 'SR', level: 15 }, 0, false)?.label).toBe('コレクション SR LV 15');
    expect(collectionBadge({ rarity: 'SR', level: 15 }, 2, true)?.label).toBe('宝物 段階 2');
    // 宝物の無いキャラは段階を見ない
    expect(collectionBadge(null, 3, false)).toBeNull();
    // 上限の版と通常の版は別のバッジ
    expect(file(collectionBadge({ rarity: 'R', level: 15 }, 0, false))).not.toBe(
      file(collectionBadge({ rarity: 'R', level: 14 }, 0, false)),
    );
    expect(file(collectionBadge(null, 3, true))).not.toBe(file(collectionBadge(null, 1, true)));
  });
});
