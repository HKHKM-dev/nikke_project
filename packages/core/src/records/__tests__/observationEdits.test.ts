// 観測値の直しと無効（records:new observation --replace・--invalidate。plan/design-workflow-simplification-17.md 3 節）と、下書きの欄の一覧
import { describe, expect, expectTypeOf, it } from 'vitest';
import { observationIdsIn, type ClaimFile } from '../claims.ts';
import { draftShapeErrors, invalidatedObservation, replacedObservation, repointClaim } from '../observationEdits.ts';
import {
  OBSERVATION_DRAFT_FIELDS,
  observationDraftFieldsText,
  type Observation,
  type ObservationDraft,
  type ObservationDraftKey,
} from '../observations/types.ts';

const before: Observation = {
  id: '0101-02',
  recording: '0101',
  kind: 'count',
  use: 'compare',
  value: 3,
  description: '前',
  source: 'V-0099',
  readAt: '2026-10-02',
  scope: { slot: 1, source: 'normal' },
};

describe('draftShapeErrors', () => {
  it('rejects the fields the command fills and drafts without kind or description', () => {
    expect(draftShapeErrors([{ kind: 'count', description: 'x', use: 'record', value: 1 }])).toEqual([]);
    expect(draftShapeErrors([{ ...before }])[0]).toContain('id・recording・source・readAt');
    expect(draftShapeErrors([{ use: 'record', value: 1 } as unknown as ObservationDraft])[0]).toContain(
      'kind と description',
    );
    expect(draftShapeErrors([])[0]).toContain('オブジェクト');
  });
});

describe('replacedObservation・invalidatedObservation', () => {
  it('keeps id, recording, source and readAt and takes the other fields from the draft', () => {
    const after = replacedObservation(before, { kind: 'interval', use: 'record', value: [1, null], description: '後' });
    expect(after).toEqual({
      id: '0101-02',
      recording: '0101',
      kind: 'interval',
      use: 'record',
      value: [1, null],
      description: '後',
      source: 'V-0099',
      readAt: '2026-10-02',
    });
  });

  it('adds invalid with the reason and the date', () => {
    expect(invalidatedObservation(before, '読み違い', '2026-11-18')).toEqual({
      ...before,
      invalid: { reason: '読み違い', date: '2026-11-18' },
    });
  });
});

describe('repointClaim', () => {
  const claim: ClaimFile = {
    id: 'C-0500',
    text: '結論',
    state: '確定',
    topic: '命中率・距離',
    grade: '反復実測',
    basis: '`0101-01`・`0101-02`（注記）。V-0099',
    model: 'モデル',
    replaces: [],
    updated: '2026-10-01',
    runs: [{ recording: '0101', reproduced: '2 回目', observations: ['0101-02'] }],
    minimal: [
      { observations: ['0101-02'], element: 'a', reason: 'r', decided: '2026-10-01' },
      { observations: '*', element: 'b', reason: 'r', decided: '2026-10-01' },
    ],
  };

  it('replaces the old ID in the basis, runs and minimal marks, and sets the date', () => {
    const next = repointClaim(claim, '0101-02', '0101-05', '2026-11-18')!;
    expect(next.basis).toBe('`0101-01`・`0101-05`（注記）。V-0099');
    expect(next.runs![0]!.observations).toEqual(['0101-05']);
    expect(next.minimal![0]!.observations).toEqual(['0101-05']);
    expect(next.minimal![1]!.observations).toBe('*');
    expect(next.updated).toBe('2026-11-18');
  });

  it('drops the old ID from a list when the new one is already in the basis, without dropping a note', () => {
    const plain = { ...claim, basis: '`0101-01`・`0101-02`・`0101-05`。V-0099' };
    expect(repointClaim(plain, '0101-02', '0101-05', '2026-11-18')!.basis).toBe('`0101-01`・`0101-05`。V-0099');
    const noted = { ...claim, basis: '`0101-05`・`0101-02`（注記）。V-0099' };
    expect(repointClaim(noted, '0101-02', '0101-05', '2026-11-18')!.basis).toBe('`0101-05`・`0101-05`（注記）。V-0099');
  });

  it('keeps a range and adds the new ID, and returns undefined for a claim without the old ID', () => {
    const ranged = { ...claim, basis: '`0101-01`〜`0101-03`。V-0099' };
    const next = repointClaim(ranged, '0101-02', '0102-01', '2026-11-18')!;
    expect(observationIdsIn(next.basis)).toEqual(['0101-01', '0101-02', '0101-03', '0102-01']);
    expect(repointClaim(claim, '0109-01', '0102-01', '2026-11-18')).toBeUndefined();
  });

  it('keeps a range whose end is the old ID, and replaces every other mention', () => {
    for (const from of ['0101-01', '0101-03']) {
      const ranged = { ...claim, basis: '`0101-01`〜`0101-03`。V-0099' };
      const next = repointClaim(ranged, from, '0102-01', '2026-11-18')!;
      expect(observationIdsIn(next.basis)).toEqual(['0101-01', '0101-02', '0101-03', '0102-01']);
    }
    const twice = { ...claim, basis: '`0101-02`・`0101-05`。`0101-02`（注記）。V-0099' };
    expect(repointClaim(twice, '0101-02', '0101-05', '2026-11-18')!.basis).toBe('`0101-05`。`0101-05`（注記）。V-0099');
  });
});

describe('OBSERVATION_DRAFT_FIELDS（records:new observation --help の欄の一覧）', () => {
  type RequiredKeys<T> = { [K in keyof T]-?: object extends Pick<T, K> ? never : K }[keyof T];
  type Fields = typeof OBSERVATION_DRAFT_FIELDS;
  type MarkedRequired = { [K in keyof Fields]: Fields[K]['required'] extends true ? K : never }[keyof Fields];

  it('has the same fields as ObservationDraft, with the same required ones (checked by the type check)', () => {
    expectTypeOf<keyof Fields>().toEqualTypeOf<ObservationDraftKey>();
    expectTypeOf<MarkedRequired>().toEqualTypeOf<RequiredKeys<ObservationDraft>>();
    // 実行時にも、型にある必須の欄がそろう
    expect(
      Object.entries(OBSERVATION_DRAFT_FIELDS)
        .filter(([, f]) => f.required)
        .map(([k]) => k)
        .sort(),
    ).toEqual(['description', 'kind', 'use', 'value']);
  });

  it('lists every field in the help text, marking the optional ones with ?', () => {
    const text = observationDraftFieldsText();
    for (const [name, f] of Object.entries(OBSERVATION_DRAFT_FIELDS))
      expect(text).toContain(`  ${name}${f.required ? '' : '?'}: `);
  });
});
