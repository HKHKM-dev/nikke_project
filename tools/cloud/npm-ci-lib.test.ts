// クラウドのセッションの始めに npm ci を回すかの決まりごと（plan/design-workflow-simplification.md 5 節）。npm は呼ばない。
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ensureInstalled, lockHash, MARKER } from './npm-ci-lib.ts';

let repo: string;
let calls: number;
const ok = () => {
  calls++;
  mkdirSync(join(repo, 'node_modules'), { recursive: true });
  return true;
};
const fail = () => {
  calls++;
  return false;
};

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'npm-ci-'));
  calls = 0;
  writeFileSync(join(repo, 'package-lock.json'), '{"lockfileVersion":3}');
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe('cloud/npm-ci-lib', () => {
  it('node_modules が無ければ回し、控えに lockfile の sha256 を書く', () => {
    expect(ensureInstalled(repo, ok)).toBe('installed');
    expect(calls).toBe(1);
    expect(readFileSync(join(repo, MARKER), 'utf8').trim()).toBe(lockHash(repo));
  });

  it('控えが lockfile と同じなら回さない', () => {
    ensureInstalled(repo, ok);
    expect(ensureInstalled(repo, ok)).toBe('skipped');
    expect(calls).toBe(1);
  });

  it('lockfile が変わったら回し直す', () => {
    ensureInstalled(repo, ok);
    writeFileSync(join(repo, 'package-lock.json'), '{"lockfileVersion":3,"packages":{}}');
    expect(ensureInstalled(repo, ok)).toBe('installed');
    expect(calls).toBe(2);
  });

  it('失敗したら古い控えを消し、次の始めに回し直す', () => {
    ensureInstalled(repo, ok);
    writeFileSync(join(repo, 'package-lock.json'), '{"lockfileVersion":3,"packages":{}}');
    expect(ensureInstalled(repo, fail)).toBe('failed');
    expect(existsSync(join(repo, MARKER))).toBe(false);
    expect(ensureInstalled(repo, ok)).toBe('installed');
    expect(calls).toBe(3);
  });

  it('lockfile が無ければ何もしない', () => {
    rmSync(join(repo, 'package-lock.json'));
    expect(ensureInstalled(repo, ok)).toBe('no-lockfile');
    expect(calls).toBe(0);
  });
});
