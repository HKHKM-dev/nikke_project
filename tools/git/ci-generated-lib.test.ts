// main への push の CI で生成物を commit して push する決まりごと。git は呼ばず、コマンドごとの結果を決めた偽物で分かれ道を見る。
import { describe, expect, it } from 'vitest';
import { commitGenerated, DEPLOY_KEY_SECRET, isNotFastForward, type GitRun } from './ci-generated-lib.ts';

const SHA = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);
const ok = (stdout = ''): GitRun => ({ status: 0, stdout, stderr: '' });
const REJECTED_FETCH_FIRST = [
  'To github.com:o/r.git',
  ' ! [rejected]        HEAD -> main (fetch first)',
  "error: failed to push some refs to 'github.com:o/r.git'",
].join('\n');

/** git のコマンド（最初の引数。-c の後は commit）ごとの結果を返す偽物と、呼んだコマンドの列 */
function fakeGit(results: Partial<Record<'ls-remote' | 'commit' | 'push', GitRun>>) {
  const calls: string[] = [];
  const git = (args: readonly string[]): GitRun => {
    const command = args[0] === '-c' ? 'commit' : args[0]!;
    calls.push(command);
    return results[command as keyof typeof results] ?? ok();
  };
  return { calls, git };
}

function input(
  git: (args: readonly string[]) => GitRun,
  over: Partial<Parameters<typeof commitGenerated>[0]> = {},
): Parameters<typeof commitGenerated>[0] {
  return {
    generated: ['plan/claims.md'],
    sha: SHA,
    repo: 'o/r',
    key: 'KEY',
    sshEnv: () => ({ GIT_SSH_COMMAND: 'ssh' }),
    git,
    ...over,
  };
}

describe('commitGenerated', () => {
  it('checks the deploy key against origin even when nothing changed', () => {
    const { calls, git } = fakeGit({ 'ls-remote': ok(`${SHA}\trefs/heads/main\n`) });
    expect(commitGenerated(input(git, { generated: [] }))).toMatch('生成物は合っている');
    expect(calls).toEqual(['ls-remote']);
  });

  it('fails naming the secret when the key is missing, before calling git', () => {
    const { calls, git } = fakeGit({});
    expect(() => commitGenerated(input(git, { generated: [], key: '' }))).toThrow(DEPLOY_KEY_SECRET);
    expect(calls).toEqual([]);
  });

  it('fails naming the secret when the key cannot reach origin, even with no diff', () => {
    const { git } = fakeGit({
      'ls-remote': { status: 128, stdout: '', stderr: 'git@github.com: Permission denied (publickey).' },
    });
    expect(() => commitGenerated(input(git, { generated: [] }))).toThrow(
      new RegExp(`${DEPLOY_KEY_SECRET}[\\s\\S]*Permission denied`),
    );
  });

  it('does not commit when origin/main has moved past this commit', () => {
    const { calls, git } = fakeGit({ 'ls-remote': ok(`${OTHER}\trefs/heads/main\n`) });
    expect(commitGenerated(input(git))).toMatch('origin/main が進んでいる（bbbbbbbb）');
    expect(calls).toEqual(['ls-remote']);
  });

  it('commits and pushes the generated files', () => {
    const { calls, git } = fakeGit({ 'ls-remote': ok(`${SHA}\trefs/heads/main\n`) });
    expect(commitGenerated(input(git))).toBe('生成物を作り直して main に push した: plan/claims.md');
    expect(calls).toEqual(['ls-remote', 'commit', 'push']);
  });

  it('gives up quietly when main moved between ls-remote and push', () => {
    const { git } = fakeGit({
      'ls-remote': ok(`${SHA}\trefs/heads/main\n`),
      push: { status: 1, stdout: '', stderr: REJECTED_FETCH_FIRST },
    });
    expect(commitGenerated(input(git))).toMatch('push が断られた');
  });

  it('fails on any other push error', () => {
    const { git } = fakeGit({
      'ls-remote': ok(`${SHA}\trefs/heads/main\n`),
      push: {
        status: 1,
        stdout: '',
        stderr: ' ! [remote rejected] HEAD -> main (push declined due to repository rule violations)',
      },
    });
    expect(() => commitGenerated(input(git))).toThrow('git push が 1 で終わった');
  });
});

describe('isNotFastForward', () => {
  it('takes only the rejections because the branch moved', () => {
    expect(isNotFastForward(REJECTED_FETCH_FIRST)).toBe(true);
    expect(isNotFastForward(' ! [rejected]        HEAD -> main (non-fast-forward)')).toBe(true);
    expect(isNotFastForward(' ! [remote rejected] HEAD -> main (protected branch hook declined)')).toBe(false);
    expect(isNotFastForward('fatal: Could not read from remote repository.')).toBe(false);
  });
});
