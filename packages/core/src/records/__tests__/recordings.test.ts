// Stage 19-A: 録画の台帳（records/recordings.json）の検証と、台帳（plan/captures/index.md）の表が JSON から生成したものと一致すること。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  LEDGER_PATH,
  knownRids as loadKnownRids,
  loadRecordingsFile,
  loadRecordsData,
} from '../../../scripts/records-data.ts';
import {
  GENERATED_SECTIONS,
  extractGeneratedSection,
  normalizeTable,
  renderSection,
  replaceGeneratedSection,
  validateRecordings,
  type RecordingsFile,
} from '../recordings.ts';

const file = loadRecordingsFile();
const ledger = readFileSync(LEDGER_PATH, 'utf8');
const knownRids = loadKnownRids();
const { characters } = loadRecordsData(file);

describe('records/recordings.json', () => {
  it('passes validation', () => {
    expect(validateRecordings(file, knownRids)).toEqual([]);
  });

  it('keeps the 69 project recordings and the 5 legacy ones', () => {
    expect(file.recordings.filter((e) => !('legacy' in e)).map((e) => e.id)).toEqual(
      Array.from({ length: 69 }, (_, i) => String(i + 1).padStart(3, '0')),
    );
    expect(file.recordings.filter((e) => 'legacy' in e).map((e) => e.id)).toEqual([
      'L-AD',
      'L-AI',
      'L-AN',
      'L-S',
      'L-HC',
    ]);
  });

  it('reports broken entries', () => {
    const broken: RecordingsFile = {
      version: 1,
      recordings: [
        { ...(file.recordings[1] as RecordingsFile['recordings'][number]) },
        {
          ...(file.recordings[0] as RecordingsFile['recordings'][number]),
          team: [
            { slot: 1, rid: 20, name: 'デルタ', controlled: true },
            { slot: 3, rid: 999999, name: '?', controlled: true },
          ],
        },
      ],
    };
    const errors = validateRecordings(broken, knownRids);
    expect(errors).toContainEqual('002: 通し番号が飛んでいる（前は 0）');
    expect(errors).toContainEqual('001: 通し番号が飛んでいる（前は 2）');
    expect(errors).toContainEqual('001: 枠は 1 から枠順に並べる（2 番目が 3）');
    expect(errors).toContainEqual('001: rid 999999 のキャラのデータが無い');
    expect(errors).toContainEqual('001: 操作した枠が 2 つ以上ある');
  });
});

describe('plan/captures/index.md の生成した表', () => {
  it.each(GENERATED_SECTIONS)('%s matches records/recordings.json (npm run records:table)', (name) => {
    expect(normalizeTable(extractGeneratedSection(ledger, name))).toEqual(
      normalizeTable(renderSection(name, file, characters)),
    );
  });

  it('replaces only the marked section', () => {
    const doc = 'a\n<!-- records:legacy:start -->\nold\n<!-- records:legacy:end -->\nb';
    expect(replaceGeneratedSection(doc, 'legacy', '| x |')).toBe(
      'a\n<!-- records:legacy:start -->\n\n| x |\n\n<!-- records:legacy:end -->\nb',
    );
  });
});
