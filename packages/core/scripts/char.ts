// キャラのデータを詰めて出す（スキルを定義するときの下調べ。plan/design-workflow-simplification-14.md 6 節）。
//   npm run char -- <id>[,<id>...]
// 通常攻撃・バースト・スキルの説明文（値を差し込む）と、定義の有無・効果の分類が重なる定義済みのキャラを出す。中身は
// packages/core/src/skills/charSummary.ts。
import { renderCharSummary, similarDefined } from '../src/skills/charSummary.ts';
import { classifyCharacters } from '../src/skills/catalog.ts';
import { loadCatalogInput } from './records-data.ts';

const ids = process.argv
  .slice(2)
  .flatMap((a) => a.split(','))
  .map((a) => a.trim())
  .filter((a) => a !== '');
if (ids.length === 0) {
  console.error('usage: npm run char -- <id>[,<id>...]');
  process.exit(1);
}
const { characters, defined } = loadCatalogInput();
const byRid = new Map(characters.map((c) => [c.resourceId, c]));
const missing = ids.filter((id) => !byRid.has(Number(id)));
if (missing.length > 0) {
  console.error(`キャラのデータが無い: ${missing.join('・')}`);
  process.exit(1);
}
const { effects } = classifyCharacters(characters, defined);
console.log(
  ids
    .map(Number)
    .map((rid) =>
      renderCharSummary(byRid.get(rid)!, { defined: defined.has(rid), similar: similarDefined(rid, effects) }),
    )
    .join('\n\n'),
);
