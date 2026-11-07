import { describe, expect, it } from 'vitest';
import { isTransientDriveError } from './drive.ts';

describe('Drive の呼び出しの失敗が、待てば直りうるものか', () => {
  it('keeps waiting on network failures, timeouts, 429 and 5xx', () => {
    expect(isTransientDriveError(new TypeError('fetch failed'))).toBe(true);
    expect(isTransientDriveError(new DOMException('The operation timed out.', 'TimeoutError'))).toBe(true);
    expect(isTransientDriveError(Object.assign(new Error('rate'), { status: 429 }))).toBe(true);
    expect(isTransientDriveError(Object.assign(new Error('server'), { status: 503 }))).toBe(true);
  });

  it('stops on other HTTP errors and on errors that are not about the connection', () => {
    expect(isTransientDriveError(Object.assign(new Error('auth'), { status: 401 }))).toBe(false);
    expect(isTransientDriveError(Object.assign(new Error('gone'), { status: 404 }))).toBe(false);
    expect(isTransientDriveError(new SyntaxError('Unexpected end of JSON input'))).toBe(false);
    expect(isTransientDriveError(null)).toBe(false);
  });
});
