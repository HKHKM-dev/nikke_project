// トピックブランチを origin/main へ取り込むフック（catch-up.ts。plan/design-workflow-simplification-13.md 2 節）を、一時の bare の
// origin と clone で回す。catchUp は今のディレクトリで git を呼ぶので、別のプロセスで回す。
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const CATCH_UP = fileURLToPath(new URL('./catch-up.ts', import.meta.url));
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
};
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, env: ENV, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

function commit(cwd: string, file: string, text: string, message: string): void {
  writeFileSync(join(cwd, file), text);
  git(cwd, 'add', file);
  git(cwd, 'commit', '-q', '-m', message);
}

/** origin（bare）と、main から claude/x を切って push した clone。その後 main に AGENTS.md を変える commit を足す */
function setup(): { work: string; other: string; origin: string } {
  const root = mkdtempSync(join(tmpdir(), 'catch-up-'));
  dirs.push(root);
  const origin = join(root, 'origin.git');
  git(root, 'init', '-q', '--bare', '-b', 'main', origin);
  const work = join(root, 'work');
  git(root, 'clone', '-q', origin, work);
  git(work, 'checkout', '-q', '-b', 'main');
  commit(work, 'AGENTS.md', 'rule 1\n', 'base');
  git(work, 'push', '-q', '-u', 'origin', 'main');
  git(work, 'checkout', '-q', '-b', 'claude/x');
  commit(work, 'note.txt', 'note\n', 'topic');
  git(work, 'push', '-q', '-u', 'origin', 'claude/x');
  const other = join(root, 'other');
  git(root, 'clone', '-q', origin, other);
  commit(other, 'AGENTS.md', 'rule 2\n', 'main moves');
  git(other, 'push', '-q', 'origin', 'HEAD:main');
  git(work, 'fetch', '-q', 'origin');
  return { work, other, origin };
}

function catchUp(cwd: string): string {
  return execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `const m = await import(${JSON.stringify(CATCH_UP)}); console.log(String(await m.catchUp()));`,
    ],
    { cwd, env: ENV, encoding: 'utf8' },
  ).trim();
}

describe('catchUp', () => {
  it('rebases a clean topic branch onto origin/main and force-pushes it', () => {
    const { work } = setup();
    expect(catchUp(work)).toContain(
      'origin/main の 1 件をリベースで取り込んだ。ブランチは強制 push した。決まりと道具が変わった: AGENTS.md',
    );
    expect(git(work, 'rev-list', '--count', 'HEAD..origin/main')).toBe('0');
    expect(git(work, 'rev-parse', 'origin/claude/x')).toBe(git(work, 'rev-parse', 'HEAD'));
    // 取り込んだ後は何もしない
    expect(catchUp(work)).toBe('null');
  });

  it('leaves a branch that has a pull request', () => {
    const { work, origin } = setup();
    git(origin, 'update-ref', 'refs/pull/1/head', git(work, 'rev-parse', 'HEAD'));
    expect(catchUp(work)).toBe('null');
    expect(git(work, 'rev-list', '--count', 'HEAD..origin/main')).toBe('1');
  });

  it('puts the branch back when a hand-written file conflicts', () => {
    const { work } = setup();
    commit(work, 'AGENTS.md', 'my rule\n', 'topic edits the rule');
    const head = git(work, 'rev-parse', 'HEAD');
    expect(catchUp(work)).toContain('元に戻した（衝突: AGENTS.md）');
    expect(git(work, 'rev-parse', 'HEAD')).toBe(head);
    expect(git(work, 'status', '--porcelain', '--untracked-files=no')).toBe('');
  });

  it('leaves the branch when origin has commits it lacks, or when work is in progress', () => {
    const { work, other } = setup();
    git(other, 'fetch', '-q', 'origin');
    git(other, 'checkout', '-q', '-b', 'claude/x', 'origin/claude/x');
    commit(other, 'other.txt', 'o\n', 'pushed from elsewhere');
    git(other, 'push', '-q', 'origin', 'claude/x');
    git(work, 'fetch', '-q', 'origin');
    expect(catchUp(work)).toContain('手元に無い commit がある');
    git(work, 'reset', '-q', '--hard', 'origin/claude/x');
    writeFileSync(join(work, 'note.txt'), 'editing\n');
    expect(catchUp(work)).toBe('null');
  });
});
