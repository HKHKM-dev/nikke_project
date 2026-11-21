// 番号を振り直したブランチのリベースと、ブランチを 1 つにまとめる部分（branchStaleAdds・squashBranch。
// plan/design-auto-conflict-fix.md 8 節）を、一時の git リポジトリで回す
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { branchStaleAdds, nulPaths, pathListArgs, squashBranch } from './pr-prep-lib.ts';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@t',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@t',
  GIT_CONFIG_COUNT: '1',
  GIT_CONFIG_KEY_0: 'core.autocrlf',
  GIT_CONFIG_VALUE_0: 'false',
};
const gitIn = (cwd: string) => (args: readonly string[]) =>
  execFileSync('git', args, { cwd, env: ENV, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

function write(cwd: string, file: string, text: string): void {
  mkdirSync(join(cwd, file, '..'), { recursive: true });
  writeFileSync(join(cwd, file), text);
}

/**
 * main から claude/x を切り、C-0001 を足して C-0002 に振り直した（records:renumber の後の commit）。その間に main も C-0001 を足した。
 * origin/main は main を指す参照で真似る
 */
function setup(): { cwd: string; git: (args: readonly string[]) => string } {
  const cwd = mkdtempSync(join(tmpdir(), 'squash-branch-'));
  dirs.push(cwd);
  const git = gitIn(cwd);
  git(['init', '-q', '-b', 'main']);
  write(cwd, 'a.txt', 'a\n');
  git(['add', '--all']);
  git(['commit', '-q', '-m', 'base']);
  git(['checkout', '-q', '-b', 'claude/x']);
  write(cwd, 'records/claims/C-0001.json', '{"branch":1}\n');
  write(cwd, 'note.txt', 'note\n');
  git(['add', '--all']);
  git(['commit', '-q', '-m', 'add C-0001\n\nCo-Authored-By: x']);
  git(['mv', 'records/claims/C-0001.json', 'records/claims/C-0002.json']);
  git(['commit', '-q', '-m', 'renumber C-0001 to C-0002']);
  git(['checkout', '-q', 'main']);
  write(cwd, 'records/claims/C-0001.json', '{"main":1}\n');
  git(['add', '--all']);
  git(['commit', '-q', '-m', 'main adds C-0001']);
  git(['update-ref', 'refs/remotes/origin/main', 'main']);
  git(['checkout', '-q', 'claude/x']);
  return { cwd, git };
}

const rebase = (cwd: string) =>
  spawnSync('git', ['rebase', 'origin/main'], { cwd, env: { ...ENV, GIT_EDITOR: 'true' }, stdio: 'ignore' }).status;
const pathsIn = (cwd: string) => (args: readonly string[]) => nulPaths(gitIn(cwd)(pathListArgs(args)));

describe('renumbered branch', () => {
  it('conflicts (add/add) when rebased commit by commit', () => {
    const { cwd, git } = setup();
    expect(rebase(cwd)).not.toBe(0);
    expect(git(['diff', '--name-only', '--diff-filter=U'])).toBe('records/claims/C-0001.json');
  });

  it('finds the file added and removed in the branch that main has', () => {
    const { cwd } = setup();
    expect(branchStaleAdds(pathsIn(cwd))).toEqual(['records/claims/C-0001.json']);
  });

  it('rebases cleanly after squashing, keeping the messages', () => {
    const { cwd, git } = setup();
    squashBranch(git, 'add C-0001', 'why');
    expect(git(['rev-list', '--count', 'origin/main..HEAD'])).toBe('1');
    expect(rebase(cwd)).toBe(0);
    expect(git(['rev-list', '--count', 'origin/main..HEAD'])).toBe('1');
    expect(git(['show', '-s', '--format=%B', 'HEAD'])).toBe(
      'add C-0001\n\nwhy\n\nrenumber C-0001 to C-0002\n\nadd C-0001\n\nCo-Authored-By: x',
    );
    expect(git(['ls-tree', '-r', '--name-only', 'HEAD'])).toBe(
      ['a.txt', 'note.txt', 'records/claims/C-0001.json', 'records/claims/C-0002.json'].join('\n'),
    );
    expect(git(['show', 'HEAD:records/claims/C-0001.json'])).toBe('{"main":1}');
  });

  it('finds nothing when no file added in the branch is in main', () => {
    const { cwd, git } = setup();
    git(['update-ref', 'refs/remotes/origin/main', 'main~1']);
    expect(branchStaleAdds(pathsIn(cwd))).toEqual([]);
  });
});
