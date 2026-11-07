// 戦闘力の表（data/characters/combat.json。src/combatTable.ts）を、手元のキャラのデータ（index.json に載っている分）から作り直す。
// npm run fetch-data も同じものを書く。キャラのデータを手で直したときや、表の形を変えたときに回す。
//   node scripts/combat-table.ts
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMBAT_TABLE_FILE, buildCombatPowerTable } from '../src/combatTable.ts';
import type { CharacterData, CharacterIndex } from '../src/types.ts';
import { formatJson } from './format-json.ts';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'characters');
const read = <T>(name: string): T => JSON.parse(readFileSync(path.join(DIR, name), 'utf8')) as T;

const characters = read<CharacterIndex>('index.json').characters.map((c) =>
  read<CharacterData>(`${c.resourceId}.json`),
);
writeFileSync(path.join(DIR, COMBAT_TABLE_FILE), `${formatJson(buildCombatPowerTable(characters))}\n`, 'utf8');
console.log(`written: ${COMBAT_TABLE_FILE}（${characters.length} 体）`);
