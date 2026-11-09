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

const viewBoxOf = (svg: string): string => /<svg\b[^>]*\sviewBox="([^"]*)"/.exec(svg)?.[1] ?? '';

/** 要素の style を、宣言の Map にする */
function styleOf(el: string): Map<string, string> {
  const style = /\sstyle="([^"]*)"/.exec(el)?.[1] ?? '';
  return new Map(
    style
      .split(';')
      .filter(Boolean)
      .map((d) => [d.slice(0, d.indexOf(':')), d.slice(d.indexOf(':') + 1)] as const),
  );
}

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

/** 元の SVG を小さくする。convertTransform は切る（corporation_TETRA の反転を含む変換が別の変換に書き換わり、図柄が崩れる） */
export function optimizeBadge(svg: string): string {
  return optimize(svg, {
    multipass: true,
    plugins: [{ name: 'preset-default', params: { overrides: { convertTransform: false } } }],
  }).data;
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
    const out = optimizeBadge(svg);
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
