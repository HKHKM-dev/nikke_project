// 絞り込みの表（data/characters/filter.json。src/filterTable.ts）を、手元のキャラのデータ（index.json に載っている分）から作り直す。
// npm run fetch-data も同じものを書く。キャラのデータを手で直したときや、表の形を変えたときに回す。
//   npm run filter-table
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FILTER_TABLE_FILE, buildFilterTable } from '../src/filterTable.ts';
import { CHARACTER_DATA_DIR, characterDataPath, characterIndexPath } from '../src/load.ts';
import type { CharacterData, CharacterIndex } from '../src/types.ts';
import { formatJson } from './format-json.ts';

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const read = <T>(file: string): T => JSON.parse(readFileSync(path.join(DATA, file), 'utf8')) as T;

const characters = read<CharacterIndex>(characterIndexPath()).characters.map((c) =>
  read<CharacterData>(characterDataPath(c.resourceId)),
);
writeFileSync(
  path.join(DATA, CHARACTER_DATA_DIR, FILTER_TABLE_FILE),
  `${formatJson(buildFilterTable(characters))}\n`,
  'utf8',
);
console.log(`written: ${FILTER_TABLE_FILE}（${characters.length} 体）`);
