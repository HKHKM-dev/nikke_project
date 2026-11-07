// 戦闘力の表（data/characters/combat.json。src/combatTable.ts）を、手元のキャラのデータ（index.json に載っている分）から作り直す。
// npm run fetch-data も同じものを書く。キャラのデータを手で直したときや、表の形を変えたときに回す。
//   npm run combat-table
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMBAT_TABLE_FILE, buildCombatPowerTable } from '../src/combatTable.ts';
import { CHARACTER_DATA_DIR, characterDataPath, characterIndexPath } from '../src/load.ts';
import type { CharacterData, CharacterIndex } from '../src/types.ts';
import { formatJson } from './format-json.ts';

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const read = <T>(file: string): T => JSON.parse(readFileSync(path.join(DATA, file), 'utf8')) as T;

const characters = read<CharacterIndex>(characterIndexPath()).characters.map((c) =>
  read<CharacterData>(characterDataPath(c.resourceId)),
);
writeFileSync(
  path.join(DATA, CHARACTER_DATA_DIR, COMBAT_TABLE_FILE),
  `${formatJson(buildCombatPowerTable(characters))}\n`,
  'utf8',
);
console.log(`written: ${COMBAT_TABLE_FILE}（${characters.length} 体）`);
