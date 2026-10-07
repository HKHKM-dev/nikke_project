// Stage 19-A: 録画の台帳の表を作り直す。
// Stage 20-C: records/recordings/<録画 id>.json から plan/captures/recordings.md を丸ごと書き出す（前の中身は読まない）。
// 使い方: npm run records:table（ルート。整形まで行う）
import { writeFileSync } from 'node:fs';
import { renderRecordingsDoc, validateRecordings } from '../src/records/recordings.ts';
import {
  RECORDINGS_DOC_PATH,
  knownRids,
  loadRecordingsFile,
  loadRecordsData,
  misplacedRecordings,
} from './records-data.ts';

const file = loadRecordingsFile();
const errors = [...misplacedRecordings(), ...validateRecordings(file, knownRids())];
if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}
const { characters } = loadRecordsData(file);
writeFileSync(RECORDINGS_DOC_PATH, renderRecordingsDoc(file, characters));
console.log(`${file.recordings.length} 件から録画の一覧を作り直した`);
