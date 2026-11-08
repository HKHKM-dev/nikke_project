// 書き出したバッジ（src/assets/badges）が、元の SVG（badges-src）に枠を合成して badges.ts で小さくしたものと同じこと
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BADGE_OUT_DIR,
  BADGE_SRC_DIR,
  FRAMES,
  FRAME_FILE,
  FRAME_LABEL,
  buildBadge,
  buildBadges,
  composeBadge,
  frameOf,
  optimizeBadge,
  parseFrame,
  svgFiles,
} from './badges.ts';

const frameSvg = readFileSync(FRAME_FILE, 'utf8');
const frame = parseFrame(frameSvg);
const sources = new Map(svgFiles(BADGE_SRC_DIR).map((f) => [f, readFileSync(`${BADGE_SRC_DIR}/${f}`, 'utf8')]));
const DEFAULT = { fill: '#1a1a1a', stroke: '#ffffff' };

describe('バッジの書き出し', () => {
  it('元と書き出しのファイルが同じ顔ぶれ', () => {
    expect(svgFiles(BADGE_OUT_DIR)).toEqual([...sources.keys()]);
  });

  it.each([...sources.keys()])('%s は元を合成して小さくしたもの（違うなら npm run badges:build）', (file) => {
    expect(readFileSync(`${BADGE_OUT_DIR}/${file}`, 'utf8')).toBe(buildBadge(file, sources.get(file)!, () => frame));
  });

  it('元に枠が残っていない（枠は frame/hex.svg の 1 つだけ）', () => {
    expect([...sources].filter(([, svg]) => FRAME_LABEL.test(svg)).map(([f]) => f)).toEqual([]);
  });

  it('FRAMES のファイル名のキーは、どれもファイルがある', () => {
    const missing = Object.keys(FRAMES).filter((k) => !k.includes('*') && !sources.has(`${k}.svg`));
    expect(missing).toEqual([]);
  });

  it('FRAMES に値ごとに載るグループ（element・burstStep・collection）は、どのファイルにも枠が付く', () => {
    const groups = new Set(['element', 'burstStep', 'collection']);
    const unframed = [...sources.keys()].filter((f) => groups.has(f.split('_')[0]!) && frameOf(f) === null);
    expect(unframed).toEqual([]);
  });
});

describe('枠の合成', () => {
  it('枠を付けるものと付けないもの', () => {
    expect(frameOf('weaponType_AR')).toEqual(DEFAULT);
    expect(frameOf('rarity_R-badge.svg')).toEqual(DEFAULT);
    expect(frameOf('element_Fire')).toEqual({ ...DEFAULT, ...FRAMES.element_Fire });
    expect(frameOf('collection_SR-max')).toEqual({ ...DEFAULT, ...FRAMES['collection_SR-max'] });
    expect(frameOf('rarity_R')).toBeNull();
    expect(frameOf('ui_check')).toBeNull();
  });

  it('中身の viewBox が枠と違えば拡大縮小で包み、縦横の比が違えば止める', () => {
    const svg = (viewBox: string) =>
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"><rect width="1" height="1"/></svg>`;
    expect(composeBadge(svg('0 0 130 150'), frame, DEFAULT)).not.toContain('<g transform');
    expect(composeBadge(svg('0 0 13 15'), frame, DEFAULT)).toContain('<g transform="matrix(10,0,0,10,0,0)">');
    expect(() => composeBadge(svg('0 0 100 100'), frame, DEFAULT)).toThrow(/縦横の比/);
    const mm = composeBadge(svg('0 0 13 15').replace('<svg', '<svg width="13mm"'), frame, DEFAULT);
    const rootTag = /^<svg\b[^>]*>/.exec(mm)?.[0];
    for (const attr of ['width="130"', 'height="150"', 'viewBox="0 0 130 150"']) expect(rootTag).toContain(attr);
    expect(rootTag).not.toContain('mm');
  });

  it('枠を g に入れると止める', () => {
    expect(() => parseFrame(frameSvg.replace('<polygon', '<g transform="translate(1,0)"><polygon'))).toThrow(
      /g に入れない/,
    );
  });

  it('枠の色を差し替え、中身の元に枠が残っていれば止める', () => {
    const out = composeBadge('<svg viewBox="0 0 130 150"></svg>', frame, { fill: '#123456', stroke: '#abcdef' });
    expect(out).toContain('fill:#123456');
    expect(out).toContain('stroke:#abcdef');
    expect(() => composeBadge(frameSvg, frame, DEFAULT)).toThrow(/枠が残っている/);
  });
});

describe('buildBadges', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>';
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
    expect(readFileSync(join(outDir, 'b_y.svg'), 'utf8')).toBe(optimizeBadge(svg));
  });

  it('stops without removing anything when the source folder has no SVG', () => {
    const { srcDir, outDir } = setup([], ['a_x.svg', 'b_y.svg']);
    writeFileSync(join(srcDir, 'notes.txt'), '');
    expect(() => buildBadges(srcDir, outDir)).toThrow('SVG が無い');
    expect(svgFiles(outDir).sort()).toEqual(['a_x.svg', 'b_y.svg']);
  });
});
