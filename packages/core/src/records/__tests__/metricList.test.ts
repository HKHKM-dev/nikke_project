// 指標の一覧（records:model --list。plan/design-workflow-simplification-17.md 5 節）
import { describe, expect, it } from 'vitest';
import { METRICS, metricLine, missingMetricArgs } from '../observations/metrics/index.ts';

describe('METRICS の説明と省略できる引数', () => {
  it('every metric has a one-line description, and its optional args do not repeat the required ones', () => {
    for (const [name, metric] of Object.entries(METRICS)) {
      expect(metric.description.trim(), name).not.toBe('');
      expect(metric.description, name).not.toMatch(/\n/);
      for (const o of metric.optional ?? []) expect(metric.args, `${name}: ${o}`).not.toContain(o);
    }
  });
});

describe('metricLine', () => {
  it('lists the required args, the optional args and the description', () => {
    expect(metricLine('x', { description: '説明', args: ['slot', 'n'], optional: ['skip'], sim: () => 0 })).toBe(
      'x  要る: slot, n  任意: skip  — 説明',
    );
    expect(metricLine('y', { description: '説明', args: [], sim: () => 0 })).toBe('y  要る: なし  — 説明');
  });
});

describe('missingMetricArgs', () => {
  it('returns the required args that are not given (burstActivationSlots needs n)', () => {
    expect(missingMetricArgs(METRICS.burstActivationSlots!, {})).toEqual(['n']);
    expect(missingMetricArgs(METRICS.burstActivationSlots!, { n: 3 })).toEqual([]);
  });
});
