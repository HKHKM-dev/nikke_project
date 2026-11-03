import { describe, expect, it } from 'vitest';
import { parseUiMode } from './uiMode.ts';

describe('parseUiMode', () => {
  it('reads modern and treats anything else as classic', () => {
    expect(parseUiMode('modern')).toBe('modern');
    expect(parseUiMode('classic')).toBe('classic');
    expect(parseUiMode(null)).toBe('classic');
    expect(parseUiMode('')).toBe('classic');
    expect(parseUiMode('unknown')).toBe('classic');
  });
});
