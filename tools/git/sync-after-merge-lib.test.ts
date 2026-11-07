// 中身が main に入った origin のブランチの見分け（plan/design-workflow-simplification-10.md 2 節）。木の比べは一時のリポジトリで git を呼ぶ。
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  bringsNothing,
  parseRemoteBranches,
  PRUNE_AGE_MS,
  prunableBranches,
  type GitRun,
} from './sync-after-merge-lib.ts';

describe('parseRemoteBranches', () => {
  it('reads the branches of claude/ and antigrav/ with their commit time, and skips the others', () => {
    expect(parseRemoteBranches('HEAD\t100\nmain\t200\nclaude/a\t300\nantigrav/b\t400\nfeature/c\t500\n')).toEqual([
      { name: 'claude/a', committedAt: 300_000 },
      { name: 'antigrav/b', committedAt: 400_000 },
    ]);
  });
});

describe('prunableBranches', () => {
  const now = 10 * PRUNE_AGE_MS;
  const old = now - PRUNE_AGE_MS;
  const branches = [
    { name: 'claude/old-merged', committedAt: old },
    { name: 'claude/new-merged', committedAt: now - PRUNE_AGE_MS + 1 },
    { name: 'claude/old-open', committedAt: old },
    { name: 'claude/old-work', committedAt: old },
  ];

  it('takes old branches without an open PR whose content is all in main, and compares trees only for those', () => {
    const asked: string[] = [];
    const nothingNew = (name: string) => {
      asked.push(name);
      return name !== 'claude/old-work';
    };
    expect(prunableBranches(branches, new Set(['claude/old-open']), now, nothingNew)).toEqual(['claude/old-merged']);
    expect(asked).toEqual(['claude/old-merged', 'claude/old-work']);
  });
});

describe('bringsNothing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sync-after-merge-'));
  const git: GitRun = (args) => {
    try {
      return execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      return null;
    }
  };
  const commit = (file: string, text: string, message: string) => {
    writeFileSync(join(dir, file), text);
    git(['add', file]);
    git(['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '-m', message]);
  };

  git(['init', '--quiet', '-b', 'main']);
  commit('a.txt', 'a\n', 'base');
  git(['branch', 'ancestor']);
  // スカッシュマージされたブランチ: main には同じ中身の別のコミットと、その後の変更がある
  git(['checkout', '--quiet', '-b', 'squashed']);
  commit('b.txt', 'b\n', 'work 1');
  commit('b.txt', 'b2\n', 'work 2');
  git(['checkout', '--quiet', 'main']);
  commit('b.txt', 'b2\n', 'squash');
  commit('c.txt', 'c\n', 'later');
  // main に入っていない変更があるブランチ
  git(['checkout', '--quiet', '-b', 'work', 'ancestor']);
  commit('d.txt', 'd\n', 'work');
  // 後で直された形で main に入ったブランチ（合わせると衝突する）
  git(['checkout', '--quiet', '-b', 'edited', 'ancestor']);
  commit('c.txt', 'c-old\n', 'old');
  git(['checkout', '--quiet', 'main']);

  it('is true for a branch merged by squash and for an ancestor of main', () => {
    expect(bringsNothing(git, 'main', 'squashed')).toBe(true);
    expect(bringsNothing(git, 'main', 'ancestor')).toBe(true);
  });

  it('is false for a branch with a change main does not have, or one that conflicts with main', () => {
    expect(bringsNothing(git, 'main', 'work')).toBe(false);
    expect(bringsNothing(git, 'main', 'edited')).toBe(false);
  });
});
