import { describe, expect, it } from 'vitest';
import { formatDamage } from './format.ts';

describe('formatDamage', () => {
  it('shows a dash when there is no value or it is exactly zero', () => {
    expect(formatDamage(null)).toBe('—');
    expect(formatDamage(0)).toBe('—');
  });

  it('keeps a value that rounds to zero as 0', () => {
    expect(formatDamage(0.001)).toBe('0');
  });

  it('shows the compact form', () => {
    expect(formatDamage(11790600)).toBe('1179.06万');
  });
});
