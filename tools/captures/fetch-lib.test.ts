import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DriveFile } from './drive.ts';
import { FOLDER_MIME } from './drive.ts';
import { type FetchContext, type FetchDrive, fetchTarget, once } from './fetch-lib.ts';

/** Drive の差し替え: パス → 中身（文字列）。フォルダはパスの途中から作る */
function fakeDrive(files: Record<string, string>): FetchDrive & { downloads: string[] } {
  const downloads: string[] = [];
  const entry = (path: string): DriveFile => {
    if (path in files)
      return {
        id: path,
        name: path.split('/').pop()!,
        mimeType: 'video/mp4',
        size: String(Buffer.byteLength(files[path]!)),
      };
    if (Object.keys(files).some((p) => p.startsWith(`${path}/`)))
      return { id: path, name: path.split('/').pop()!, mimeType: FOLDER_MIME };
    throw new Error(`${path}: Drive に無い`);
  };
  return {
    downloads,
    resolve: async (_root, relPath) => entry(relPath),
    children: async (id) => {
      const names = new Set(
        Object.keys(files)
          .filter((p) => p.startsWith(`${id}/`))
          .map((p) => p.slice(id.length + 1).split('/')[0]!),
      );
      return [...names].map((n) => entry(`${id}/${n}`));
    },
    isFolder: (f) => f.mimeType === FOLDER_MIME,
    download: async (id, out) => {
      downloads.push(id);
      writeFileSync(out, files[id]!);
    },
  };
}

describe('fetchTarget', () => {
  let base: string;
  let lines: string[];
  const context = (drive: FetchContext['drive'], over: Partial<FetchContext> = {}): FetchContext => ({
    drive,
    roots: () => ['root'],
    localBase: () => base,
    recordDir: () => null,
    force: false,
    log: (line) => lines.push(line),
    ...over,
  });
  const put = (rel: string, body: string) => {
    mkdirSync(join(base, rel, '..'), { recursive: true });
    writeFileSync(join(base, rel), body);
  };
  const read = (rel: string) => readFileSync(join(base, rel), 'utf8');

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'fetch-lib-'));
    lines = [];
  });
  afterEach(() => rmSync(base, { recursive: true, force: true }));

  it('keeps a local frame whose size differs from Drive (a remade still not yet pushed)', async () => {
    const drive = fakeDrive({ 'frames/a.jpg': 'old', 'frames/b.jpg': 'bbb' });
    put('frames/a.jpg', 'new-remade');
    await fetchTarget(
      { area: 'captures', relPath: 'frames' },
      'frames/',
      context(async () => drive),
    );
    expect(read('frames/a.jpg')).toBe('new-remade');
    expect(read('frames/b.jpg')).toBe('bbb');
    expect(drive.downloads).toEqual(['frames/b.jpg']);
    expect(lines.some((l) => l.includes(join('frames', 'a.jpg')) && l.includes('手元を残す'))).toBe(true);
  });

  it('redownloads a recording whose size differs from Drive (a partial upload fetched earlier)', async () => {
    const drive = fakeDrive({ 'record/x.mp4': 'complete' });
    put('record/x.mp4', 'part');
    await fetchTarget(
      { area: 'legacy', relPath: 'record/x.mp4' },
      'L-X',
      context(async () => drive),
    );
    expect(read('record/x.mp4')).toBe('complete');
    expect(lines[0]).toContain('落とし直す');
  });

  it('redownloads a non-frame file whose size differs from Drive', async () => {
    const drive = fakeDrive({ 'reference/tip.png': 'complete' });
    put('reference/tip.png', 'part');
    await fetchTarget(
      { area: 'captures', relPath: 'reference' },
      'reference',
      context(async () => drive),
    );
    expect(read('reference/tip.png')).toBe('complete');
  });

  it('redownloads a file whose sha256 differs from the ledger even when the size matches', async () => {
    const drive = fakeDrive({ 'r/x.mp4': 'complete' });
    put('r/x.mp4', 'abcdefgh');
    const expected = createHash('sha256').update('complete').digest('hex').slice(0, 12);
    await fetchTarget(
      { area: 'captures', relPath: 'r/x.mp4', sha256: expected },
      '0001',
      context(async () => drive),
    );
    expect(read('r/x.mp4')).toBe('complete');
    expect(lines[0]).toContain('sha256 が台帳と違う');
  });

  it('overwrites a differing frame with --force', async () => {
    const drive = fakeDrive({ 'frames/a.jpg': 'old' });
    put('frames/a.jpg', 'new-remade');
    await fetchTarget(
      { area: 'captures', relPath: 'frames/a.jpg' },
      'frames/a.jpg',
      context(async () => drive, { force: true }),
    );
    expect(read('frames/a.jpg')).toBe('old');
  });

  it('answers drive:<path> from the local record folder without connecting to Drive', async () => {
    const recordDir = join(base, 'rec');
    mkdirSync(recordDir);
    writeFileSync(join(recordDir, 'y.mp4'), 'v');
    const connect = vi.fn(async () => {
      throw new Error('NIKKE_DRIVE_SA_KEY がありません');
    });
    await fetchTarget(
      { area: 'record', relPath: 'y.mp4' },
      'drive:y.mp4',
      context(connect, { recordDir: () => recordDir }),
    );
    expect(connect).not.toHaveBeenCalled();
    expect(lines).toEqual([`あり  ${join(recordDir, 'y.mp4')}`]);
  });

  it('connects to Drive only once across targets', async () => {
    const drive = fakeDrive({ 'a.mp4': 'a', 'b.mp4': 'b' });
    const connect = vi.fn(async () => drive);
    const ctx = context(once(connect));
    await fetchTarget({ area: 'captures', relPath: 'a.mp4' }, 'a.mp4', ctx);
    await fetchTarget({ area: 'captures', relPath: 'b.mp4' }, 'b.mp4', ctx);
    expect(connect).toHaveBeenCalledTimes(1);
  });
});
