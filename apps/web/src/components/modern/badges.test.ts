import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BADGE_KINDS } from './badges.ts';

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
const BADGE_DIR = fileURLToPath(new URL('../../assets/badges', import.meta.url));

describe('バッジの対応表', () => {
  it('値ごとに別のバッジを引き、置いたバッジをどれも使う（使わないファイルを置かない）', () => {
    const srcs = BADGE_KINDS.flatMap(({ badges }) => Object.values(badges).map((b) => b.src));
    expect(new Set(srcs).size).toBe(srcs.length);
    expect(readdirSync(BADGE_DIR).filter((f) => f.endsWith('.svg'))).toHaveLength(srcs.length);
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
