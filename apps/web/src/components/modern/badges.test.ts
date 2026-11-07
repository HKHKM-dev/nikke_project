import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import viteConfig from '../../../vite.config.ts';
import { BADGE_KINDS, matchesBadgeFilters, toggleBadgeFilter, type BadgeFilters } from './badges.ts';

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
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

  it('属性の色（styles.css の [data-element]）はバッジの図柄の色', () => {
    const css = read('../../styles.css');
    const files = {
      Fire: 'element_1fire.svg',
      Water: 'element_2water.svg',
      Electronic: 'element_3electric.svg',
      Iron: 'element_4iron.svg',
      Wind: 'element_5wind.svg',
    };
    for (const [element, file] of Object.entries(files)) {
      const color = new RegExp(`\\[data-element='${element}'\\] \\{\\s*--el: (#[0-9a-f]{6});`).exec(css)?.[1];
      expect(color, element).toBeDefined();
      // svgo は色を短く書く（#ff0000 → red、#00ff00 → #0f0）ので、6 桁の 16 進に戻して比べる
      const svg = readFileSync(`${BADGE_DIR}/${file}`, 'utf8')
        .toLowerCase()
        .replaceAll(':red', ':#ff0000')
        .replace(/#([0-9a-f])([0-9a-f])([0-9a-f])\b/g, '#$1$1$2$2$3$3');
      expect(svg, file).toContain(color);
    }
  });
});

describe('バッジの絞り込み', () => {
  const fireAR = { element: 'Fire', burstStep: 'Step3', class: 'Attacker', weaponType: 'AR' } as const;
  const electricSG = { element: 'Electronic', burstStep: 'Step3', class: 'Supporter', weaponType: 'SG' } as const;
  const ironSMG = { element: 'Iron', burstStep: 'Step1', class: 'Supporter', weaponType: 'SMG' } as const;
  const chars = [fireAR, electricSG, ironSMG];
  const pass = (filters: BadgeFilters) => chars.filter((c) => matchesBadgeFilters(c, filters));

  it('何も選んでいなければ全部が通る', () => {
    expect(pass({})).toEqual(chars);
  });

  it('1 つの値を選ぶと、その値のキャラだけが通る', () => {
    expect(pass(toggleBadgeFilter({}, 'weaponType', 'SG'))).toEqual([electricSG]);
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
