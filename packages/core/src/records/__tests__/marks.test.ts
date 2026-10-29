// 最小構成の印の手入れ（plan/design-workflow-simplification-5.md 1 節）
import { describe, expect, it } from 'vitest';
import {
  loadClaims,
  loadObservations,
  loadRecordingsFile,
  loadRecordsData,
  recordingMap,
} from '../../../scripts/records-data.ts';
import type { SkillDefinition, SkillNote } from '../../skills/types.ts';
import { validateMinimalFields, type Claim, type ClaimFile, type MinimalMark } from '../claims.ts';
import { danglingMarks, noteIndexMap, renumberMarks } from '../marks.ts';

const note = (ja: string): SkillNote =>
  ({ ja, en: ja, kind: 'unimplemented', effect: { kind: 'unknown' } }) as SkillNote;
const def = (burstNotes: string[]): SkillDefinition =>
  ({
    formatVersion: 1,
    resourceId: 1,
    checkedAt: '2026-10-29',
    skills: {
      skill1: { effects: [], notes: [note('s1')] },
      skill2: { effects: [] },
      burst: { effects: [], notes: burstNotes.map(note) },
    },
  }) as unknown as SkillDefinition;
const mark = (element: string | string[], reason = 'r'): MinimalMark => ({
  observations: '*',
  element,
  reason,
  decided: '2026-10-01',
});
const claim = (minimal: MinimalMark[]): ClaimFile =>
  ({
    id: 'C-0001',
    text: 't',
    state: '確定',
    topic: '射撃（間隔・リロード・チャージ）',
    basis: 'b',
    minimal,
  }) as ClaimFile;

const asClaim = (c: ClaimFile): Claim => ({ ...c, observations: [] });

describe('noteIndexMap', () => {
  it('maps notes by their text, preferring the same index', () => {
    expect(noteIndexMap([note('a'), note('b'), note('c')], [note('a'), note('c')])).toEqual([0, undefined, 1]);
    expect(noteIndexMap([note('a'), note('a')], [note('a'), note('a')])).toEqual([0, 1]);
    expect(noteIndexMap([note('a')], [note('x'), note('a')])).toEqual([1]);
  });
});

describe('renumberMarks', () => {
  // バーストの notes の b が効果になって消え、c・d が 1 つずつ前に詰まった
  const defs = new Map([['キャラ', { before: def(['a', 'b', 'c', 'd']), after: def(['a', 'c', 'd']) }]]);

  it('renumbers only the marks that are unchanged from the base version', () => {
    const base = claim([mark('キャラ burst.notes[2]'), mark(['キャラ burst.notes[0]', 'キャラ burst.notes[3]'], 'r2')]);
    // ブランチで足した印は、もう今の番号で書いてある
    const file = claim([...base.minimal!, mark('キャラ burst.notes[2]', 'new')]);
    const r = renumberMarks(file, base, defs);
    expect(r.file.minimal!.map((m) => m.element)).toEqual([
      'キャラ burst.notes[1]',
      ['キャラ burst.notes[0]', 'キャラ burst.notes[2]'],
      'キャラ burst.notes[2]',
    ]);
    expect(r.changes).toHaveLength(2);
    expect(r.problems).toEqual([]);
    // 2 回回しても同じ（書き替えた印は分かれ目の版と違うので、もう触らない）
    expect(renumberMarks(r.file, base, defs).changes).toEqual([]);
  });

  it('reports a mark whose note has no counterpart, and leaves other characters and new claims alone', () => {
    const base = claim([mark('キャラ burst.notes[1]'), mark('ほか burst.notes[1]'), mark('キャラ skill1.notes[0]')]);
    const r = renumberMarks(base, base, defs);
    expect(r.changes).toEqual([]);
    expect(r.problems).toHaveLength(1);
    expect(r.problems[0]).toContain('「b」');
    expect(renumberMarks(base, undefined, defs).problems).toEqual([]);
  });
});

describe('印の形', () => {
  it('accepts a list of elements, but not an empty or duplicated one', () => {
    expect(validateMinimalFields(asClaim(claim([mark(['キャラ burst.notes[0]', 'キャラ burst.notes[1]'])])))).toEqual(
      [],
    );
    expect(validateMinimalFields(asClaim(claim([mark([])]))).join()).toContain('element');
    expect(validateMinimalFields(asClaim(claim([mark(['x', 'x'])]))).join()).toContain('2 回');
  });
});

describe('行き先の無い印（実データ）', () => {
  it('has no marks pointing to elements missing from the recordings (npm run records:check)', () => {
    const file = loadRecordingsFile();
    const recordings = recordingMap(file);
    const data = loadRecordsData(file);
    const claims = loadClaims();
    const ctx = { recordings, characters: data.characters, skills: data.skills, enemies: data.enemies, claims };
    expect(danglingMarks(claims, loadObservations(), ctx)).toEqual([]);
  });
});
