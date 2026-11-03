import { describe, expect, it } from 'vitest';
import { formatDamage } from './format.ts';

describe('formatDamage', () => {
  it('shows a dash when there is no value or it is exactly zero', () => {
    expect(formatDamage(null)).toEqual({ text: '—', title: undefined });
    expect(formatDamage(0)).toEqual({ text: '—', title: undefined });
  });

  it('keeps a value that rounds to zero as 0', () => {
    expect(formatDamage(0.001).text).toBe('0');
  });

  it('shows the compact form with the full digits as the title', () => {
    expect(formatDamage(11790600)).toEqual({ text: '1179.06万', title: '11,790,600' });
  });
});
