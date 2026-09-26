// Stage 19-A: records/recordings.json から台帳（plan/captures/index.md）の表を作り直す。
// 使い方: npm run records:table（ルート。整形まで行う）
import { readFileSync, writeFileSync } from 'node:fs';
import {
  GENERATED_SECTIONS,
  renderSection,
  replaceGeneratedSection,
  validateRecordings,
} from '../src/records/recordings.ts';
import { LEDGER_PATH, knownRids, loadRecordingsFile, loadRecordsData } from './records-data.ts';

const file = loadRecordingsFile();
const errors = validateRecordings(file, knownRids());
if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}
const { characters } = loadRecordsData(file);
let doc = readFileSync(LEDGER_PATH, 'utf8');
for (const name of GENERATED_SECTIONS) doc = replaceGeneratedSection(doc, name, renderSection(name, file, characters));
writeFileSync(LEDGER_PATH, doc);
console.log(`${file.recordings.length} 件から台帳の表を作り直した`);
