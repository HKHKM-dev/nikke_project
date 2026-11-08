// 中身が main に入った origin のブランチの見分け（plan/design-workflow-simplification-10.md 2 節）。木の比べは一時のリポジトリで git を呼ぶ。
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  bringsNothing,
  deleteArgs,
  openPrBranches,
  parseJson,
  parseReflogTime,
  parseRemoteBranches,
  PRUNE_AGE_MS,
  prunableBranches,
  type GitRun,
} from './sync-after-merge-lib.ts';

describe('parseRemoteBranches', () => {
  it('reads the branches of claude/ and antigrav/ with their tip and commit time, and skips the others', () => {
    expect(
      parseRemoteBranches('HEAD\th\t100\nmain\tm\t200\nclaude/a\ta1\t300\nantigrav/b\tb1\t400\nfeature/c\tc1\t500\n'),
    ).toEqual([
      { name: 'claude/a', sha: 'a1', committedAt: 300_000 },
      { name: 'antigrav/b', sha: 'b1', committedAt: 400_000 },
    ]);
  });
});

describe('parseJson・openPrBranches・parseReflogTime', () => {
  it('returns null for what is not JSON (gh printing an error), so the hook does not stop', () => {
    expect(parseJson('[{"a":1}]')).toEqual([{ a: 1 }]);
    expect(parseJson('error: not logged in')).toBeNull();
    expect(parseJson(null)).toBeNull();
  });

  it('keeps both the head and the base of open PRs (deleting the base of a stacked PR closes it)', () => {
    expect(
      openPrBranches(
        '[{"headRefName":"claude/top","baseRefName":"claude/base"},{"headRefName":"claude/x","baseRefName":"main"}]',
      ),
    ).toEqual(new Set(['claude/top', 'claude/base', 'claude/x', 'main']));
    expect(openPrBranches('[]')).toEqual(new Set());
  });

  it('gives null (delete nothing) when the PR list cannot be read', () => {
    expect(openPrBranches(null)).toBeNull();
    expect(openPrBranches('HTTP 502')).toBeNull();
    expect(openPrBranches('{"message":"Bad credentials"}')).toBeNull();
  });

  it('reads the time of the last reflog entry of the remote-tracking branch', () => {
    expect(parseReflogTime('origin/claude/a@{1794145172}')).toBe(1_794_145_172_000);
    expect(parseReflogTime('')).toBeNull();
    expect(parseReflogTime(null)).toBeNull();
  });
});

describe('prunableBranches', () => {
  const now = 10 * PRUNE_AGE_MS;
  const old = now - PRUNE_AGE_MS;
  const branches = [
    { name: 'claude/old-merged', sha: '1', committedAt: old },
    { name: 'claude/new-merged', sha: '2', committedAt: now - PRUNE_AGE_MS + 1 },
    { name: 'claude/old-open', sha: '3', committedAt: old },
    { name: 'claude/old-base', sha: '4', committedAt: old },
    { name: 'claude/old-work', sha: '5', committedAt: old },
    { name: 'claude/just-pushed', sha: '6', committedAt: old },
  ];
  const seen: Record<string, number> = { 'claude/old-merged': old, 'claude/just-pushed': now - 60_000 };
  const keep = new Set(['claude/old-open', 'claude/old-base']);

  it('takes old branches not kept by an open PR whose content is all in main, and asks git only for those', () => {
    const askedSeen: string[] = [];
    const askedTree: string[] = [];
    const seenAt = (name: string) => {
      askedSeen.push(name);
      return seen[name] ?? null;
    };
    const nothingNew = (name: string) => {
      askedTree.push(name);
      return name !== 'claude/old-work';
    };
    expect(prunableBranches(branches, keep, now, seenAt, nothingNew).map((b) => b.name)).toEqual(['claude/old-merged']);
    expect(askedSeen).toEqual(['claude/old-merged', 'claude/old-work', 'claude/just-pushed']);
    expect(askedTree).toEqual(['claude/old-merged', 'claude/old-work']);
  });

  it('does not take a branch made from an old main and pushed just now (its tip commit is old, but the push is new)', () => {
    const pruned = prunableBranches(
      branches,
      keep,
      now,
      (n) => seen[n] ?? null,
      () => true,
    ).map((b) => b.name);
    expect(pruned).not.toContain('claude/just-pushed');
    // reflog の無い（読めない）ものは、コミットの時刻だけで決める
    expect(pruned).toContain('claude/old-work');
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

  it('is false for a branch with no common ancestor with main', () => {
    git(['checkout', '--quiet', '--orphan', 'orphan']);
    git(['rm', '-r', '--quiet', '--cached', '.']);
    commit('a.txt', 'a\n', 'unrelated');
    git(['checkout', '--quiet', '-f', 'main']);
    expect(bringsNothing(git, 'main', 'orphan')).toBe(false);
  });
});

describe('deleteArgs', () => {
  const root = mkdtempSync(join(tmpdir(), 'sync-after-merge-lease-'));
  const at =
    (cwd: string): GitRun =>
    (args) => {
      try {
        return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      } catch {
        return null;
      }
    };
  const top = at(root);
  const ci = ['-c', 'user.name=t', '-c', 'user.email=t@t'];
  top(['init', '--quiet', '--bare', '-b', 'main', 'origin.git']);
  top(['clone', '--quiet', 'origin.git', 'a']);
  top(['clone', '--quiet', 'origin.git', 'b']);
  const a = at(join(root, 'a'));
  const b = at(join(root, 'b'));
  a([...ci, 'commit', '--quiet', '--allow-empty', '-m', 'base']);
  a(['push', '--quiet', 'origin', 'HEAD:refs/heads/main', 'HEAD:refs/heads/claude/x']);
  const remoteHas = () => top(['--git-dir', 'origin.git', 'rev-parse', '--verify', '--quiet', 'refs/heads/claude/x']);

  it('does not delete a branch that someone pushed to after the check, and deletes it at the tip it checked', () => {
    const checked = a(['rev-parse', 'HEAD'])!;
    b(['fetch', '--quiet', 'origin']);
    b(['checkout', '--quiet', '-b', 'claude/x', 'origin/claude/x']);
    b([...ci, 'commit', '--quiet', '--allow-empty', '-m', 'new work']);
    b(['push', '--quiet', 'origin', 'claude/x']);
    const pushed = b(['rev-parse', 'HEAD'])!;

    expect(a(deleteArgs({ name: 'claude/x', sha: checked, committedAt: 0 }))).toBeNull();
    expect(remoteHas()).toBe(pushed);

    a(['fetch', '--quiet', 'origin']);
    expect(a(deleteArgs({ name: 'claude/x', sha: pushed, committedAt: 0 }))).not.toBeNull();
    expect(remoteHas()).toBeNull();
  });
});
