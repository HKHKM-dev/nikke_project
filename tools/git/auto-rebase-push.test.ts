// 衝突の直しの、鍵の無いジョブが作る bundle と、鍵のあるジョブの push（bundleArgs・pushBundle。plan/design-deploy-key-scope.md 2 節）を、
// 一時の git リポジトリで回す。鍵のあるジョブは main を浅く取り出しただけの作業ツリーで、bundle を取り込んで PR のブランチにだけ push する
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { bundleArgs, type GitRun, pushBundle } from './auto-rebase-lib.ts';

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
  GIT_CONFIG_KEY_0: 'protocol.file.allow',
  GIT_CONFIG_VALUE_0: 'always',
};
const gitIn = (cwd: string) => (args: readonly string[]) =>
  execFileSync('git', args, { cwd, env: ENV, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const runIn =
  (cwd: string): GitRun =>
  (args) => {
    const r = spawnSync('git', args, { cwd, env: ENV, encoding: 'utf8' });
    return { status: r.status ?? 1, output: `${r.stdout ?? ''}${r.stderr ?? ''}` };
  };

function commit(cwd: string, file: string, text: string, message: string): void {
  writeFileSync(join(cwd, file), text);
  gitIn(cwd)(['add', '--all']);
  gitIn(cwd)(['commit', '-q', '-m', message]);
}

/**
 * origin（bare）に main と claude/x がある。prepare の作業ツリーで、claude/x を main の先頭に載せ直した commit を作って bundle にする
 * （pr:prep の取り込みの真似）。push の作業ツリーは、main の 1 つ前の commit を浅く取り出したもの（その後に main が進んだ真似）
 */
function setup() {
  const root = mkdtempSync(join(tmpdir(), 'auto-rebase-push-'));
  dirs.push(root);
  const origin = join(root, 'origin.git');
  const work = join(root, 'work');
  gitIn(root)(['init', '-q', '--bare', '-b', 'main', origin]);
  gitIn(root)(['clone', '-q', origin, work]);
  const git = gitIn(work);
  commit(work, 'a.txt', 'a\n', 'base');
  git(['push', '-q', 'origin', 'HEAD:refs/heads/main']);
  git(['checkout', '-q', '-b', 'claude/x']);
  commit(work, 'b.txt', 'b\n', 'branch');
  git(['push', '-q', 'origin', 'claude/x']);
  const sha = git(['rev-parse', 'HEAD']);
  git(['checkout', '-q', 'main']);
  commit(work, 'c.txt', 'c\n', 'main 2');
  git(['push', '-q', 'origin', 'main']);
  const shallow = join(root, 'push');
  gitIn(root)(['clone', '-q', '--depth', '1', '--branch', 'main', `file://${origin}`, shallow]);
  commit(work, 'd.txt', 'd\n', 'main 3');
  git(['push', '-q', 'origin', 'main']);
  // prepare: claude/x を main の先頭に載せ直す
  git(['fetch', '-q', 'origin']);
  git(['checkout', '-q', '-B', 'claude/x', 'origin/claude/x']);
  git(['rebase', '-q', 'origin/main']);
  const head = git(['rev-parse', 'HEAD']);
  const bundle = join(root, '7.bundle');
  git(bundleArgs(bundle));
  return { origin, work, shallow, sha, head, bundle, remote: `file://${origin}` };
}

const fetchMain = (cwd: string, remote: string) =>
  gitIn(cwd)(['fetch', '-q', '--no-tags', remote, '+refs/heads/main:refs/remotes/origin/main']);

describe('pushBundle', () => {
  it('pushes the rebased branch from a shallow checkout of main', () => {
    const s = setup();
    fetchMain(s.shallow, s.remote);
    const o = { bundle: s.bundle, number: 7, branch: 'claude/x', sha: s.sha, remote: s.remote };
    expect(pushBundle(runIn(s.shallow), o)).toEqual({ head: s.head, outcome: 'pushed' });
    expect(gitIn(s.origin)(['rev-parse', 'refs/heads/claude/x'])).toBe(s.head);
    // bundle には main の先頭からの commit だけが入る（前提は main の先頭の 1 つ）
    const header = readFileSync(s.bundle, 'latin1').split('\n\n')[0]!.split('\n');
    expect(header.filter((l) => l.startsWith('-')).map((l) => l.slice(1, 41))).toEqual([
      gitIn(s.work)(['rev-parse', 'origin/main']),
    ]);
  });
  it('does not overwrite the branch when it moved after the prepare job', () => {
    const s = setup();
    gitIn(s.work)(['checkout', '-q', '-B', 'other', s.sha]);
    commit(s.work, 'e.txt', 'e\n', 'session fix');
    gitIn(s.work)(['push', '-q', 'origin', 'HEAD:refs/heads/claude/x']);
    const moved = gitIn(s.work)(['rev-parse', 'HEAD']);
    fetchMain(s.shallow, s.remote);
    const o = { bundle: s.bundle, number: 7, branch: 'claude/x', sha: s.sha, remote: s.remote };
    expect(pushBundle(runIn(s.shallow), o)).toEqual({ head: s.head, outcome: 'stale' });
    expect(gitIn(s.origin)(['rev-parse', 'refs/heads/claude/x'])).toBe(moved);
  });
  it('throws when the prerequisite commit of the bundle is missing', () => {
    const s = setup();
    // main を取らないと、bundle の前提（prepare の時の main の先頭）が無い
    const o = { bundle: s.bundle, number: 7, branch: 'claude/x', sha: s.sha, remote: s.remote };
    expect(() => pushBundle(runIn(s.shallow), o)).toThrow('bundle を取り込めない');
  });
});
