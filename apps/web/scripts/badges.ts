// モダン UI のバッジを、元の SVG（apps/web/badges-src。Inkscape で描いたもの）から小さくして src/assets/badges に書き出す
// （plan/design-modern-ui.md 2.5 節）。
//   npm run badges:build
// バッジを直すときは badges-src のほうを Inkscape で直す。書き出しは npm run pr:prep が回して commit する（手元で画面を見るときはこれを
// 回す）。書き出したものが元と合っているかは badges.test.ts が見る。
// 書き出すのは badges-src の直下の SVG だけ。枠の無い図柄だけの部品（parts/parts_*.svg。バッジを描くときに写す元）は書き出さない。
//
// 枠（plan/design-badge-frame.md）: 元の枠（frame-out・frame-in）は元ごとに Inkscape で描き、書き出しは手を加えない。枠のある
// 新しいバッジは、同じ形の型（ui_blank_<形>）を写して中身を描く。
//
// 白黒のバッジ（plan/design-badge-color.md）: SPRITE_GROUPS のグループと SPRITE_NAMES の monochrome のバッジは、色の役（COLOR_ROLES）の色だけで描き、
// 書き出しで塗りと縁の色を CSS の変数（--badge-<役>）にする。色は画面の CSS が決める（値ごとの色・状態のクラス・
// light-dark() でテーマ）。値ごとに色の違う部分（属性の図柄など）は差し色（#808080）で描く。
// グラデーションの色は画面から変えられない（<use> で出すと、グラデーションは置いた場所の色のまま）ので、グラデーションは陰
// （白か黒の不透明度）にだけ使う。マスクの中の色は形（明るさ）なので、そのまま残す。
// 画面はスプライトに入るバッジ（SPRITE_GROUPS・SPRITE_NAMES）を 1 つの文書に置くので、書き出しはそれを sprite/ に置き、id の前に
// バッジの名前を付け、viewBox を残す。ほか（<img> で読むものと、使っていないもの）は src/assets/badges の直下に置く。
//
// ファイル名の命名規則: <グループ>_<値>[-<変種>].svg
// - グループ: キャラのデータ（CharacterIndexEntry）にある項目は、その項目名のまま（element・burstStep・class・weaponType・
//   rarity・corporation）。育成の入力（GrowthInput）の項目も、その項目名のまま（grade・core）。どちらにも無いものは camelCase の
//   英単語（burst・collection・ui）
// - 値: データにある項目は、データの値を大文字小文字までそのまま（Fire・Step1・AllStep・ELYSION など）。値ごとの絵でないもの
//   （grade の空いた星と埋まった星など）と、データに無いものは小文字の英語
// - 変種: 同じ値の別の版は後ろに -<小文字> を付ける（背景の六角形を付けた版は -badge）
// - 並びの番号は付けない（並びは使う側のコードが決める）
// - 規則に合わない名前（<グループ>_ の無いもの）があると、書き出しは止まる
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { optimize } from 'svgo';

export const BADGE_SRC_DIR = fileURLToPath(new URL('../badges-src', import.meta.url));
export const BADGE_OUT_DIR = fileURLToPath(new URL('../src/assets/badges', import.meta.url));

export const svgFiles = (dir: string): string[] => readdirSync(dir).filter((f) => f.endsWith('.svg'));

/** 元の SVG のファイル名から、拡張子なしの名前（画面がバッジを引く名前） */
export const badgeNameOf = (file: string): string => file.slice(0, -'.svg'.length);

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

/** 色の役: 白黒のバッジの元の色 → 画面の CSS の変数 --badge-<役>（既定の値は元の色） */
export const COLOR_ROLES: Readonly<Record<string, string>> = {
  '#000000': 'line',
  '#1a1a1a': 'ground',
  '#ffffff': 'main',
  '#808080': 'accent',
};

/**
 * 画面のスプライトに入るバッジのグループ。どれも白黒で描き、色は画面の CSS で付ける。書き出しは sprite/ に置き、画面は sprite/ を
 * 1 つの glob で読む（src/components/modern/badges.ts）
 */
export const SPRITE_GROUPS: ReadonlySet<string> = new Set([
  'element',
  'burstStep',
  'class',
  'weaponType',
  'corporation',
  'collection',
  'grade',
  'core',
  'main',
]);

/**
 * グループの外で、画面のスプライトに入るバッジ（拡張子なしの名前 → 描き方）。monochrome は白黒で描き、画面が図柄の色を CSS で変える。
 * color は色のまま（無地の ui_blank_main）。画面のバッジを足すときは、ここに 1 行足して、使う場所の定数（badges.ts の badgeName）を足す
 */
export const SPRITE_NAMES: Readonly<Record<string, 'monochrome' | 'color'>> = {
  ui_blank_main: 'color',
  ui_blank_hexagon: 'monochrome',
  ui_information: 'monochrome',
  ui_controller: 'monochrome',
  ui_window: 'monochrome',
  ui_account: 'monochrome',
  ui_return: 'monochrome',
  ui_delete: 'monochrome',
  ui_setting: 'monochrome',
  ui_cu: 'monochrome',
  ui_mcu: 'monochrome',
  ui_arrow: 'monochrome',
  ui_light: 'monochrome',
  ui_dark: 'monochrome',
  ui_system: 'monochrome',
  ui_undo: 'monochrome',
  ui_redo: 'monochrome',
  ui_classic: 'monochrome',
  ui_modern: 'monochrome',
};

const groupOf = (name: string): string => name.slice(0, name.indexOf('_'));

/** バッジ（拡張子なしの名前）が画面のスプライトに入るものか */
export const inSprite = (name: string): boolean =>
  Object.hasOwn(SPRITE_NAMES, name) || SPRITE_GROUPS.has(groupOf(name));

/** バッジ（拡張子なしの名前）が白黒で描くものか */
export const isMonochrome = (name: string): boolean => inSprite(name) && SPRITE_NAMES[name] !== 'color';

/** 書き出しのフォルダの中で、そのバッジ（元のファイル名）を置く所（スプライトに入るものは sprite/） */
export const badgeOutPath = (file: string): string => (inSprite(badgeNameOf(file)) ? `sprite/${file}` : file);

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
  if (
    !PAINT.has(prop) ||
    ['none', 'currentColor', 'context-stroke', 'context-fill'].includes(value) ||
    value.startsWith('url(')
  )
    return value;
  const role = COLOR_ROLES[value.toLowerCase()];
  if (!role) throw new Error(`badges: 白黒のバッジ ${name} の ${prop} の ${value} は色の役（COLOR_ROLES）に無い`);
  return `var(--badge-${role},${value})`;
}

/**
 * 白黒のバッジの塗りと縁の色を、色の役の CSS の変数にする。役に無い色・陰でないグラデーションの色・<style> の要素があれば
 * 止める。style が同じ性質を決める要素の属性（stroke="#ff3b57" と style の stroke の両方を持つ要素など）は描かれないので、見ずにそのまま残す。
 * マスクの中（<mask>〜</mask>）は、色が形（明るさ）なのでそのまま残す
 */
export function applyColorRoles(svg: string, name: string): string {
  if (/<style\b/.test(svg)) throw new Error(`badges: 白黒のバッジ ${name} に <style> がある（色は style 属性に書く）`);
  return svg
    .split(/(<mask\b[\s\S]*?<\/mask>)/)
    .map((part, i) => (i % 2 === 1 ? part : applyRolesOutsideMasks(part, name)))
    .join('');
}

function applyRolesOutsideMasks(svg: string, name: string): string {
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
  const out = optimize(isMonochrome(name) ? applyColorRoles(svg, name) : svg, {
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

/** 書き出しのフォルダにある SVG（直下と sprite/。outDir からの相対のパス） */
export const outputFiles = (outDir: string): string[] => [
  ...svgFiles(outDir),
  ...(existsSync(`${outDir}/sprite`) ? svgFiles(`${outDir}/sprite`).map((f) => `sprite/${f}`) : []),
];

/**
 * srcDir の元を小さくして outDir（スプライトに入るものは outDir/sprite）に書き（written。outDir からの相対のパス）、元の無い書き出しを
 * 消す（removed。元を消したとき・名前を変えたとき・スプライトに入るかが変わったとき）。
 * srcDir に SVG が 1 つも無ければ、何も書かず消さずに止める
 * （取り違えたフォルダや取り出し損ねで、書き出しを全部消さない）
 */
export function buildBadges(srcDir: string, outDir: string): { written: string[]; removed: string[] } {
  const written = svgFiles(srcDir);
  if (written.length === 0) throw new Error(`${srcDir} に SVG が無い（書き出しの ${outDir} は消さない）`);
  // 画面（src/components/modern/badges.ts）は <グループ>_<値> の名前でバッジを引く
  const misnamed = written.filter((f) => !/^[^_]+_[^-]+(?:-.+)?\.svg$/.test(f));
  if (misnamed.length > 0) throw new Error(`badges: 命名規則に合わない ${misnamed.join(', ')}`);
  mkdirSync(`${outDir}/sprite`, { recursive: true });
  for (const file of written) {
    const svg = readFileSync(`${srcDir}/${file}`, 'utf8');
    // 中身が変わらない書き出しは書かない（dev サーバーの監視を無駄に起こさない）
    const out = optimizeBadge(svg, badgeNameOf(file));
    const outPath = `${outDir}/${badgeOutPath(file)}`;
    if (!existsSync(outPath) || readFileSync(outPath, 'utf8') !== out) writeFileSync(outPath, out);
  }
  const placed = written.map(badgeOutPath);
  const removed = outputFiles(outDir).filter((f) => !placed.includes(f));
  for (const file of removed) rmSync(`${outDir}/${file}`);
  return { written: placed, removed };
}

if (import.meta.main) {
  const { written, removed } = buildBadges(BADGE_SRC_DIR, BADGE_OUT_DIR);
  console.log(`badges: ${written.length} written` + (removed.length > 0 ? `, removed ${removed.join(', ')}` : ''));
}
