// 書き出したバッジ（src/assets/badges）が、元の SVG（badges-src）を badges.ts で小さくしたものと同じで、元の枠が frame/hex.svg と
// 同じ形であること
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BADGE_OUT_DIR,
  BADGE_SRC_DIR,
  FRAME_FILE,
  buildBadges,
  optimizeBadge,
  parseFrame,
  svgFiles,
  syncFrame,
} from './badges.ts';

const frameSvg = readFileSync(FRAME_FILE, 'utf8');
const frame = parseFrame(frameSvg);
const getFrame = () => frame;
const sources = new Map(svgFiles(BADGE_SRC_DIR).map((f) => [f, readFileSync(`${BADGE_SRC_DIR}/${f}`, 'utf8')]));
const hasFrame = (svg: string) => /inkscape:label="hex-in"/i.test(svg);

describe('バッジの書き出し', () => {
  it('元と書き出しのファイルが同じ顔ぶれ', () => {
    expect(svgFiles(BADGE_OUT_DIR)).toEqual([...sources.keys()]);
  });

  it.each([...sources.keys()])(
    '%s は元の枠がそろい、書き出しは元を小さくしたもの（違うなら npm run badges:build）',
    (file) => {
      const source = sources.get(file)!;
      expect(syncFrame(source, getFrame)).toBe(source);
      expect(readFileSync(`${BADGE_OUT_DIR}/${file}`, 'utf8')).toBe(optimizeBadge(source));
    },
  );

  it('element・burstStep・collection の元は、どれも枠を持つ', () => {
    const groups = new Set(['element', 'burstStep', 'collection']);
    const unframed = [...sources].filter(([f, svg]) => groups.has(f.split('_')[0]!) && !hasFrame(svg)).map(([f]) => f);
    expect(unframed).toEqual([]);
  });
});

describe('枠をそろえる', () => {
  const inner = (style: string, extra = '') => `<path${extra} style="${style}" d="m 0,0 z" inkscape:label="hex-in" />`;
  const outer = '<polygon points="0,0 1,1" style="fill:none;stroke:#000000" inkscape:label="hex-out" />';
  const doc = (body: string, viewBox = '0 0 130 150') =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}<circle r="1"/></svg>`;

  it('枠の要素を frame/hex.svg のものにし、色は元の hex-in のまま', () => {
    const out = syncFrame(doc(outer + inner('fill:#123456;stroke:#abcdef;stroke-width:9')), getFrame);
    expect(out).toContain(frame.outer);
    expect(out).toContain('fill:#123456');
    expect(out).toContain('stroke:#abcdef');
    expect(out).not.toContain('stroke-width:9');
    expect(out).toContain('<circle r="1"/>');
    expect(syncFrame(out, getFrame)).toBe(out);
  });

  it('枠の要素はロックし、id をラベルと同じにする', () => {
    for (const el of [frame.outer, frame.inner]) expect(el).toContain('sodipodi:insensitive="true"');
    expect(frame.outer).toContain('id="hex-out"');
    expect(frame.inner).toContain('id="hex-in"');
  });

  it('枠の無い元はそのまま', () => {
    const svg = doc('');
    expect(
      syncFrame(svg, () => {
        throw new Error('読まない');
      }),
    ).toBe(svg);
  });

  it('枠の形が崩れていれば止める', () => {
    const style = 'fill:#1a1a1a;stroke:#ffffff';
    expect(() => syncFrame(doc(inner(style)), getFrame)).toThrow(/1 つずつ/);
    expect(() => syncFrame(doc(outer + outer + inner(style)), getFrame)).toThrow(/1 つずつ/);
    expect(() => syncFrame(doc(inner(style) + outer), getFrame)).toThrow(/前に置く/);
    expect(() => syncFrame(doc(`<g transform="scale(2)">${outer}${inner(style)}</g>`), getFrame)).toThrow(
      /g に入れない/,
    );
    expect(() => syncFrame(doc(outer + inner(style), '0 0 13 15'), getFrame)).toThrow(/viewBox/);
    expect(() => syncFrame(doc(outer + inner('fill:#1a1a1a')), getFrame)).toThrow(/fill か stroke/);
  });

  it('閉じた g の後の枠は g の中と見なさない', () => {
    const svg = doc(`<g><rect/></g><g/>${outer}${inner('fill:#1a1a1a;stroke:#ffffff')}`);
    expect(() => syncFrame(svg, getFrame)).not.toThrow();
  });

  it('枠の SVG の要素を g に入れると止める', () => {
    expect(() => parseFrame(frameSvg.replace('<polygon', '<g transform="translate(1,0)"><polygon'))).toThrow(
      /g に入れない/,
    );
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
    const { written, removed, synced } = buildBadges(srcDir, outDir);
    expect(written.sort()).toEqual(['a_x.svg', 'b_y.svg']);
    expect(removed).toEqual(['old_z.svg']);
    expect(synced).toEqual([]);
    expect(svgFiles(outDir).sort()).toEqual(['a_x.svg', 'b_y.svg']);
    expect(readFileSync(join(outDir, 'b_y.svg'), 'utf8')).toBe(optimizeBadge(svg));
  });

  it('writes the synced frame back to the source', () => {
    const { srcDir, outDir } = setup([], []);
    mkdirSync(join(srcDir, 'frame'));
    writeFileSync(join(srcDir, 'frame', 'hex.svg'), frameSvg);
    const moved = frameSvg.replace('stroke:#ffffff', 'stroke:#ff0000').replace('m 7.500021,', 'm 7.6,');
    writeFileSync(join(srcDir, 'c_z.svg'), moved);
    expect(buildBadges(srcDir, outDir).synced).toEqual(['c_z.svg']);
    const synced = readFileSync(join(srcDir, 'c_z.svg'), 'utf8');
    expect(synced).toContain('m 7.500021,');
    expect(synced).toContain('stroke:#ff0000');
    expect(readFileSync(join(outDir, 'c_z.svg'), 'utf8')).toBe(optimizeBadge(synced));
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
});
