// 書き出したバッジ（src/assets/badges）が、元の SVG（badges-src）を badges.ts で小さくしたものと同じであること
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BADGE_OUT_DIR,
  BADGE_SRC_DIR,
  applyColorRoles,
  badgeNameOf,
  buildBadges,
  MONOCHROME_GROUPS,
  MONOCHROME_NAMES,
  isMonochrome,
  optimizeBadge,
  svgFiles,
} from './badges.ts';

const sources = new Map(svgFiles(BADGE_SRC_DIR).map((f) => [f, readFileSync(`${BADGE_SRC_DIR}/${f}`, 'utf8')]));

describe('バッジの書き出し', () => {
  it('元と書き出しのファイルが同じ顔ぶれ', () => {
    expect(svgFiles(BADGE_OUT_DIR)).toEqual([...sources.keys()]);
  });

  it.each([...sources.keys()])(
    '%s の書き出しは元を小さくしたもの（違うなら npm run badges:build）',
    (file) => {
      const source = sources.get(file)!;
      expect(readFileSync(`${BADGE_OUT_DIR}/${file}`, 'utf8')).toBe(optimizeBadge(source, badgeNameOf(file)));
    },
  );

  it('グループと変種が同じ元は、枠の有無がそろう（ui は除く）', () => {
    const framed = new Map<string, Set<boolean>>();
    for (const [file, svg] of sources) {
      const [, group, variant = ''] = /^([^_]+)_[^-]+(?:-(.+))?\.svg$/.exec(file)!;
      if (group === 'ui') continue;
      const key = `${group}-${variant}`;
      framed.set(key, (framed.get(key) ?? new Set()).add(svg.includes('inkscape:label="frame-out"')));
    }
    expect([...framed].filter(([, has]) => has.size > 1).map(([key]) => key)).toEqual([]);
  });
});

describe('白黒のバッジ', () => {
  const doc = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${body}</svg>`;

  it('塗りと縁の色の役を CSS の変数にし、ほかはそのまま', () => {
    const out = applyColorRoles(
      doc(
        '<path style="fill:#FFFFFF;stroke:#000000;stroke-width:2"/><circle fill="#808080"/><rect style="fill:url(#g);stroke:none"/>',
      ),
      'x_y',
    );
    expect(out).toContain('style="fill:var(--badge-main,#FFFFFF);stroke:var(--badge-line,#000000);stroke-width:2"');
    expect(out).toContain('fill="var(--badge-accent,#808080)"');
    expect(out).toContain('style="fill:url(#g);stroke:none"');
  });

  it('色の役に無い色・陰でないグラデーションの色があれば止める', () => {
    expect(() => applyColorRoles(doc('<path style="fill:#ff0000"/>'), 'x_y')).toThrow(/x_y の fill の #ff0000/);
    expect(() => applyColorRoles(doc('<stop style="stop-color:#808080"/>'), 'x_y')).toThrow(/陰の/);
    expect(() => applyColorRoles(doc('<stop style="stop-color:#ffffff;stop-opacity:0"/>'), 'x_y')).not.toThrow();
    expect(() => applyColorRoles(doc('<style>path{fill:#fff}</style>'), 'x_y')).toThrow(/<style>/);
  });

  it('style が決める性質の属性は見ずに残す（stroke 属性と style の stroke の両方）', () => {
    const tag = '<polygon fill="none" stroke="#ff3b57" style="fill:none;stroke:#000000"/>';
    expect(applyColorRoles(doc(tag), 'x_y')).toContain(
      '<polygon fill="none" stroke="#ff3b57" style="fill:none;stroke:var(--badge-line,#000000)"/>',
    );
  });

  it('書き出しに % の長さが残れば止める', () => {
    const svg = doc('<rect width="50%" height="1"/>');
    expect(() => optimizeBadge(svg, 'x_y')).toThrow(/% の値/);
  });

  it('マスクの中の色は形なので、そのまま残す', () => {
    const mask = '<mask id="m"><path style="fill:#ffffff"/><path style="stroke:#000000;fill:#123456"/></mask>';
    expect(applyColorRoles(doc(mask + '<path style="fill:#808080" mask="url(#m)"/>'), 'x_y')).toBe(
      doc(mask + '<path style="fill:var(--badge-accent,#808080)" mask="url(#m)"/>'),
    );
  });

  // 画面のスプライトに入るグループ（画面の badges.ts の glob）を足したのに白黒に足し忘れると、色が変数にならない
  it('白黒のグループは、画面のスプライトに入るグループと同じ', () => {
    const screen = readFileSync(new URL('../src/components/modern/badges.ts', import.meta.url), 'utf8');
    const globbed = [...screen.matchAll(/'\.\.\/\.\.\/assets\/badges\/([^_]+)_\*\.svg'/g)].map(([, group]) => group);
    expect(globbed.sort()).toEqual([...MONOCHROME_GROUPS].sort());
  });

  it('グループの外で画面のスプライトに 1 枚ずつ入れるバッジは、無地の ui_blank_main のほかは白黒', () => {
    const screen = readFileSync(new URL('../src/components/modern/badges.ts', import.meta.url), 'utf8');
    const single = [...screen.matchAll(/'\.\.\/\.\.\/assets\/badges\/([^*']+)\.svg'/g)].map(([, name]) => name!);
    expect(single).toContain('ui_information');
    expect(single.filter((name) => name !== 'ui_blank_main').sort()).toEqual([...MONOCHROME_NAMES].sort());
  });

  it('書き出しは、白黒のグループのバッジの色を変数にし、id の前に名前を付ける', () => {
    const names = [...sources.keys()].map(badgeNameOf).filter(isMonochrome);
    expect(names).toContain('element_Fire');
    for (const name of names) {
      const out = readFileSync(`${BADGE_OUT_DIR}/${name}.svg`, 'utf8');
      expect(out).toMatch(/var\(--badge-/);
      for (const [, id] of out.matchAll(/\sid="([^"]+)"/g)) expect(id).toMatch(new RegExp(`^${name}__`));
    }
  });
});

describe('buildBadges', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>';
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });
  /** 元と書き出しのフォルダを作り、それぞれに files の SVG を置く */
  function setup(src: string[], out: string[]) {
    const root = mkdtempSync(join(tmpdir(), 'badges-'));
    dirs.push(root);
    const srcDir = join(root, 'src');
    const outDir = join(root, 'out');
    for (const [dir, files] of [
      [srcDir, src],
      [outDir, out],
    ] as const) {
      mkdirSync(dir);
      for (const f of files) writeFileSync(join(dir, f), svg);
    }
    return { srcDir, outDir };
  }

  it('writes every source and removes outputs whose source is gone', () => {
    const { srcDir, outDir } = setup(['a_x.svg', 'b_y.svg'], ['a_x.svg', 'old_z.svg']);
    const { written, removed } = buildBadges(srcDir, outDir);
    expect(written.sort()).toEqual(['a_x.svg', 'b_y.svg']);
    expect(removed).toEqual(['old_z.svg']);
    expect(svgFiles(outDir).sort()).toEqual(['a_x.svg', 'b_y.svg']);
    expect(readFileSync(join(outDir, 'b_y.svg'), 'utf8')).toBe(optimizeBadge(svg, 'b_y'));
  });

  it('stops without removing anything when the source folder has no SVG', () => {
    const { srcDir, outDir } = setup([], ['a_x.svg', 'b_y.svg']);
    writeFileSync(join(srcDir, 'notes.txt'), '');
    expect(() => buildBadges(srcDir, outDir)).toThrow('SVG が無い');
    expect(svgFiles(outDir).sort()).toEqual(['a_x.svg', 'b_y.svg']);
  });

  it('stops on a name that does not follow the naming rule', () => {
    const { srcDir, outDir } = setup(['a_x.svg', 'plain.svg'], []);
    expect(() => buildBadges(srcDir, outDir)).toThrow(/命名規則に合わない plain\.svg/);
  });

  // 画面はスプライトの symbol に viewBox を写す
  it('stops on a source without viewBox', () => {
    const { srcDir, outDir } = setup([], []);
    writeFileSync(join(srcDir, 'a_x.svg'), svg.replace(' viewBox="0 0 1 1"', ''));
    expect(() => buildBadges(srcDir, outDir)).toThrow(/viewBox が無い/);
  });
});
