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

if (import.meta.main) {
  const sources = svgFiles(BADGE_SRC_DIR);
  for (const file of sources) {
    writeFileSync(`${BADGE_OUT_DIR}/${file}`, optimizeBadge(readFileSync(`${BADGE_SRC_DIR}/${file}`, 'utf8')));
  }
  // 元の無い書き出しを消す（元を消したときや名前を変えたとき）
  const stale = svgFiles(BADGE_OUT_DIR).filter((f) => !sources.includes(f));
  for (const file of stale) rmSync(`${BADGE_OUT_DIR}/${file}`);
  console.log(`badges: ${sources.length} written${stale.length > 0 ? `, removed ${stale.join(', ')}` : ''}`);
}
