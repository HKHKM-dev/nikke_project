// records:residual -- --base の、予測か判定が変わった行（plan/design-workflow-simplification-15.md 5 節）
import { describe, expect, it } from 'vitest';
import { renderResidualChanges } from '../observations/render.ts';
import type { Residual } from '../observations/run.ts';

const residual = (id: string, predicted: number, status: Residual['status']): Residual =>
  ({
    observation: {
      id,
      recording: '0001',
      kind: 'count',
      use: 'compare',
      value: 10,
      description: '',
      source: 'V-0001',
      compare: { model: 'sim', metric: 'shots', args: {}, setup: {}, tolerance: { abs: 1 } },
    },
    status,
    predicted,
    diff: predicted - 10,
  }) as Residual;

describe('renderResidualChanges', () => {
  it('lists only the rows whose prediction or status changed, and the rows on one side only', () => {
    const lines = renderResidualChanges(
      [residual('0001-01', 10, 'ok'), residual('0001-02', 10, 'ok'), residual('0001-03', 10, 'ok')],
      [residual('0001-01', 10, 'ok'), residual('0001-02', 12, 'outside'), residual('0001-04', 9, 'ok')],
    );
    expect(lines[0]).toBe('比べた観測値 3 件（基の版 3 件）のうち、予測か判定が変わった 3 件（判定が変わった 3 件）');
    const rows = lines.slice(4);
    expect(rows.map((r) => r.split(' | ')[0])).toEqual(['| 0001-02', '| 0001-04', '| 0001-03']);
    expect(rows[0]).toContain('10 → 12');
    expect(rows[1]).toContain('（無い） → 9');
    expect(rows[2]).toContain('10 → （無い）');
  });

  it('prints only the count when nothing changed', () => {
    expect(renderResidualChanges([residual('0001-01', 10, 'ok')], [residual('0001-01', 10, 'ok')])).toEqual([
      '比べた観測値 1 件（基の版 1 件）のうち、予測か判定が変わった 0 件（判定が変わった 0 件）',
    ]);
  });
});
