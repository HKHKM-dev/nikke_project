// 本物の git で origin/main へのリベースを進める部分。pr-prep.ts と、トピックブランチを取り込むフック（catch-up.ts）が使う。
// 衝突の解き方の判断は pr-prep-lib.ts の finishRebase。
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { finishRebase, mergeAppends, nulPaths, pathListArgs, rebaseOutcome, type RebaseIo } from './pr-prep-lib.ts';

/** git の終了コード（エディタを開かない）。inherit なら git の出力をそのまま見せる */
function gitStatus(cwd: string, args: readonly string[], inherit = false): number {
  return (
    spawnSync('git', args, {
      cwd,
      stdio: inherit ? 'inherit' : 'ignore',
      timeout: 120_000,
      env: { ...process.env, GIT_EDITOR: 'true' },
    }).status ?? 1
  );
}

function gitPaths(cwd: string, args: readonly string[]): string[] {
  return nulPaths(
    execFileSync('git', pathListArgs(args), { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }),
  );
}

export function isRebasing(gitDir: string): boolean {
  return existsSync(join(gitDir, 'rebase-merge')) || existsSync(join(gitDir, 'rebase-apply'));
}

/** cwd の作業ツリーで finishRebase に渡す git の操作。inherit なら git の出力を見せる */
export function gitRebaseIo(cwd: string, gitDir: string, inherit = false): RebaseIo {
  return {
    rebasing: () => isRebasing(gitDir),
    conflicted: () => gitPaths(cwd, ['diff', '--name-only', '--diff-filter=U']),
    takeMain: (paths) => {
      execFileSync('git', ['checkout', '--ours', '--', ...paths], { cwd, stdio: 'ignore' });
      execFileSync('git', ['add', '--', ...paths], { cwd, stdio: 'ignore' });
    },
    keepBothAppends: (paths) =>
      paths.filter((path) => {
        // 基の側を見るために diff3 の形で印を付け直す。直せなければ、ふつうの形に戻して人に渡す
        if (gitStatus(cwd, ['checkout', '--conflict=diff3', '--', path]) !== 0) return false;
        const file = join(cwd, path);
        const merged = mergeAppends(readFileSync(file, 'utf8'));
        if (merged === null) {
          gitStatus(cwd, ['checkout', '--conflict=merge', '--', path]);
          return false;
        }
        writeFileSync(file, merged);
        return gitStatus(cwd, ['add', '--', path]) === 0;
      }),
    rebase: (step) => gitStatus(cwd, ['rebase', step], inherit),
    nothingStaged: () => gitStatus(cwd, ['diff', '--cached', '--quiet']) === 0,
  };
}

/** git rebase origin/main を始める（衝突で止まったら conflicted。続きは finishRebase） */
export function startRebase(cwd: string, gitDir: string, inherit = false): 'clean' | 'conflicted' | 'notStarted' {
  return rebaseOutcome(gitStatus(cwd, ['rebase', 'origin/main'], inherit), isRebasing(gitDir));
}

/** 衝突で止まったリベースを、生成物は main の版で解いて最後まで続け、生成物でない衝突なら元に戻す（catch-up.ts が使う） */
export function rebaseOrAbort(
  cwd: string,
  gitDir: string,
  generatedPaths: readonly string[],
): ReturnType<typeof finishRebase> {
  const end = finishRebase(gitRebaseIo(cwd, gitDir), generatedPaths);
  if (end.kind !== 'done') gitStatus(cwd, ['rebase', '--abort']);
  return end;
}
