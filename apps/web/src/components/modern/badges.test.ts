import { readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import viteConfig from '../../../vite.config.ts';
import {
  BADGE_KINDS,
  VISUAL_BADGE_KINDS,
  collectionBadge,
  trayCollectionBadge,
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
      expect(matchesBadgeFilters(allStep, { burstStep: [step] })).toBe(true);
    }
    expect(matchesBadgeFilters(allStep, { burstStep: ['Step1'], weaponType: ['SG'] })).toBe(false);
    expect(BADGE_KINDS.find((k) => k.key === 'burstStep')?.filterValues).not.toContain('AllStep');
  });

  it('同じ値をもう一度押すと解除される', () => {
    const selected = toggleBadgeFilter({}, 'class', 'Supporter');
    expect(toggleBadgeFilter(selected, 'class', 'Supporter')).toEqual({});
  });

  it('同じ項目で別の値を押すと、その値も選び、どれかに合えば通る（OR）', () => {
    const filters = toggleBadgeFilter(toggleBadgeFilter({}, 'weaponType', 'SG'), 'weaponType', 'SMG');
    expect(filters).toEqual({ weaponType: ['SG', 'SMG'] });
    expect(pass(filters)).toEqual([electricSG, ironSMG]);
  });

  it('選んだ値を 1 つ外すと残りで絞り、全部外すとその項目は絞らない', () => {
    const both = toggleBadgeFilter(toggleBadgeFilter({}, 'weaponType', 'SG'), 'weaponType', 'SMG');
    const one = toggleBadgeFilter(both, 'weaponType', 'SG');
    expect(one).toEqual({ weaponType: ['SMG'] });
    expect(toggleBadgeFilter(one, 'weaponType', 'SMG')).toEqual({});
  });

  it('項目どうしは AND で絞る', () => {
    let filters = toggleBadgeFilter({}, 'burstStep', 'Step3');
    filters = toggleBadgeFilter(filters, 'burstStep', 'Step1');
    filters = toggleBadgeFilter(filters, 'class', 'Supporter');
    expect(filters).toEqual({ burstStep: ['Step3', 'Step1'], class: ['Supporter'] });
    expect(pass(filters)).toEqual([electricSG, ironSMG]);
  });

  it('押しても元の絞り込みは変えない', () => {
    const filters: BadgeFilters = { element: ['Fire'] };
    toggleBadgeFilter(filters, 'element', 'Fire');
    toggleBadgeFilter(filters, 'element', 'Water');
    toggleBadgeFilter(filters, 'class', 'Attacker');
    expect(filters).toEqual({ element: ['Fire'] });
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

  it('ニケ一覧は、育成状況にいるニケだけ、そのコレクション・宝物で出す（スペック固定では出さない）', () => {
    const entry = (collection: unknown, treasure: unknown) => ({ collection, treasure });
    const roster = {
      characters: {
        '1': entry({ rarity: 'SR', level: 15 }, null),
        '2': entry(null, { tid: 1, level: 10, phase: 2 }),
        // 宝物の段階が未確定なら宝物なし（スロットに写すのと同じ）
        '3': entry({ rarity: 'R', level: 5 }, { tid: 1, level: 0, phase: null }),
      },
    } as unknown as Parameters<typeof trayCollectionBadge>[1];
    const label = (id: number, fixedSpec = false) =>
      trayCollectionBadge({ resourceId: id }, roster, fixedSpec)?.label ?? null;
    expect(label(1)).toBe('コレクション SR LV 15');
    expect(label(2)).toBe('宝物 段階 2');
    expect(label(3)).toBe('コレクション R LV 5');
    expect(label(4)).toBeNull();
    expect(label(1, true)).toBeNull();
    expect(trayCollectionBadge({ resourceId: 1 }, null, false)).toBeNull();
  });
});
