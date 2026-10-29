import { describe, expect, it } from 'vitest';
import { jstDate, previousName, snapshotName, sortNames } from './import-lib.ts';

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
