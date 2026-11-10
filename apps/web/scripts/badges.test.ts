// 書き出したバッジ（src/assets/badges）が、元の SVG（badges-src）を badges.ts で小さくしたものと同じで、元の枠が frame/hex.svg と
// 同じ形であること
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BADGE_OUT_DIR,
  BADGE_SRC_DIR,
  COLOR_ROLES,
  FRAME_FILE,
  MONOCHROME,
  applyColorRoles,
  buildBadges,
  findFrame,
  optimizeBadge,
  parseFrame,
  svgFiles,
  syncFrame,
} from './badges.ts';

const frameSvg = readFileSync(FRAME_FILE, 'utf8');
const frame = parseFrame(frameSvg);
const sources = new Map(svgFiles(BADGE_SRC_DIR).map((f) => [f, readFileSync(`${BADGE_SRC_DIR}/${f}`, 'utf8')]));

describe('バッジの書き出し', () => {
  it('元と書き出しのファイルが同じ顔ぶれ', () => {
    expect(svgFiles(BADGE_OUT_DIR)).toEqual([...sources.keys()]);
  });

  it.each([...sources.keys()])(
    '%s は元の枠がそろい、書き出しは元を小さくしたもの（違うなら npm run badges:build）',
    (file) => {
      const source = sources.get(file)!;
      expect(syncFrame(source, frame)).toBe(source);
      expect(readFileSync(`${BADGE_OUT_DIR}/${file}`, 'utf8')).toBe(
        optimizeBadge(source, file.slice(0, -'.svg'.length)),
      );
    },
  );

  it('グループと変種が同じ元は、枠の有無がそろう（ui は除く）', () => {
    const framed = new Map<string, Set<boolean>>();
    for (const [file, svg] of sources) {
      const [, group, variant = ''] = /^([^_]+)_[^-]+(?:-(.+))?\.svg$/.exec(file)!;
      if (group === 'ui') continue;
      const key = `${group}-${variant}`;
      framed.set(key, (framed.get(key) ?? new Set()).add(findFrame(svg) !== null));
    }
    expect([...framed].filter(([, has]) => has.size > 1).map(([key]) => key)).toEqual([]);
  });
});

describe('枠をそろえる', () => {
  const style = 'fill:#1a1a1a;stroke:#ffffff';
  const inner = (s = style, label = 'hex-in') => `<path style="${s}" d="m 0,0 z" inkscape:label="${label}" />`;
  const outer = '<polygon points="0,0 1,1" style="fill:none;stroke:#000000" inkscape:label="hex-out" />';
  const doc = (body: string, viewBox = '0 0 130 150') =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}<circle r="1"/></svg>`;

  it('枠の要素を frame/hex.svg のものにし、色は元の hex-in のまま', () => {
    const out = syncFrame(doc(outer + inner('fill:#123456;stroke:#abcdef;stroke-width:9')), frame);
    expect(out).toContain(frame.outer);
    expect(out).toContain('fill:#123456');
    expect(out).toContain('stroke:#abcdef');
    expect(out).not.toContain('stroke-width:9');
    expect(out).toContain('<circle r="1"/>');
    expect(syncFrame(out, frame)).toBe(out);
  });

  it('枠の要素はロックし、id をラベルと同じにする', () => {
    for (const el of [frame.outer, frame.inner]) expect(el).toContain('sodipodi:insensitive="true"');
    expect(frame.outer).toContain('id="hex-out"');
    expect(frame.inner).toContain('id="hex-in"');
  });

  it('枠の無い元はそのまま', () => {
    const svg = doc('');
    expect(syncFrame(svg, frame)).toBe(svg);
  });

  it('枠が 1 組になっていなければ止める', () => {
    for (const body of [
      inner(),
      outer + outer + inner(),
      outer + inner() + outer + inner(),
      inner() + outer,
      `${outer}<rect/>${inner()}`,
      outer + inner(style, 'Hex-in'),
    ])
      expect(() => syncFrame(doc(body), frame)).toThrow(/1 組/);
  });

  it('枠が g の中・viewBox が枠と違う・hex-in に色が無いときは止める', () => {
    expect(() => syncFrame(doc(`<g transform="scale(2)">${outer}${inner()}</g>`), frame)).toThrow(/g に入れない/);
    expect(() => syncFrame(doc(outer + inner(), '0 0 13 15'), frame)).toThrow(/viewBox/);
    expect(() => syncFrame(doc(outer + inner('fill:#1a1a1a')), frame)).toThrow(/fill か stroke/);
  });

  it('閉じた g の後の枠は g の中と見なさない', () => {
    expect(() => syncFrame(doc(`<g><rect/></g><g/>${outer}${inner()}`), frame)).not.toThrow();
  });

  it('枠の SVG の要素を g に入れると止める', () => {
    expect(() => parseFrame(frameSvg.replace('<polygon', '<g transform="translate(1,0)"><polygon'))).toThrow(
      /g に入れない/,
    );
  });
});

describe('白黒のバッジ', () => {
  const doc = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${body}</svg>`;

  it('塗りと縁の色の役を CSS の変数にし、ほかはそのまま', () => {
    const out = applyColorRoles(
      doc(
        '<path style="fill:#FFFFFF;stroke:#000000;stroke-width:2" fill="#808080"/><rect style="fill:url(#g);stroke:none"/>',
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
  });

  // MONOCHROME の名前の元が無い（名前を変えた）ときも、ここで落ちる
  it('書き出しは、白黒のバッジの色を変数にし、id の前に名前を付ける', () => {
    for (const name of MONOCHROME) {
      const out = readFileSync(`${BADGE_OUT_DIR}/${name}.svg`, 'utf8');
      expect(out).toMatch(/var\(--badge-/);
      for (const [, id] of out.matchAll(/\sid="([^"]+)"/g)) expect(id).toMatch(new RegExp(`^${name}__`));
    }
    expect(Object.values(COLOR_ROLES)).toEqual(['line', 'ground', 'main', 'accent']);
  });
});

describe('buildBadges', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>';
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });
  /** 元（枠の frame/hex.svg も置く）と書き出しのフォルダを作り、それぞれに files の SVG を置く */
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
    mkdirSync(join(srcDir, 'frame'));
    writeFileSync(join(srcDir, 'frame', 'hex.svg'), frameSvg);
    return { srcDir, outDir };
  }

  it('writes every source and removes outputs whose source is gone', () => {
    const { srcDir, outDir } = setup(['a_x.svg', 'b_y.svg'], ['a_x.svg', 'old_z.svg']);
    const { written, removed, synced } = buildBadges(srcDir, outDir);
    expect(written.sort()).toEqual(['a_x.svg', 'b_y.svg']);
    expect(removed).toEqual(['old_z.svg']);
    expect(synced).toEqual([]);
    expect(svgFiles(outDir).sort()).toEqual(['a_x.svg', 'b_y.svg']);
    expect(readFileSync(join(outDir, 'b_y.svg'), 'utf8')).toBe(optimizeBadge(svg, 'b_y'));
  });

  it('writes the synced frame back to the source', () => {
    const { srcDir, outDir } = setup([], []);
    const moved = frameSvg.replace('stroke:#ffffff', 'stroke:#ff0000').replace('m 7.500021,', 'm 7.6,');
    writeFileSync(join(srcDir, 'c_z.svg'), moved);
    expect(buildBadges(srcDir, outDir).synced).toEqual(['c_z.svg']);
    const synced = readFileSync(join(srcDir, 'c_z.svg'), 'utf8');
    expect(synced).toContain('m 7.500021,');
    expect(synced).toContain('stroke:#ff0000');
    expect(readFileSync(join(outDir, 'c_z.svg'), 'utf8')).toBe(optimizeBadge(synced, 'c_z'));
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
