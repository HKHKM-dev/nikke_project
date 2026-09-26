// Stage 19-A: 録画の台帳の検証と、台帳の表が録画の JSON から生成したものと一致すること。
// Stage 20-A: 件数や ID の一覧は直書きしない。Stage 20-C: 録画は records/recordings/ に 1 本 1 ファイル、
// 表は plan/captures/recordings.md に丸ごと生成する（plan/design-stage20.md 3.5・3.6 節）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  RECORDINGS_DOC_PATH,
  knownRids as loadKnownRids,
  loadRecordingsFile,
  loadRecordsData,
  misplacedRecordings,
} from '../../../scripts/records-data.ts';
import {
  isLegacy,
  normalizeGeneratedDoc,
  renderRecordingsDoc,
  replaceGeneratedSection,
  sortRecordings,
  validateRecordings,
  type ProjectRecording,
  type RecordingEntry,
} from '../recordings.ts';

const file = loadRecordingsFile();
const knownRids = loadKnownRids();
const { characters } = loadRecordsData(file);
const first = file.recordings[0] as ProjectRecording;
const numbered = (id: string): ProjectRecording => ({
  ...first,
  id,
  file: first.file.replace(/^(\d{8})-\d+_/, `$1-${id}_`),
});

describe('records/recordings', () => {
  it('passes validation and each file holds the recording of its name', () => {
    expect(misplacedRecordings()).toEqual([]);
    expect(validateRecordings(file, knownRids)).toEqual([]);
  });

  it('allows gaps and more than 3 digits, but not duplicates (Stage 20-A)', () => {
    expect(validateRecordings({ recordings: [first, numbered('003'), numbered('1000')] }, knownRids)).toEqual([]);
    expect(validateRecordings({ recordings: [numbered('12')] }, knownRids)).toContainEqual('12: id は 3 桁以上の数字');
    expect(validateRecordings({ recordings: [first, numbered('001')] }, knownRids)).toContainEqual(
      '001: id が重複している',
    );
  });

  it('sorts the project recordings by number and then the legacy ones by id (Stage 20-C)', () => {
    const legacy = file.recordings.filter(isLegacy);
    const shuffled: RecordingEntry[] = [numbered('1000'), ...[...legacy].reverse(), numbered('003'), first];
    expect(sortRecordings(shuffled).map((e) => e.id)).toEqual([
      first.id,
      '003',
      '1000',
      ...legacy.map((e) => e.id).sort((a, b) => a.localeCompare(b)),
    ]);
  });

  it('reports broken entries', () => {
    const errors = validateRecordings(
      {
        recordings: [
          { ...(file.recordings[1] as RecordingEntry) },
          {
            ...first,
            team: [
              { slot: 1, rid: 20, name: 'デルタ', controlled: true },
              { slot: 3, rid: 999999, name: '?', controlled: true },
            ],
          },
        ],
      },
      knownRids,
    );
    expect(errors.filter((e) => e.startsWith('002:'))).toEqual([]);
    expect(errors).toContainEqual('001: 枠は 1 から枠順に並べる（2 番目が 3）');
    expect(errors).toContainEqual('001: rid 999999 のキャラのデータが無い');
    expect(errors).toContainEqual('001: 操作した枠が 2 つ以上ある');
  });
});

describe('plan/captures/recordings.md', () => {
  it('matches records/recordings (npm run records:table)', () => {
    expect(normalizeGeneratedDoc(readFileSync(RECORDINGS_DOC_PATH, 'utf8'))).toEqual(
      normalizeGeneratedDoc(renderRecordingsDoc(file, characters)),
    );
  });

  it('replaces only the marked section', () => {
    const doc = 'a\n<!-- records:legacy:start -->\nold\n<!-- records:legacy:end -->\nb';
    expect(replaceGeneratedSection(doc, 'legacy', '| x |')).toBe(
      'a\n<!-- records:legacy:start -->\n\n| x |\n\n<!-- records:legacy:end -->\nb',
    );
  });
});
