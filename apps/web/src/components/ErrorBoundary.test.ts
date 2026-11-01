import { describe, expect, it } from 'vitest';
import { sameKeys } from './ErrorBoundary.tsx';

describe('sameKeys（ErrorBoundary の描き直し）', () => {
  it('changes when any key changes, so turning detail display off clears the error', () => {
    const shown = { id: 1 };
    expect(sameKeys([shown, true], [shown, true])).toBe(true);
    expect(sameKeys([shown, false], [shown, true])).toBe(false);
    expect(sameKeys([{ id: 1 }, true], [shown, true])).toBe(false);
    expect(sameKeys([shown], [shown, true])).toBe(false);
  });
});
