// キャラのデータを詰めて出す（スキルを定義するときの下調べ。plan/design-workflow-simplification-14.md 6 節・-15.md 9 節）。
//   npm run char -- <id か名前（の一部）>[,...] [--en]
// 通常攻撃（会心率を含む）・バースト・スキルの説明文（値を差し込み、{description_value_NN} の番号を添える）と、定義の有無・効果の
// 分類が重なる定義済みのキャラを出す。--en で説明文を英語にする。名前は日本語・英語の名前で引き、名前がぴったり合うキャラが
// あればそれだけ、無ければ名前を含むキャラを全部出す。中身は packages/core/src/skills/charSummary.ts。
import { renderCharSummary, similarDefined } from '../src/skills/charSummary.ts';
import { classifyCharacters } from '../src/skills/catalog.ts';
import type { CharacterData } from '../src/types.ts';
import { loadCatalogInput, splitIds } from './records-data.ts';
import { cliArgs, fail } from './cli.ts';

const { values, positionals } = cliArgs(import.meta.url, {
  allowPositionals: true,
  options: { en: { type: 'boolean', default: false } },
});
const keys = positionals.flatMap(splitIds);
if (keys.length === 0) {
  fail();
}
const { characters, defined } = loadCatalogInput();
const byRid = new Map(characters.map((c) => [c.resourceId, c]));

/** id か名前で引く（名前がぴったり合うキャラがあればそれだけ、無ければ名前を含むキャラ全部） */
function lookup(key: string): CharacterData[] {
  if (/^\d+$/.test(key)) {
    const c = byRid.get(Number(key));
    return c === undefined ? [] : [c];
  }
  const k = key.toLowerCase();
  const names = (c: CharacterData) => [c.name.ja.toLowerCase(), c.name.en.toLowerCase()];
  const exact = characters.filter((c) => names(c).includes(k));
  return exact.length > 0 ? exact : characters.filter((c) => names(c).some((n) => n.includes(k)));
}

const found = keys.map((key) => ({ key, hits: lookup(key) }));
const missing = found.filter((f) => f.hits.length === 0).map((f) => f.key);
if (missing.length > 0) {
  console.error(`キャラのデータが無い: ${missing.join('・')}`);
  process.exit(1);
}
const picked = [...new Set(found.flatMap((f) => f.hits))];
const { effects } = classifyCharacters(characters, defined);
console.log(
  picked
    .map((c) =>
      renderCharSummary(c, {
        defined: defined.has(c.resourceId),
        similar: similarDefined(c.resourceId, effects),
        locale: values.en ? 'en' : 'ja',
      }),
    )
    .join('\n\n'),
);
