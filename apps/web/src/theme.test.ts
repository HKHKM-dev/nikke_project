// 画面のテーマの保存値の読み方（theme.ts）
import { describe, expect, it } from 'vitest';
import { parseTheme } from './theme.ts';

describe('parseTheme', () => {
  it('reads light and dark, and treats anything else as system', () => {
    expect(parseTheme('light')).toBe('light');
    expect(parseTheme('dark')).toBe('dark');
    expect(parseTheme('system')).toBe('system');
    expect(parseTheme(null)).toBe('system');
    expect(parseTheme('blue')).toBe('system');
  });
});
