// Stage 19-A: records/recordings.json から台帳（plan/captures/index.md）の表を作り直す。
// 使い方: npm run records:table（ルート。整形まで行う）
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  GENERATED_SECTIONS,
  renderSection,
  replaceGeneratedSection,
  validateRecordings,
  type RecordingsFile,
} from '../src/records/recordings.ts';
import type { CharacterData } from '../src/types.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const recordingsPath = `${root}records/recordings.json`;
const ledgerPath = `${root}plan/captures/index.md`;

function loadRecordings(): RecordingsFile {
  return JSON.parse(readFileSync(recordingsPath, 'utf8')) as RecordingsFile;
}

function loadCharacters(file: RecordingsFile): Map<number, CharacterData> {
  const map = new Map<number, CharacterData>();
  for (const entry of file.recordings) {
    for (const { rid } of entry.team) {
      if (map.has(rid)) continue;
      try {
        map.set(
          rid,
          JSON.parse(readFileSync(`${root}packages/core/data/characters/${rid}.json`, 'utf8')) as CharacterData,
        );
      } catch {
        // 無い rid は validateRecordings が報告する
      }
    }
  }
  return map;
}

function main(): void {
  const file = loadRecordings();
  const characters = loadCharacters(file);
  const errors = validateRecordings(file, new Set(characters.keys()));
  if (errors.length > 0) {
    console.error(errors.join('\n'));
    process.exit(1);
  }
  let doc = readFileSync(ledgerPath, 'utf8');
  for (const name of GENERATED_SECTIONS)
    doc = replaceGeneratedSection(doc, name, renderSection(name, file, characters));
  writeFileSync(ledgerPath, doc);
  console.log(`${file.recordings.length} 件から台帳の表を作り直した`);
}

main();
