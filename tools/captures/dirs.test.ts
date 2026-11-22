import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchedRecord } from './dirs.ts';

describe('下見で落とした録画', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'record-fetch-'));
    vi.stubEnv('NIKKE_RECORD_FETCH_DIR', root);
    mkdirSync(join(root, 'sub'));
    writeFileSync(join(root, 'sub', 'a.mp4'), 'abcd');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });

  it('uses the file only when its size matches the Drive copy', () => {
    expect(fetchedRecord('sub/a.mp4', '4')).toBe(join(root, 'sub', 'a.mp4'));
    // 途中までの版・Drive の大きさが分からないもの・無いもの・フォルダは使わない
    expect(fetchedRecord('sub/a.mp4', '5')).toBeNull();
    expect(fetchedRecord('sub/a.mp4', undefined)).toBeNull();
    expect(fetchedRecord('sub/b.mp4', '4')).toBeNull();
    expect(fetchedRecord('sub', '4')).toBeNull();
  });
});
