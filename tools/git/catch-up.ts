// 撮影待ちなどで日をまたいだトピックブランチを origin/main へ取り込む（plan/design-workflow-simplification-13.md 2 節）。
// sync-after-merge.ts の --catch-up（SessionStart・UserPromptSubmit のフック）が、origin を fetch できたときに呼ぶ。
// shouldCatchUp に合うブランチ（claude/。作業中の変更が無く、リベースの途中でも pr:prep の途中でもなく、マージ済みでなく、origin/main が
// 進んでいる）をリベースする。生成物の衝突は main の版を取り、生成物でないファイルが衝突したら元に戻して知らせる。追跡先があれば、
// リベースの前の追跡先の sha を lease にして強制 push する（records:new・取り込みの道具の push が早送りで落ちないように）。
// origin のブランチに手元に無い commit があるときは、上書きしないよう取り込まない。
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { catchUpMessage, RULE_PATHS, shouldCatchUp } from './sync-after-merge-lib.ts';

function git(args: readonly string[]): string | null {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 20_000 }).trim();
  } catch {
    return null;
  }
}

const gitOk = (args: readonly string[]): boolean =>
  spawnSync('git', args, { stdio: 'ignore', timeout: 60_000 }).status === 0;

function readText(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

/** 取り込んだ・取り込めなかったときの知らせ。何もしなければ null */
export async function catchUp(): Promise<string | null> {
  const branch = git(['symbolic-ref', '--short', '-q', 'HEAD']);
  if (!branch?.startsWith('claude/')) return null;
  const ref = `refs/heads/${branch}`;
  const track = git(['for-each-ref', '--format=%(upstream:track)', ref]);
  const behind = Number(git(['rev-list', '--count', 'HEAD..origin/main']) ?? 0);
  const gitDir = git(['rev-parse', '--absolute-git-dir']);
  if (gitDir === null || track === '[gone]' || behind === 0) return null;
  // リベースの部分は core を読むので、要るときだけ読む
  const { isRebasing, prPrepRunning, rebaseOrAbort, startRebase } = await import('./git-rebase.ts');
  const plan = {
    branch,
    track,
    behind,
    busy: isRebasing(gitDir) || prPrepRunning(gitDir, readText),
    clean: git(['status', '--porcelain', '--untracked-files=no']) === '',
  };
  if (!shouldCatchUp(plan)) return null;
  const upstream = git(['rev-parse', '-q', '--verify', `${branch}@{upstream}`]);
  if (upstream !== null && git(['rev-list', '--count', `HEAD..${upstream}`]) !== '0')
    return `origin の ${branch} に手元に無い commit があるので、main を取り込まなかった（git pull --rebase で揃えてから進める）`;
  const oldBase = git(['merge-base', 'HEAD', 'origin/main']);
  if (oldBase === null) return null;
  const outcome = startRebase(process.cwd(), gitDir);
  if (outcome === 'notStarted')
    return 'main を取り込めなかった（git rebase が始まらなかった）。npm run pr:prep で取り込む';
  if (outcome === 'conflicted') {
    const { GENERATED_PATHS } = await import('../../packages/core/scripts/records-data.ts');
    const end = rebaseOrAbort(process.cwd(), gitDir, GENERATED_PATHS);
    if (end.kind !== 'done') {
      const why = end.kind === 'conflict' ? `衝突: ${end.files.join('・')}` : end.message;
      return `main を取り込めなかったので元に戻した（${why}）。npm run pr:prep で取り込み、衝突を直す`;
    }
  }
  let push: 'pushed' | 'noUpstream' | 'failed' = 'noUpstream';
  if (upstream !== null)
    push = gitOk(['push', '--quiet', `--force-with-lease=${branch}:${upstream}`, 'origin', `HEAD:${branch}`])
      ? 'pushed'
      : 'failed';
  const changed = (git(['diff', '--name-only', oldBase, 'origin/main', '--', ...RULE_PATHS, 'package-lock.json']) ?? '')
    .split('\n')
    .filter(Boolean);
  return catchUpMessage({
    behind,
    oldBase: oldBase.slice(0, 12),
    changed: changed.filter((p) => p !== 'package-lock.json'),
    push,
    lockChanged: changed.includes('package-lock.json'),
  });
}
