// モダン UI のバッジを、元の SVG（apps/web/badges-src。Inkscape で描いたもの）から小さくして src/assets/badges に書き出す
// （plan/design-modern-ui.md 2.5 節）。
//   npm run badges:build
// バッジを直すときは badges-src のほうを Inkscape で直し、これを回す。書き出したものが元と合っているかは badges.test.ts が見る。
//
// ファイル名の命名規則: <グループ>_<値>[-<変種>].svg
// - グループ: キャラのデータ（CharacterIndexEntry）にある項目は、その項目名のまま（element・burstStep・class・weaponType・
//   rarity・corporation）。育成の入力（GrowthInput）の項目も、その項目名のまま（grade・core）。どちらにも無いものは camelCase の
//   英単語（burst・collection・ui）
// - 値: データにある項目は、データの値を大文字小文字までそのまま（Fire・Step1・AllStep・ELYSION など）。値ごとの絵でないもの
//   （grade の空いた星と埋まった星など）と、データに無いものは小文字の英語
// - 変種: 同じ値の別の版は後ろに -<小文字> を付ける（collection の上限に達した版は -max、背景の六角形を付けた版は -badge）
// - 並びの番号は付けない（並びは使う側のコードが決める）
import { readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { optimize } from 'svgo';

export const BADGE_SRC_DIR = fileURLToPath(new URL('../badges-src', import.meta.url));
export const BADGE_OUT_DIR = fileURLToPath(new URL('../src/assets/badges', import.meta.url));

export const svgFiles = (dir: string): string[] => readdirSync(dir).filter((f) => f.endsWith('.svg'));

/** 元の SVG を小さくする。convertTransform は切る（corporation_TETRA の反転を含む変換が別の変換に書き換わり、図柄が崩れる） */
export function optimizeBadge(svg: string): string {
  return optimize(svg, {
    multipass: true,
    plugins: [{ name: 'preset-default', params: { overrides: { convertTransform: false } } }],
  }).data;
}

/**
 * srcDir の SVG を小さくして outDir に書き、元の無い書き出しを消す（元を消したときや名前を変えたとき）。
 * srcDir に SVG が 1 つも無ければ、何も書かず消さずに止める（取り違えたフォルダや取り出し損ねで、書き出しを全部消さない）
 */
export function buildBadges(srcDir: string, outDir: string): { written: string[]; removed: string[] } {
  const written = svgFiles(srcDir);
  if (written.length === 0) throw new Error(`${srcDir} に SVG が無い（書き出しの ${outDir} は消さない）`);
  for (const file of written)
    writeFileSync(`${outDir}/${file}`, optimizeBadge(readFileSync(`${srcDir}/${file}`, 'utf8')));
  const removed = svgFiles(outDir).filter((f) => !written.includes(f));
  for (const file of removed) rmSync(`${outDir}/${file}`);
  return { written, removed };
}

if (import.meta.main) {
  const { written, removed } = buildBadges(BADGE_SRC_DIR, BADGE_OUT_DIR);
  console.log(`badges: ${written.length} written${removed.length > 0 ? `, removed ${removed.join(', ')}` : ''}`);
}
