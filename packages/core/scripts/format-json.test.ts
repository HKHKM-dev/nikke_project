import { describe, expect, it } from 'vitest';
import { formatJson } from './format-json.ts';

describe('formatJson', () => {
  it('keeps primitive arrays on one line and objects multi-line', () => {
    const text = formatJson({ a: [1, 2, 3], b: { c: null, d: 'x' }, e: [] });
    expect(text).toBe('{\n  "a": [1, 2, 3],\n  "b": {\n    "c": null,\n    "d": "x"\n  },\n  "e": []\n}');
    expect(JSON.parse(text)).toEqual({ a: [1, 2, 3], b: { c: null, d: 'x' }, e: [] });
  });

  it('round-trips nested arrays of objects', () => {
    const value = { list: [{ x: 1 }, { y: [true, false] }] };
    expect(JSON.parse(formatJson(value))).toEqual(value);
  });
});
