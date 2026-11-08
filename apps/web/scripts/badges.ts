// モダン UI のバッジを、元の SVG（apps/web/badges-src。Inkscape で描いたもの）から小さくして src/assets/badges に書き出す
// （plan/design-modern-ui.md 2.5 節）。六角形の枠は badges-src/frame/hex.svg の 1 つだけで、枠のあるバッジの元は中身だけを持ち、
// 書き出しで枠を合成する（plan/design-badge-frame.md）。
//   npm run badges:build
// バッジを直すときは badges-src のほうを Inkscape で直し、これを回す。書き出したものが元と合っているかは badges.test.ts が見る。
// 枠のある新しいバッジは frame/hex.svg を写して中身を描き、枠の 2 つの要素（hex-out・hex-in）を消して保存し、下の FRAMES に載せる。
//
// ファイル名の命名規則: <グループ>_<値>[-<変種>].svg
// - グループ: キャラのデータ（CharacterIndexEntry）にある項目は、その項目名のまま（element・burstStep・class・weaponType・
//   rarity・corporation）。育成の入力（GrowthInput）の項目も、その項目名のまま（grade・core）。どちらにも無いものは camelCase の
//   英単語（burst・collection・ui）
// - 値: データにある項目は、データの値を大文字小文字までそのまま（Fire・Step1・AllStep・ELYSION など）。値ごとの絵でないもの
//   （grade の空いた星と埋まった星など）と、データに無いものは小文字の英語
// - 変種: 同じ値の別の版は後ろに -<小文字> を付ける（collection の上限に達した版は -max、背景の六角形を付けた版は -badge）
// - 並びの番号は付けない（並びは使う側のコードが決める）
// - 規則に合わない名前（<グループ>_ の無いもの）があると、書き出しは止まる
import { readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { optimize } from 'svgo';

export const BADGE_SRC_DIR = fileURLToPath(new URL('../badges-src', import.meta.url));
export const BADGE_OUT_DIR = fileURLToPath(new URL('../src/assets/badges', import.meta.url));
export const FRAME_FILE = `${BADGE_SRC_DIR}/frame/hex.svg`;

export const svgFiles = (dir: string): string[] => readdirSync(dir).filter((f) => f.endsWith('.svg'));

/** 枠の内側の六角形（hex-in）の塗りと縁の色 */
export type FrameColors = { fill: string; stroke: string };

const DEFAULT_FRAME: FrameColors = { fill: '#1a1a1a', stroke: '#ffffff' };

/**
 * 枠を付けるバッジと、既定の色（DEFAULT_FRAME）から変える色。キーはファイル名（拡張子なし）か、グループ全部（<グループ>_*）か、
 * 変種全部（*-<変種>）。ファイル名・グループ・変種の順に引く。載らないバッジには枠を付けない。
 * 属性の縁の色は属性の図柄の色と少し違う。collection は中が白で、上限に達した版（-max）は既定の暗い色。
 */
export const FRAMES: Record<string, Partial<FrameColors>> = {
  'burst_*': {},
  'class_*': {},
  'corporation_*': {},
  'weaponType_*': {},
  '*-badge': {},
  ui_blank: {},
  ui_delete: {},
  ui_ring: {},
  element_Electronic: { stroke: '#f70ad8' },
  element_Fire: { stroke: '#ff0000' },
  element_Iron: { stroke: '#feb902' },
  element_Water: { stroke: '#007dfd' },
  element_Wind: { stroke: '#00ff00' },
  burstStep_Step1: { fill: '#008000' },
  burstStep_Step2: { fill: '#b27800' },
  burstStep_Step3: { fill: '#cc0000' },
  burstStep_AllStep: { fill: '#8b00cc' },
  collection_plain: {},
  collection_R: { fill: '#ffffff', stroke: '#00a8ff' },
  'collection_R-max': { stroke: '#00a8ff' },
  collection_SR: { fill: '#ffffff', stroke: '#df20df' },
  'collection_SR-max': { stroke: '#df20df' },
  collection_SSR: { fill: '#ffffff', stroke: '#ff8000' },
  'collection_SSR-max': { stroke: '#ff8000' },
};

/** ファイル名（拡張子は有っても無くてもよい）から枠の色を引く。枠を付けないバッジは null */
export function frameOf(file: string): FrameColors | null {
  const name = file.replace(/\.svg$/, '');
  const m = /^(?<group>[^_]+)_[^-]+(?:-(?<variant>.+))?$/.exec(name);
  if (!m?.groups) throw new Error(`badges: 命名規則に合わない ${name}`);
  const { group, variant } = m.groups;
  const colors = FRAMES[name] ?? FRAMES[`${group}_*`] ?? (variant ? FRAMES[`*-${variant}`] : undefined);
  return colors ? { ...DEFAULT_FRAME, ...colors } : null;
}

/** 枠の要素のラベル。元に枠が残っていないかもこれで見る（burstStep の元は Hex- と大文字で書いていた） */
export const FRAME_LABEL = /inkscape:label="hex-(?:out|in)"/i;

type ViewBox = [x: number, y: number, width: number, height: number];
/** 枠の 2 つの要素（hex-out・hex-in）と viewBox */
export type Frame = { viewBox: ViewBox; outer: string; inner: string };

/** 枠の SVG から、枠の 2 つの要素と viewBox を取る。要素の id は外す（中身の id と重ならないように） */
export function parseFrame(svg: string): Frame {
  // 要素だけを抜くので、g（Inkscape のレイヤー）に入れると親の transform が落ちる
  if (/<g\b/.test(svg)) throw new Error('badges: 枠の hex-out・hex-in を g に入れない（svg の直下に置く）');
  const element = (label: string): string => {
    const el = new RegExp(`<(?:polygon|path)\\b[^<>]*inkscape:label="${label}"[^<>]*/>`).exec(svg)?.[0];
    if (!el) throw new Error(`badges: 枠に ${label} が無い`);
    return el.replace(/\sid="[^"]*"/g, '');
  };
  return { viewBox: viewBoxOf(svg), outer: element('hex-out'), inner: element('hex-in') };
}

function viewBoxOf(svg: string): ViewBox {
  const viewBox = /<svg\b[^>]*\sviewBox="([^"]*)"/.exec(svg)?.[1];
  if (!viewBox) throw new Error('badges: viewBox が無い');
  return viewBox.split(/[\s,]+/).map(Number) as ViewBox;
}

/** 要素の style の fill と stroke を差し替える（どちらも style に無ければ止める） */
function setStyleColors(el: string, colors: FrameColors): string {
  return el.replace(/\sstyle="([^"]*)"/, (_, style: string) => {
    const decls = new Map(
      style
        .split(';')
        .filter(Boolean)
        .map((d) => [d.slice(0, d.indexOf(':')), d.slice(d.indexOf(':') + 1)] as const),
    );
    if (!decls.has('fill') || !decls.has('stroke'))
      throw new Error('badges: 枠の hex-in の style に fill か stroke が無い');
    decls.set('fill', colors.fill).set('stroke', colors.stroke);
    return ` style="${[...decls].map(([k, v]) => `${k}:${v}`).join(';')}"`;
  });
}

/** 枠の後に中身を置いた SVG にする。中身の viewBox が枠と違えば、枠の viewBox に合わせて拡大縮小する（縦横の比が違えば止める） */
export function composeBadge(content: string, frame: Frame, colors: FrameColors): string {
  if (FRAME_LABEL.test(content)) throw new Error('badges: 中身の元に枠が残っている（hex-out・hex-in を消す）');
  const root = /<svg\b[^>]*>/.exec(content);
  const close = content.lastIndexOf('</svg>');
  if (!root || close < 0) throw new Error('badges: svg 要素が無い');
  const [fx, fy, fw, fh] = frame.viewBox;
  const [cx, cy, cw, ch] = viewBoxOf(content);
  const sx = fw / cw;
  const sy = fh / ch;
  if (Math.abs(sx / sy - 1) > 1e-4) throw new Error(`badges: 中身の縦横の比が枠と違う（${cw}×${ch}）`);
  const body = content.slice(root.index + root[0].length, close);
  const scaled =
    sx === 1 && cx === fx && cy === fy
      ? body
      : `<g transform="matrix(${sx},0,0,${sy},${fx - cx * sx},${fy - cy * sy})">${body}</g>`;
  // 大きさも枠に合わせる（mm の文書の width="34.4mm" などを残さない）
  const rootTag = Object.entries({ viewBox: frame.viewBox.join(' '), width: fw, height: fh }).reduce(
    (tag, [k, v]) =>
      new RegExp(`\\s${k}="`).test(tag)
        ? tag.replace(new RegExp(`\\s${k}="[^"]*"`), ` ${k}="${v}"`)
        : tag.replace(/^<svg\b/, `<svg ${k}="${v}"`),
    root[0],
  );
  return `${content.slice(0, root.index)}${rootTag}${frame.outer}${setStyleColors(frame.inner, colors)}${scaled}</svg>\n`;
}

/** 元の SVG を小さくする。convertTransform は切る（corporation_TETRA の反転を含む変換が別の変換に書き換わり、図柄が崩れる） */
export function optimizeBadge(svg: string): string {
  return optimize(svg, {
    multipass: true,
    plugins: [{ name: 'preset-default', params: { overrides: { convertTransform: false } } }],
  }).data;
}

/** 元の 1 つから書き出しの中身を作る（枠を付けるものは合成してから小さくする）。枠は要るときだけ getFrame で読む */
export function buildBadge(file: string, source: string, getFrame: () => Frame): string {
  const colors = frameOf(file);
  return optimizeBadge(colors ? composeBadge(source, getFrame(), colors) : source);
}

/**
 * srcDir の SVG を書き出し（枠を合成して小さくし）て outDir に書き、元の無い書き出しを消す（元を消したときや名前を変えたとき）。
 * 枠は srcDir/frame/hex.svg。srcDir に SVG が 1 つも無ければ、何も書かず消さずに止める（取り違えたフォルダや取り出し損ねで、
 * 書き出しを全部消さない）
 */
export function buildBadges(srcDir: string, outDir: string): { written: string[]; removed: string[] } {
  const written = svgFiles(srcDir);
  if (written.length === 0) throw new Error(`${srcDir} に SVG が無い（書き出しの ${outDir} は消さない）`);
  let frame: Frame | undefined;
  const getFrame = () => (frame ??= parseFrame(readFileSync(`${srcDir}/frame/hex.svg`, 'utf8')));
  for (const file of written)
    writeFileSync(`${outDir}/${file}`, buildBadge(file, readFileSync(`${srcDir}/${file}`, 'utf8'), getFrame));
  const removed = svgFiles(outDir).filter((f) => !written.includes(f));
  for (const file of removed) rmSync(`${outDir}/${file}`);
  return { written, removed };
}

if (import.meta.main) {
  const { written, removed } = buildBadges(BADGE_SRC_DIR, BADGE_OUT_DIR);
  console.log(`badges: ${written.length} written${removed.length > 0 ? `, removed ${removed.join(', ')}` : ''}`);
}
