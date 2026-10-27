// スキルの効果の分類の一覧（plan/skill-catalog.md。plan/design-skill-catalog.md の論点 2）を、全キャラの説明文から作り直す
// （前の中身は読まない）。データを取り込み直した（npm run fetch-data）後に回す。最新かは npm test が確かめる。
// 使い方: npm run records:check が回す（一覧は prettier の対象外なので整形しない）
import { writeFileSync } from 'node:fs';
import { classifyCharacters } from '../src/skills/catalog.ts';
import { renderSkillCatalog } from '../src/skills/catalogDoc.ts';
import { SKILL_CATALOG_PATH, loadCatalogInput } from './records-data.ts';

const { characters, defined } = loadCatalogInput();
const { lines, effects } = classifyCharacters(characters, defined);
writeFileSync(SKILL_CATALOG_PATH, renderSkillCatalog(lines, effects));
console.log(`キャラ ${characters.length}・■ の行 ${lines.length}・効果の句 ${effects.length}`);
