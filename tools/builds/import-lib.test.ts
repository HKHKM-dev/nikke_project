import { describe, expect, it } from 'vitest';
import {
  jstDate,
  parseSnapshotAnswer,
  previousName,
  snapshotForRecording,
  snapshotName,
  sortNames,
  treasureForSlots,
} from './import-lib.ts';

describe('jstDate', () => {
  it('uses the Japanese date', () => {
    expect(jstDate('2026-10-24T04:14:41.567Z')).toBe('2026-10-24');
    expect(jstDate('2026-10-28T16:30:00.000Z')).toBe('2026-10-29');
    expect(() => jstDate('x')).toThrow();
  });
});

describe('snapshotName', () => {
  it('reuses the name of the same fetch and numbers another fetch on the same day', () => {
    const at = '2026-10-24T04:14:41.567Z';
    expect(snapshotName(at, new Map())).toBe('2026-10-24');
    expect(snapshotName(at, new Map([['2026-10-24', at]]))).toBe('2026-10-24');
    const other = new Map([['2026-10-24', '2026-10-24T01:00:00.000Z']]);
    expect(snapshotName(at, other)).toBe('2026-10-24-2');
    other.set('2026-10-24-2', '2026-10-24T02:00:00.000Z');
    expect(snapshotName(at, other)).toBe('2026-10-24-3');
  });
});

describe('sortNames and previousName', () => {
  it('orders by date, then by the branch number', () => {
    expect(sortNames(['2026-10-24-10', '2026-10-24-2', '2026-10-06', '2026-10-24'])).toEqual([
      '2026-10-06',
      '2026-10-24',
      '2026-10-24-2',
      '2026-10-24-10',
    ]);
    expect(previousName(['2026-10-06', '2026-10-24'], '2026-10-24-2')).toBe('2026-10-24');
    expect(previousName(['2026-10-06', '2026-10-24'], '2026-10-06')).toBeNull();
    expect(previousName([], '2026-10-06')).toBeNull();
  });
});

describe('snapshotForRecording', () => {
  const names = ['2026-10-24-2', '2026-10-06', '2026-10-24'];
  it('defaults to the latest snapshot on or before the recording date', () => {
    expect(snapshotForRecording(names, '2026-10-24')).toEqual({ name: '2026-10-24-2', notice: null });
  });
  it('notices that the recording date has no snapshot', () => {
    expect(snapshotForRecording(names, '2026-10-29')).toEqual({
      name: '2026-10-24-2',
      notice: '撮った日（2026-10-29）の育成が無い（最新は 2026-10-24-2）',
    });
    expect(snapshotForRecording(names, '2026-10-10')).toEqual({
      name: '2026-10-06',
      notice: '撮った日（2026-10-10）の育成が無い（最新は 2026-10-06）',
    });
    expect(snapshotForRecording(names, '2026-10-01')).toEqual({
      name: null,
      notice: '撮った日（2026-10-01）の育成が無い（その日以前のスナップショットが無い）',
    });
    expect(snapshotForRecording([], '2026-10-24').name).toBeNull();
  });
});

describe('parseSnapshotAnswer', () => {
  it('takes the default for an empty answer, null for -, and only snapshot names otherwise', () => {
    expect(parseSnapshotAnswer('', '2026-10-24')).toBe('2026-10-24');
    expect(parseSnapshotAnswer('  ', null)).toBeNull();
    expect(parseSnapshotAnswer('-', '2026-10-24')).toBeNull();
    expect(parseSnapshotAnswer(' 2026-10-06-2 ', '2026-10-24')).toBe('2026-10-06-2');
    expect(parseSnapshotAnswer('10-06', '2026-10-24')).toBeUndefined();
  });
});

describe('treasureForSlots', () => {
  const slots = [
    { slot: 1, rid: 10, name: 'A' },
    { slot: 2, rid: 20, name: 'B' },
    { slot: 3, rid: 30, name: 'C' },
    { slot: 4, rid: 40, name: 'D' },
  ];
  const snapshot = {
    name: '2026-10-29',
    characters: {
      10: { treasure: { level: 2, phase: 3 as const } },
      20: { treasure: null },
      30: { treasure: { level: 0, phase: null } },
    },
  };

  it('fills the phase from the snapshot, leaves the slots without a treasure on the base version, and names the rest', () => {
    const got = treasureForSlots(slots, new Map(), snapshot);
    expect([...got.phases]).toEqual([[1, 3]]);
    expect(got.notices).toEqual([
      '枠 1（A）: 宝物の段階 3（スナップショット 2026-10-29）',
      '枠 2（B）: 宝物なし（基礎版）（スナップショット 2026-10-29）',
    ]);
    expect(got.missing).toEqual([
      '枠 3（C）: スナップショット 2026-10-29 の宝物が Lv 0（段階が未確定）',
      '枠 4（D）: スナップショット 2026-10-29 にキャラが無い',
    ]);
  });

  it('takes --treasure first (0 is no treasure) and tells when it differs from the snapshot', () => {
    const got = treasureForSlots(
      slots,
      new Map([
        [1, 2],
        [3, 1],
        [4, 0],
      ]),
      snapshot,
    );
    expect([...got.phases]).toEqual([
      [1, 2],
      [3, 1],
    ]);
    expect(got.notices[0]).toBe('枠 1（A）: --treasure は段階 2、スナップショット 2026-10-29 は段階 3');
    expect(got.missing).toEqual([]);
  });

  it('names every slot when there is no snapshot', () => {
    expect(treasureForSlots(slots.slice(0, 1), new Map(), null).missing).toEqual([
      '枠 1（A）: 育成のスナップショットが無い',
    ]);
  });
});
