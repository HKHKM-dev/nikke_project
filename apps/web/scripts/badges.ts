// モダン UI のバッジを、元の SVG（apps/web/badges-src。Inkscape で描いたもの）から小さくして src/assets/badges に書き出す
// （plan/design-modern-ui.md 2.5 節）。
//   npm run badges:build
// バッジを直すときは badges-src のほうを Inkscape で直し、これを回す。書き出したものが元と合っているかは badges.test.ts が見る。
//
// 六角形の枠（plan/design-badge-frame.md 7 節）: 枠のあるバッジの元は、枠の 2 つの要素（hex-out・hex-in。Inkscape でロックしてある）
// を持つ。書き出しは、まず元の枠を badges-src/frame/hex.svg の形にそろえて元に書き戻し（色は元の hex-in の塗りと縁のまま）、
// そのあと元を小さくする。枠の形は frame/hex.svg だけを直す。枠のある新しいバッジは、枠のあるどれか（ui_blank など）を写して
// 中身を描く。枠の色を変えるときは hex-in の塗りと縁を変える。
//
// 白黒のバッジ（plan/design-badge-color.md）: MONOCHROME に挙げたバッジは、色の役（COLOR_ROLES）の色だけで描き、書き出しで
// 塗りと縁の色を CSS の変数（--badge-<役>）にする。色は画面の CSS が決める（状態のクラス・light-dark() でテーマ）。
// グラデーションの色は画面から変えられない（<use> で出すと、グラデーションは置いた場所の色のまま）ので、グラデーションは陰
// （白か黒の不透明度）にだけ使う。白黒に描き直したバッジは MONOCHROME に足す。
// 画面は全部のバッジを 1 つの文書に置く（スプライト）ので、書き出しは id の前にバッジの名前を付け、viewBox を残す。
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
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { optimize } from 'svgo';

export const BADGE_SRC_DIR = fileURLToPath(new URL('../badges-src', import.meta.url));
export const BADGE_OUT_DIR = fileURLToPath(new URL('../src/assets/badges', import.meta.url));
export const FRAME_FILE = `${BADGE_SRC_DIR}/frame/hex.svg`;

export const svgFiles = (dir: string): string[] => readdirSync(dir).filter((f) => f.endsWith('.svg'));

const frameElement = (label: string) => `<(?:polygon|path)\\b[^<>]*inkscape:label="${label}"[^<>]*/>`;
/** 枠: hex-out の直後に hex-in が続く 2 つの要素の組 */
const FRAME_PAIR = new RegExp(`(${frameElement('hex-out')})\\s*(${frameElement('hex-in')})`, 'g');
/** 枠の要素のラベル（大文字小文字の揺れも拾い、組になっていなければ止めるのに使う） */
const FRAME_LABEL = /inkscape:label="hex-(?:out|in)"/gi;

/** svg の index の位置が、g の中にあるか */
const insideG = (svg: string, index: number): boolean => {
  const before = svg.slice(0, index);
  return (before.match(/<g\b(?![^>]*\/>)/g)?.length ?? 0) > (before.match(/<\/g>/g)?.length ?? 0);
};

/**
 * svg の枠の組を取る（枠が無ければ null）。枠の組が 1 つでない・要素が組になっていない（順が逆・間に別の要素・ラベルの揺れ）・
 * g の中にある（要素だけを置き換えるので、親の transform とずれる）ときは止める
 */
export function findFrame(svg: string): RegExpExecArray | null {
  const pairs = [...svg.matchAll(FRAME_PAIR)];
  const labels = svg.match(FRAME_LABEL)?.length ?? 0;
  if (labels === 0) return null;
  const [pair] = pairs;
  if (!pair || pairs.length !== 1 || labels !== 2)
    throw new Error('badges: 枠は hex-out の直後に hex-in を置いた 1 組にする（ラベルは小文字）');
  if (insideG(svg, pair.index)) throw new Error('badges: 枠の hex-out・hex-in を g に入れない（svg の直下に置く）');
  return pair;
}

/** 枠の 2 つの要素の、元に入れる形（id はラベルと同じにし、Inkscape のロックを付ける）と viewBox */
export type Frame = { viewBox: string; outer: string; inner: string };

/** 枠の SVG（frame/hex.svg）から、枠の 2 つの要素と viewBox を取る */
export function parseFrame(svg: string): Frame {
  const pair = findFrame(svg);
  if (!pair) throw new Error('badges: 枠の SVG に hex-out・hex-in が無い');
  const element = (el: string, label: string): string =>
    el
      .replace(/\sid="[^"]*"/, ` id="${label}"`)
      .replace(/\ssodipodi:insensitive="[^"]*"/, '')
      .replace(/\s*\/>$/, '\n     sodipodi:insensitive="true" />');
  return { viewBox: viewBoxOf(svg), outer: element(pair[1]!, 'hex-out'), inner: element(pair[2]!, 'hex-in') };
}

function viewBoxOf(svg: string): string {
  const viewBox = /<svg\b[^>]*\sviewBox="([^"]*)"/.exec(svg)?.[1];
  if (!viewBox) throw new Error('badges: viewBox が無い');
  return viewBox;
}

/** style の値を、宣言の Map にする */
function declsOf(style: string): Map<string, string> {
  return new Map(
    style
      .split(';')
      .filter(Boolean)
      .map((d) => [d.slice(0, d.indexOf(':')), d.slice(d.indexOf(':') + 1)] as const),
  );
}

/** 要素の style を、宣言の Map にする */
const styleOf = (el: string): Map<string, string> => declsOf(/\sstyle="([^"]*)"/.exec(el)?.[1] ?? '');

/** 枠の hex-in の色を、元の hex-in の塗りと縁の色にする */
function recolorInner(inner: string, source: string): string {
  const from = styleOf(source);
  const fill = from.get('fill');
  const stroke = from.get('stroke');
  if (!fill || !stroke) throw new Error('badges: 元の hex-in の style に fill か stroke が無い');
  const decls = styleOf(inner).set('fill', fill).set('stroke', stroke);
  return inner.replace(/\sstyle="[^"]*"/, ` style="${[...decls].map(([k, v]) => `${k}:${v}`).join(';')}"`);
}

/** 元の枠の 2 つの要素を、枠（frame）の要素に置き換える（色は元の hex-in のまま）。枠の無い元はそのまま返す */
export function syncFrame(svg: string, frame: Frame): string {
  const pair = findFrame(svg);
  if (!pair) return svg;
  if (viewBoxOf(svg) !== frame.viewBox) throw new Error(`badges: 枠のある元の viewBox は ${frame.viewBox} にする`);
  return (
    svg.slice(0, pair.index) +
    frame.outer +
    recolorInner(frame.inner, pair[2]!) +
    svg.slice(pair.index + pair[0].length)
  );
}

/** 色の役: 白黒のバッジの元の色 → 画面の CSS の変数 --badge-<役>（既定の値は元の色） */
export const COLOR_ROLES: Readonly<Record<string, string>> = {
  '#000000': 'line',
  '#1a1a1a': 'ground',
  '#ffffff': 'main',
  '#808080': 'accent',
};

/** 白黒で描いたバッジ（拡張子なしの名前）。色は画面の CSS で付ける */
export const MONOCHROME: ReadonlySet<string> = new Set(['grade_star']);

/** 塗りと縁の色 */
const PAINT = new Set(['fill', 'stroke']);
/** グラデーションとフィルタの色（画面から変えられないので、陰の白か黒だけにする） */
const SHADE = new Set(['stop-color', 'flood-color', 'lighting-color']);
const SHADE_COLORS = new Set(['#000000', '#ffffff']);
/** 色を見る属性（style と、塗り・縁・陰の色の属性） */
const COLOR_ATTRS = new RegExp(`(\\s)(style|${[...PAINT, ...SHADE].join('|')})="([^"]*)"`, 'g');

function roleColor(name: string, prop: string, value: string): string {
  if (SHADE.has(prop) && !SHADE_COLORS.has(value.toLowerCase()))
    throw new Error(`badges: 白黒のバッジ ${name} の ${prop} が ${value}（陰の #000000 か #ffffff にする）`);
  if (!PAINT.has(prop) || ['none', 'currentColor'].includes(value) || value.startsWith('url(')) return value;
  const role = COLOR_ROLES[value.toLowerCase()];
  if (!role) throw new Error(`badges: 白黒のバッジ ${name} の ${prop} の ${value} は色の役（COLOR_ROLES）に無い`);
  return `var(--badge-${role},${value})`;
}

/**
 * 白黒のバッジの塗りと縁の色を、色の役の CSS の変数にする。役に無い色・陰でないグラデーションの色・<style> の要素があれば
 * 止める。style が同じ性質を決める要素の属性（枠の hex-out の stroke="#ff3b57" など）は描かれないので、見ずにそのまま残す
 */
export function applyColorRoles(svg: string, name: string): string {
  if (/<style\b/.test(svg)) throw new Error(`badges: 白黒のバッジ ${name} に <style> がある（色は style 属性に書く）`);
  return svg.replace(/<[^!?/][^>]*>/g, (tag) => {
    const styled = new Set([...styleOf(tag).keys()].map((prop) => prop.trim()));
    return tag.replace(COLOR_ATTRS, (attrText: string, space: string, attr: string, value: string) => {
      if (attr === 'style')
        return `${space}style="${[...declsOf(value)].map(([prop, v]) => `${prop}:${roleColor(name, prop.trim(), v.trim())}`).join(';')}"`;
      return styled.has(attr) ? attrText : `${space}${attr}="${roleColor(name, attr, value)}"`;
    });
  });
}

type Axis = 'x' | 'y';
const REGION: Record<string, readonly [string, Axis]> = {
  x: ['-10%', 'x'],
  y: ['-10%', 'y'],
  width: ['120%', 'x'],
  height: ['120%', 'y'],
};
/** userSpaceOnUse のときに、% と既定の値が viewport で決まる属性（要素 → 単位の属性・属性ごとの既定の値と向き） */
const USER_SPACE: Record<string, { units: string; attrs: Record<string, readonly [string, Axis]> }> = {
  mask: { units: 'maskUnits', attrs: REGION },
  filter: { units: 'filterUnits', attrs: REGION },
  linearGradient: {
    units: 'gradientUnits',
    attrs: { x1: ['0%', 'x'], y1: ['0%', 'y'], x2: ['100%', 'x'], y2: ['0%', 'y'] },
  },
};

/**
 * userSpaceOnUse のマスク・フィルタ・グラデーションの範囲と座標の % と既定の値を、その SVG の viewBox で数にする（svgo の
 * 部品）。% は一番近い viewport で決まり、<img> ではバッジの viewBox だが、<use> ではスプライトを置いた（0×0 の）svg に
 * なり、マスクが消える（Inkscape のマスクは maskUnits="userSpaceOnUse" で、範囲を書かない）。
 * href で別のグラデーションを引くものは、引いた先から受け継ぐので既定の値を足さない
 */
const resolveUserSpace = (size: Record<Axis, number>) => ({
  name: 'resolveUserSpace',
  fn: () => ({
    element: {
      enter: (node: { name: string; attributes: Record<string, string> }) => {
        const { attributes: a } = node;
        if (node.name === 'radialGradient' || node.name === 'pattern') {
          if (Object.values(a).includes('userSpaceOnUse'))
            throw new Error(`badges: userSpaceOnUse の ${node.name} は書き出しが扱わない`);
          return;
        }
        const spec = USER_SPACE[node.name];
        if (!spec || a[spec.units] !== 'userSpaceOnUse') return;
        const inherits = a.href !== undefined || a['xlink:href'] !== undefined;
        for (const [attr, [fallback, axis]] of Object.entries(spec.attrs)) {
          const value = a[attr] ?? (inherits ? undefined : fallback);
          if (value?.endsWith('%')) a[attr] = String(+((parseFloat(value) / 100) * size[axis]).toFixed(3));
        }
      },
    },
  }),
});

/** 元の SVG のファイル名から、拡張子なしの名前（画面がバッジを引く名前） */
export const badgeNameOf = (file: string): string => file.slice(0, -'.svg'.length);

/**
 * 元の SVG（拡張子なしの名前が name）を書き出しにする。白黒のバッジは色を CSS の変数にしてから小さくする。
 * - convertTransform は切る（corporation_TETRA の反転を含む変換が別の変換に書き換わり、図柄が崩れる）
 * - removeViewBox は切る（画面はスプライトの symbol に viewBox を写す）
 * - userSpaceOnUse の範囲を数にする（resolveUserSpace）
 * - id の前にバッジの名前を付ける（スプライトで、ほかのバッジの id と重ならないように）
 */
export function optimizeBadge(svg: string, name: string): string {
  const [, , w = 0, h = 0] = viewBoxOf(svg)
    .split(/[\s,]+/)
    .map(Number);
  const out = optimize(MONOCHROME.has(name) ? applyColorRoles(svg, name) : svg, {
    multipass: true,
    plugins: [
      resolveUserSpace({ x: w, y: h }),
      { name: 'preset-default', params: { overrides: { convertTransform: false, removeViewBox: false } } },
      { name: 'prefixIds', params: { prefix: name } },
    ],
  }).data;
  // resolveUserSpace が扱わない % の長さは、<use> ではスプライトの 0×0 の svg で決まって消える（グラデーションの offset は除く）
  const percent = /\s(?!offset=)[\w:-]+="[^"]*%"/.exec(out);
  if (percent) throw new Error(`badges: ${name} に % の値がある（${percent[0].trim()}。数で書く）`);
  return out;
}

/**
 * srcDir の元の枠をそろえて書き戻し（synced）、元を小さくして outDir に書き（written）、元の無い書き出しを消す（removed。
 * 元を消したときや名前を変えたとき）。枠は srcDir/frame/hex.svg。srcDir に SVG が 1 つも無ければ、何も書かず消さずに止める
 * （取り違えたフォルダや取り出し損ねで、書き出しを全部消さない）
 */
export function buildBadges(
  srcDir: string,
  outDir: string,
): { written: string[]; removed: string[]; synced: string[] } {
  const written = svgFiles(srcDir);
  if (written.length === 0) throw new Error(`${srcDir} に SVG が無い（書き出しの ${outDir} は消さない）`);
  // 画面（src/components/modern/badges.ts）は <グループ>_<値> の名前でバッジを引く
  const misnamed = written.filter((f) => !/^[^_]+_[^-]+(?:-.+)?\.svg$/.test(f));
  if (misnamed.length > 0) throw new Error(`badges: 命名規則に合わない ${misnamed.join(', ')}`);
  const frame = parseFrame(readFileSync(`${srcDir}/frame/hex.svg`, 'utf8'));
  const synced: string[] = [];
  for (const file of written) {
    const source = readFileSync(`${srcDir}/${file}`, 'utf8');
    const svg = syncFrame(source, frame);
    if (svg !== source) {
      writeFileSync(`${srcDir}/${file}`, svg);
      synced.push(file);
    }
    // 中身が変わらない書き出しは書かない（dev サーバーの監視を無駄に起こさない）
    const out = optimizeBadge(svg, badgeNameOf(file));
    const outPath = `${outDir}/${file}`;
    if (!existsSync(outPath) || readFileSync(outPath, 'utf8') !== out) writeFileSync(outPath, out);
  }
  const removed = svgFiles(outDir).filter((f) => !written.includes(f));
  for (const file of removed) rmSync(`${outDir}/${file}`);
  return { written, removed, synced };
}

if (import.meta.main) {
  const { written, removed, synced } = buildBadges(BADGE_SRC_DIR, BADGE_OUT_DIR);
  console.log(
    `badges: ${written.length} written` +
      (synced.length > 0 ? `, frame synced ${synced.join(', ')}` : '') +
      (removed.length > 0 ? `, removed ${removed.join(', ')}` : ''),
  );
}
