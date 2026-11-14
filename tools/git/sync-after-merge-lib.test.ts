// 中身が main に入った origin のブランチの見分け（plan/design-workflow-simplification-10.md 2 節）。木の比べは一時のリポジトリで git を呼ぶ。
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  bringsNothing,
  catchUpMessage,
  ciSettled,
  deleteArgs,
  mergeWaitState,
  openPrBranches,
  parseJson,
  parseReflogTime,
  parseRemoteBranches,
  PRUNE_AGE_MS,
  prunableBranches,
  seenAt,
  shouldCatchUp,
  shouldWaitMerge,
  WAIT_CI_MS,
  type GitRun,
} from './sync-after-merge-lib.ts';

/** 一時のリポジトリ cwd で git を呼ぶ（失敗したら null） */
const gitAt =
  (cwd: string): GitRun =>
  (args) => {
    try {
      return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      return null;
    }
  };
/** テストのコミットの作者 */
const AUTHOR = ['-c', 'user.name=t', '-c', 'user.email=t@t'];

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
  const git = gitAt(dir);
  const commit = (file: string, text: string, message: string) => {
    writeFileSync(join(dir, file), text);
    git(['add', file]);
    git([...AUTHOR, 'commit', '--quiet', '-m', message]);
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
  const top = gitAt(root);
  top(['init', '--quiet', '--bare', '-b', 'main', 'origin.git']);
  top(['clone', '--quiet', 'origin.git', 'a']);
  top(['clone', '--quiet', 'origin.git', 'b']);
  const a = gitAt(join(root, 'a'));
  const b = gitAt(join(root, 'b'));
  a([...AUTHOR, 'commit', '--quiet', '--allow-empty', '-m', 'base']);
  a(['push', '--quiet', 'origin', 'HEAD:refs/heads/main', 'HEAD:refs/heads/claude/x']);
  const remoteHas = () => top(['--git-dir', 'origin.git', 'rev-parse', '--verify', '--quiet', 'refs/heads/claude/x']);

  it('does not delete a branch that someone pushed to after the check, and deletes it at the tip it checked', () => {
    const checked = a(['rev-parse', 'HEAD'])!;
    b(['fetch', '--quiet', 'origin']);
    b(['checkout', '--quiet', '-b', 'claude/x', 'origin/claude/x']);
    b([...AUTHOR, 'commit', '--quiet', '--allow-empty', '-m', 'new work']);
    b(['push', '--quiet', 'origin', 'claude/x']);
    const pushed = b(['rev-parse', 'HEAD'])!;

    expect(a(deleteArgs({ name: 'claude/x', sha: checked, committedAt: 0 }))).toBeNull();
    expect(remoteHas()).toBe(pushed);

    a(['fetch', '--quiet', 'origin']);
    // reflog から、fetch で今の先端を見た時刻を読む。追跡ブランチの無い名前は null
    expect(Math.abs(seenAt(a, 'origin/claude/x')! - Date.now())).toBeLessThan(60_000);
    expect(seenAt(a, 'origin/claude/none')).toBeNull();
    expect(a(deleteArgs({ name: 'claude/x', sha: pushed, committedAt: 0 }))).not.toBeNull();
    expect(remoteHas()).toBeNull();
  });
});

describe('shouldWaitMerge', () => {
  const now = Date.parse('2026-11-10T12:00:00Z');
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it('waits for an open PR only while auto-merge is reserved', () => {
    expect(shouldWaitMerge({ number: 1, state: 'OPEN', autoMergeRequest: { mergeMethod: 'SQUASH' } }, now)).toBe(true);
    expect(shouldWaitMerge({ number: 1, state: 'OPEN', autoMergeRequest: null }, now)).toBe(false);
  });

  it('waits for a merged PR while the CI on main may still be committing the generated files', () => {
    expect(shouldWaitMerge({ number: 1, state: 'MERGED', mergedAt: ago(WAIT_CI_MS - 1000) }, now)).toBe(true);
    expect(shouldWaitMerge({ number: 1, state: 'MERGED', mergedAt: ago(WAIT_CI_MS + 1000) }, now)).toBe(false);
  });

  it('does not wait for a closed PR, a missing PR or an unreadable answer', () => {
    expect(shouldWaitMerge({ number: 1, state: 'CLOSED', autoMergeRequest: {} }, now)).toBe(false);
    expect(shouldWaitMerge({ state: 'OPEN', autoMergeRequest: {} }, now)).toBe(false);
    expect(shouldWaitMerge(null, now)).toBe(false);
  });
});

describe('mergeWaitState', () => {
  it('reads merged, waiting (also when gh failed) and stopped', () => {
    expect(mergeWaitState({ state: 'MERGED', autoMergeRequest: {} })).toBe('merged');
    expect(mergeWaitState({ state: 'OPEN', autoMergeRequest: {} })).toBe('wait');
    expect(mergeWaitState(null)).toBe('wait');
    expect(mergeWaitState({ state: 'OPEN', autoMergeRequest: null })).toBe('stop');
    expect(mergeWaitState({ state: 'CLOSED' })).toBe('stop');
  });
});

describe('ciSettled', () => {
  it('is settled only when the commit has runs and all of them completed', () => {
    expect(ciSettled('[{"status":"completed"},{"status":"completed"}]')).toBe(true);
    expect(ciSettled('[{"status":"completed"},{"status":"in_progress"}]')).toBe(false);
    expect(ciSettled('[]')).toBe(false);
    expect(ciSettled(null)).toBe(false);
    expect(ciSettled('not json')).toBe(false);
  });
});

describe('shouldCatchUp', () => {
  const plan = { branch: 'claude/x', clean: true, busy: false, track: '[behind 3]', behind: 3 };
  it('catches up a clean Claude Code topic branch that main has moved past', () => {
    expect(shouldCatchUp(plan)).toBe(true);
    expect(shouldCatchUp({ ...plan, track: '' })).toBe(true);
  });
  it('leaves other branches, work in progress, a rebase or pr:prep in progress, merged branches and up-to-date branches', () => {
    expect(shouldCatchUp({ ...plan, branch: 'main' })).toBe(false);
    expect(shouldCatchUp({ ...plan, branch: 'antigrav/x' })).toBe(false);
    expect(shouldCatchUp({ ...plan, branch: null })).toBe(false);
    expect(shouldCatchUp({ ...plan, clean: false })).toBe(false);
    expect(shouldCatchUp({ ...plan, busy: true })).toBe(false);
    expect(shouldCatchUp({ ...plan, track: '[gone]' })).toBe(false);
    expect(shouldCatchUp({ ...plan, behind: 0 })).toBe(false);
  });
});

describe('catchUpMessage', () => {
  it('says what changed and what to do next', () => {
    const base = { behind: 4, oldBase: 'abc123', changed: [], push: 'pushed' as const, lockChanged: false };
    expect(catchUpMessage(base)).toBe('origin/main の 4 件をリベースで取り込んだ。ブランチは強制 push した');
    const full = catchUpMessage({ ...base, changed: ['AGENTS.md'], push: 'failed', lockChanged: true });
    expect(full).toContain('push は落ちた');
    expect(full).toContain('git diff abc123 origin/main -- AGENTS.md');
    expect(full).toContain('npm ci');
    expect(catchUpMessage({ ...base, changed: ['tools/x.ts'] })).not.toContain('AGENTS.md');
    expect(catchUpMessage({ ...base, changed: ['.claude/settings.json'] })).toContain('フックの変更は再開から効く');
  });
});
